import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { corsHeaders } from '../_shared/cors.ts';

type GeneratedOption = {
  option_key: string;
  option_text: string;
  option_text_tl?: string;
  is_correct: boolean;
  display_order?: number;
};

type GeneratedQuestion = {
  question_type: 'multiple_choice';
  prompt: string;
  prompt_tl?: string;
  explanation?: string;
  explanation_tl?: string;
  options: GeneratedOption[];
};

type ExistingQuestionReference = {
  question_no?: number | null;
  assessmentType?: string;
  prompt?: string;
  prompt_tl?: string;
};

const DEFAULT_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
// Measured: with default "thinking", gemini-2.5-flash spent 7-10k hidden reasoning
// tokens per request (~50-60 s) and once overflowed maxOutputTokens, truncating the
// JSON. Grounded MCQ drafting doesn't need it, so it is switched off for 2.5 Flash
// models (the only family that accepts a zero thinking budget).
const SUPPORTS_ZERO_THINKING = /^gemini-2\.5-flash/i.test(DEFAULT_MODEL);
// Keeps the edge function well under its wall-clock limit so the admin gets a
// clear error instead of an indefinite spinner.
const GEMINI_TIMEOUT_MS = 55000;

// Structured output: Gemini must return exactly this shape, so no prompt tokens are
// spent describing it and no output tokens on constant fields (question_type,
// display_order are filled in by normalizeQuestions).
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING' },
          prompt_tl: { type: 'STRING' },
          options: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                option_key: { type: 'STRING' },
                option_text: { type: 'STRING' },
                option_text_tl: { type: 'STRING' },
                is_correct: { type: 'BOOLEAN' },
              },
              required: ['option_key', 'option_text', 'option_text_tl', 'is_correct'],
              propertyOrdering: ['option_key', 'option_text', 'option_text_tl', 'is_correct'],
            },
          },
          explanation: { type: 'STRING' },
          explanation_tl: { type: 'STRING' },
        },
        required: ['prompt', 'prompt_tl', 'options', 'explanation', 'explanation_tl'],
        propertyOrdering: ['prompt', 'prompt_tl', 'options', 'explanation', 'explanation_tl'],
      },
    },
  },
  required: ['questions'],
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const API_KEY =
  Deno.env.get('GEMINI_API_KEY') ||
  Deno.env.get('GOOGLE_AI_STUDIO_API_KEY') ||
  Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') ||
  Deno.env.get('GOOGLE_API_KEY');

const serviceClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

const authenticateAdmin = async (request: Request) => {
  const authHeader = request.headers.get('Authorization') || '';
  const tokenMatch = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!tokenMatch || !SUPABASE_URL || !SUPABASE_ANON_KEY || !serviceClient) {
    return false;
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
  if (authError || !userData?.user?.id) return false;

  const { data: admin, error: adminError } = await serviceClient
    .from('admin')
    .select('admin_id')
    .eq('admin_id', userData.user.id)
    .eq('role', 'admin')
    .ilike('status', 'active')
    .maybeSingle();

  return !adminError && Boolean(admin?.admin_id);
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const extractRetryDelaySeconds = (value: string) => {
  try {
    if (!value) return null;
    if (typeof value === 'string') {
      const m = value.match(/retryDelay\"\s*:\s*\"(\d+)s\"/i) || value.match(/retryDelay\s*[:=]\s*(\d+)s/i);
      if (m) return Number(m[1]);
      const m2 = value.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
      if (m2) return Number(m2[1]);
    }
  } catch (e) {
    // ignore
  }
  return null;
};

const stripCodeFences = (value: string) => value
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/i, '')
  .trim();

const parseJsonPayload = (value: string) => {
  const cleaned = stripCodeFences(value);
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const startIndex = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);

  if (startIndex > 0) {
    const candidate = cleaned.slice(startIndex);
    return JSON.parse(candidate);
  }

  return JSON.parse(cleaned);
};

const normalizeText = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stopWords = new Set([
  'about', 'after', 'also', 'ang', 'ano', 'are', 'bakit', 'before', 'best',
  'can', 'choose', 'correct', 'dapat', 'does', 'during', 'each', 'from',
  'habang', 'how', 'into', 'is', 'ito', 'iyon', 'kapag', 'kung', 'may',
  'mga', 'module', 'most', 'ng', 'nito', 'one', 'pag', 'para', 'question',
  'sa', 'should', 'that', 'the', 'their', 'this', 'to', 'what', 'when',
  'where', 'which', 'why', 'with', 'you', 'your',
]);

