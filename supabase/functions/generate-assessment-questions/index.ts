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
const API_KEY =
  Deno.env.get('GEMINI_API_KEY') ||
  Deno.env.get('GOOGLE_AI_STUDIO_API_KEY') ||
  Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') ||
  Deno.env.get('GOOGLE_API_KEY');

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
    .filter((item) => item.prompt.length > 0);

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
    console.error('CRITICAL: Missing Gemini API key');
    return jsonResponse({ error: 'Missing Gemini API key in Supabase function secrets.' }, 500);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    console.log('Processing request...');
    const body = await request.json();
    console.log('Request body received:', { moduleNo: body?.moduleNo, questionCount: body?.questionCount });
    const moduleNo = Number(body?.moduleNo || 0);
    const questionCount = Math.min(Math.max(Number(body?.questionCount || 5), 1), 10);
    const context = String(body?.context || '').trim();
    const assessmentTitle = String(body?.assessmentTitle || '').trim();
    const assessmentType = String(body?.assessmentType || '').trim();
    const targetQuestionNo = Number(body?.targetQuestionNo || 0);
    const existingPrompt = String(body?.existingPrompt || '').trim();
    const difficultyGuidance = String(body?.difficultyGuidance || '').trim();
    const existingQuestions = normalizeExistingQuestions(body?.existingQuestions);
    const existingQuestionText = existingQuestions
      .map((question, index) => {
        const label = [
          question.assessmentType || 'Assessment',
          question.question_no ? `Q${question.question_no}` : `Item ${index + 1}`,
        ].filter(Boolean).join(' ');
        return `${label}: ${question.prompt}${question.prompt_tl ? ` / ${question.prompt_tl}` : ''}`;
      })
      .join('\n');

    if (!moduleNo) {
      return jsonResponse({ error: 'moduleNo is required.' }, 400);
    }

    if (!context) {
      return jsonResponse({ error: 'context is required.' }, 400);
    }

    const prompt = [
      `You are generating assessment questions for Module ${moduleNo}.`,
      assessmentTitle ? `Assessment title: ${assessmentTitle}.` : '',
      assessmentType ? `Assessment type: ${assessmentType}.` : '',
      targetQuestionNo ? `Generate a replacement draft specifically for question ${targetQuestionNo}.` : '',
      existingPrompt ? `Use a different angle and wording from this existing question: ${existingPrompt}` : '',
      difficultyGuidance,
      `Create exactly ${questionCount} multiple-choice questions grounded only in the source material below.`,
      'Do not generate any question that is identical, lightly reworded, or semantically near-duplicate to any existing module question or to another question in this response.',
      'Use different wording, examples, answer choices, scenarios, and question structures across the entire response.',
      'Keep the correct answer unambiguous and vary the correct option position instead of using a predictable pattern.',
      'Every question must include both English and Tagalog (Filipino) content.',
      'The prompt_tl, explanation_tl, and option_text_tl fields are required and must be natural Tagalog translations of the same English question, choices, answer, and explanation.',
      'Do not create a separate Tagalog question with different meaning, different choices, or a different correct answer.',
      'Do not leave any *_tl field blank, and do not copy the English text into the Tagalog fields.',
      'Return JSON only, with this exact shape: {"questions":[{"question_type":"multiple_choice","prompt":"...","prompt_tl":"...","explanation":"...","explanation_tl":"...","options":[{"option_key":"A","option_text":"...","option_text_tl":"...","is_correct":true,"display_order":1},{"option_key":"B",...},{"option_key":"C",...},{"option_key":"D",...}]}]}',
      'Each question must have exactly 4 answer choices, with exactly 1 correct answer.',
      'Keep options plausible and avoid duplicate wording.',
      'Do not use markdown, code fences, or explanations outside the JSON.',
      existingQuestionText ? `Existing module questions to avoid:\n${existingQuestionText}` : '',
      'Source material:',
      context,
    ].filter(Boolean).join('\n\n');

    console.log(`Calling Gemini API with model: ${DEFAULT_MODEL}, context length: ${context.length}`);
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
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    };
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
    let response: Response | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      response = await fetch(geminiUrl, geminiRequest);
      if (![502, 503, 504].includes(response.status) || attempt === 2) break;

      console.warn(`Temporary Gemini ${response.status}; retrying once.`);
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    if (!response) {
      return jsonResponse({ error: 'The AI question service is temporarily unavailable.' }, 503);
    }

    console.log(`Gemini API response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini request failed with status ${response.status}: ${errorText}`);
      const retryAfterSeconds = response.status === 429 ? extractRetryDelaySeconds(errorText) : null;
      const isTemporaryFailure = [502, 503, 504].includes(response.status);
      return jsonResponse({
        error: isTemporaryFailure
          ? 'The AI question service is temporarily unavailable. Please try again.'
          : `Gemini request failed: ${errorText}`,
        retryAfterSeconds,
      }, response.status);
    }

    const result = await response.json();
    console.log('Parsed Gemini response successfully');
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
      console.error('Gemini returned invalid JSON:', parseError);
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
    console.error('Unhandled error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