const tokenizeText = (value = '') => normalizeText(value)
  .split(' ')
  .map((token) => token.replace(/(ing|ed|es|s)$/i, '').replace(/(han|hin|in|an)$/i, ''))
  .filter((token) => token.length > 2 && !stopWords.has(token));

const buildBigrams = (tokens: string[]) => {
  const bigrams: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return bigrams;
};

const getSetOverlapScore = (leftItems: string[], rightItems: string[]) => {
  const leftSet = new Set(leftItems);
  const rightSet = new Set(rightItems);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  leftSet.forEach((item) => {
    if (rightSet.has(item)) intersection += 1;
  });

  return intersection / Math.min(leftSet.size, rightSet.size);
};

const getComparableQuestionText = (question: Partial<GeneratedQuestion> | ExistingQuestionReference) => [
  question.prompt,
  question.prompt_tl,
].filter(Boolean).join(' ');

const getSimilarityScore = (
  leftQuestion: Partial<GeneratedQuestion> | ExistingQuestionReference,
  rightQuestion: Partial<GeneratedQuestion> | ExistingQuestionReference,
) => {
  const leftText = normalizeText(getComparableQuestionText(leftQuestion));
  const rightText = normalizeText(getComparableQuestionText(rightQuestion));

  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;

  const shorter = leftText.length <= rightText.length ? leftText : rightText;
  const longer = leftText.length > rightText.length ? leftText : rightText;
  if (shorter.length >= 24 && longer.includes(shorter)) return 0.94;

  const leftTokens = tokenizeText(leftText);
  const rightTokens = tokenizeText(rightText);
  const tokenOverlap = getSetOverlapScore(leftTokens, rightTokens);
  const phraseOverlap = getSetOverlapScore(buildBigrams(leftTokens), buildBigrams(rightTokens));

  return Math.max(tokenOverlap, phraseOverlap);
};

const isTooSimilar = (
  candidate: Partial<GeneratedQuestion>,
  existingQuestions: Array<Partial<GeneratedQuestion> | ExistingQuestionReference>,
) => existingQuestions.some((existingQuestion) => {
  const score = getSimilarityScore(candidate, existingQuestion);
  const candidateTokens = tokenizeText(getComparableQuestionText(candidate));
  const existingTokens = tokenizeText(getComparableQuestionText(existingQuestion));
  const enoughSharedTerms = Math.min(candidateTokens.length, existingTokens.length) >= 4;

  return score >= 0.82 || (enoughSharedTerms && score >= 0.72);
});

const normalizeExistingQuestions = (value: unknown): ExistingQuestionReference[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return { prompt: item };
      }

      const row = item as ExistingQuestionReference;
      return {
        question_no: Number.isFinite(Number(row?.question_no)) ? Number(row.question_no) : null,
        assessmentType: String(row?.assessmentType || '').trim(),
        prompt: String(row?.prompt || '').trim(),
        prompt_tl: String(row?.prompt_tl || '').trim(),
      };
    })
    .filter((item) => item.prompt || item.prompt_tl)
    .slice(0, 40);
};

const normalizeQuestions = (payload: unknown): GeneratedQuestion[] => {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { questions?: unknown })?.questions)
      ? (payload as { questions: unknown[] }).questions
      : [];

  const questions = source
    .map((item) => item as Partial<GeneratedQuestion>)
    .map((item) => ({
      question_type: 'multiple_choice' as const,
      prompt: String(item.prompt || '').trim(),
      prompt_tl: String(item.prompt_tl || '').trim(),
      explanation: String(item.explanation || '').trim(),
      explanation_tl: String(item.explanation_tl || '').trim(),
      options: Array.isArray(item.options)
        ? item.options.map((option, index) => ({
          option_key: String(option?.option_key || '').trim().toUpperCase(),
          option_text: String(option?.option_text || '').trim(),
          option_text_tl: String(option?.option_text_tl || '').trim(),
          is_correct: Boolean(option?.is_correct),
          display_order: Number.isFinite(Number(option?.display_order)) ? Number(option?.display_order) : index + 1,
        })).filter((option) => option.option_key && option.option_text)
        : [],
    }))
    // Drop incomplete items (no stem, too few choices, not exactly one correct answer)
    // so only reviewable drafts reach the admin; the client tops up any shortfall.
    .filter((item) => item.prompt.length > 0
      && item.options.length >= 2
      && item.options.filter((option) => option.is_correct).length === 1);

  return questions;
};

const filterUniqueQuestions = (
  questions: GeneratedQuestion[],
  existingQuestions: ExistingQuestionReference[],
  questionCount: number,
) => {
  const accepted: GeneratedQuestion[] = [];

  questions.forEach((question) => {
    if (accepted.length >= questionCount) return;

    if (!isTooSimilar(question, [...existingQuestions, ...accepted])) {
      accepted.push(question);
    }
  });

  return accepted;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!API_KEY) {
    console.error('Assessment generation is missing its provider configuration.');
    return jsonResponse({ error: 'The AI question service is temporarily unavailable.' }, 503);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const startedAt = Date.now();
  try {
    if (!(await authenticateAdmin(request))) {
      return jsonResponse({ error: 'Administrator access is required.' }, 403);
    }

    const body = await request.json();
    const moduleNo = Number(body?.moduleNo || 0);
    // Cap raised from 10 to 14 so the client can request a small duplicate-absorbing
    // buffer in a single call instead of looping additional sequential requests.
    const requestedQuestionCount = body?.questionCount == null
      ? 5
      : Number(body.questionCount);
    const questionCount = requestedQuestionCount;
    const context = String(body?.context || '').trim();
    const assessmentTitle = String(body?.assessmentTitle || '').trim();
    const assessmentType = String(body?.assessmentType || '').trim();
    const targetQuestionNo = Number(body?.targetQuestionNo || 0);
    const existingPrompt = String(body?.existingPrompt || '').trim();
    const difficultyGuidance = String(body?.difficultyGuidance || '').trim();
    // Set when the client splits one generation into parallel batches, so each batch
    // explores different topics instead of converging on the same questions.
    const batchFocus = String(body?.batchFocus || '').trim();
    const existingQuestions = normalizeExistingQuestions(body?.existingQuestions);
    const existingQuestionText = existingQuestions
      .map((question, index) => {
        const label = [
          question.assessmentType || 'Assessment',
          question.question_no ? `Q${question.question_no}` : `Item ${index + 1}`,
        ].filter(Boolean).join(' ');
        // English only: the model just needs the topic to avoid; the Filipino text is
        // still used by the server-side similarity filter below.
        return `${label}: ${question.prompt || question.prompt_tl}`;
      })
      .join('\n');

    if (!Number.isInteger(moduleNo) || moduleNo < 1 || moduleNo > 1000) {
      return jsonResponse({ error: 'moduleNo is required.' }, 400);
    }

    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 14) {
      return jsonResponse({ error: 'questionCount must be between 1 and 14.' }, 400);
    }

    if (!context) {
      return jsonResponse({ error: 'context is required.' }, 400);
    }
    if (context.length > 50000 || assessmentTitle.length > 240
      || assessmentType.length > 80 || existingPrompt.length > 5000
      || difficultyGuidance.length > 5000 || batchFocus.length > 500) {
      return jsonResponse({ error: 'The assessment input is too large.' }, 413);
    }

    const prompt = [
      `Write fire safety assessment questions for Module ${moduleNo}${assessmentTitle ? ` (${assessmentTitle})` : ''}${assessmentType ? `, ${assessmentType}` : ''}.`,
      targetQuestionNo ? `This is a replacement for question ${targetQuestionNo}.` : '',
      existingPrompt ? `Use a different angle and wording from this existing question: ${existingPrompt}` : '',
      difficultyGuidance,
      batchFocus,
      [
        `Rules:`,
        `- Create exactly ${questionCount} multiple-choice questions grounded only in the source material.`,
        '- Each has exactly 4 options (keys A-D), exactly 1 correct, unambiguous answer. Vary the correct option position.',
        '- No question may be identical or a near-duplicate of an existing question or another question in this response; vary wording, scenarios, and structure.',
        '- Options must be plausible, short (under 12 words), parallel, and similar in length; the correct one must not stand out as longer or more detailed.',
        '- Do not reveal the answer in the stem.',
        '- Stems are read on phones: one direct question, 15-25 words (max 30). State any situation in one short clause. No filler such as "According to the module" or "An individual is attempting to".',
        '- Simple everyday words, but keep fire safety terms accurate (PASS, Class A/B/C/D/K, extinguisher, nozzle). Brevity must not lower the difficulty.',
        '- Explanation: 1-2 short sentences.',
        '- *_tl fields: the same question, options, correct answer, and explanation in natural, conversational Tagalog (not word-for-word, never blank, never copied English). Keep common English fire terms (extinguisher, PASS, Class C, nozzle). About as short as the English.',
      ].join('\n'),
      existingQuestionText ? `Existing questions to avoid:\n${existingQuestionText}` : '',
      `Source material:\n${context}`,
    ].filter(Boolean).join('\n\n');

    const geminiRequest = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.72,
          // ~500 output tokens per bilingual question; 8192 leaves ample headroom for
          // the 14-question cap now that no thinking tokens share this budget.
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          ...(SUPPORTS_ZERO_THINKING ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    };
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
    let response: Response | null = null;
    const authMs = Date.now() - startedAt;
    const geminiStartedAt = Date.now();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = await fetch(geminiUrl, {
          ...geminiRequest,
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS - (Date.now() - geminiStartedAt)),
        });
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'TimeoutError') {
          console.error(`[timing] Gemini timed out after ${Date.now() - geminiStartedAt} ms`);
          return jsonResponse({ error: 'The AI took too long to respond. Please try again.' }, 504);
        }
        throw fetchError;
      }
      // Only retry quick transient failures; a retry must still fit inside the timeout.
      if (![502, 503].includes(response.status) || attempt === 2
        || Date.now() - geminiStartedAt > GEMINI_TIMEOUT_MS / 2) break;

      console.warn(`Temporary Gemini ${response.status}; retrying once.`);
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    if (!response) {
      return jsonResponse({ error: 'The AI question service is temporarily unavailable.' }, 503);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini request failed', { status: response.status });
      const retryAfterSeconds = response.status === 429 ? extractRetryDelaySeconds(errorText) : null;
      const isTemporaryFailure = [502, 503, 504].includes(response.status);
      return jsonResponse({
        error: isTemporaryFailure
          ? 'The AI question service is temporarily unavailable. Please try again.'
          : 'The AI question service rejected the request. Please try again.',
        retryAfterSeconds,
      }, response.status);
    }

    const result = await response.json();
    const usage = result?.usageMetadata || {};
    console.log(`[timing] model=${DEFAULT_MODEL} count=${questionCount} authMs=${authMs} geminiMs=${Date.now() - geminiStartedAt} promptTokens=${usage.promptTokenCount ?? '-'} thoughtTokens=${usage.thoughtsTokenCount ?? 0} outputTokens=${usage.candidatesTokenCount ?? '-'} finish=${result?.candidates?.[0]?.finishReason ?? '-'}`);
    const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part?.text || '').join('') || '';

    if (!text) {
      console.error('Empty response from Gemini');
      return jsonResponse({ error: 'The AI service returned an empty response.' }, 500);
    }

    console.log(`Parsing JSON from response, text length: ${text.length}`);
    let parsed;
    try {
      parsed = parseJsonPayload(text);
    } catch (parseError) {
      console.error('Gemini returned invalid JSON', { errorType: parseError?.constructor?.name || 'unknown' });
      return jsonResponse({ error: 'The AI returned an incomplete response. Please generate again.' }, 502);
    }
    const questions = filterUniqueQuestions(normalizeQuestions(parsed), existingQuestions, questionCount);

    console.log(`Generated ${questions.length} questions`);
    if (questions.length === 0) {
      console.error('No usable questions after normalization');
      return jsonResponse({ error: 'The AI response did not contain usable questions.' }, 500);
    }

    console.log('Success: returning generated questions');
    return jsonResponse({ data: { questions }, error: null });
  } catch (error) {
    console.error('Unhandled assessment generation error', {
      errorType: error instanceof Error ? error.constructor.name : 'unknown',
    });
    return jsonResponse({ error: 'The AI question service is temporarily unavailable.' }, 500);
  }
});
