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

const normalizeQuestions = (payload: unknown, questionCount: number): GeneratedQuestion[] => {
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
    .filter((item) => item.prompt.length > 0)
    .slice(0, questionCount);

  return questions;
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
      `Create exactly ${questionCount} multiple-choice questions grounded only in the source material below.`,
      'Every question must include both English and Tagalog (Filipino) content.',
      'The prompt_tl, explanation_tl, and option_text_tl fields are required and must be natural Tagalog translations.',
      'Do not leave any *_tl field blank, and do not copy the English text into the Tagalog fields.',
      'Return JSON only, with this exact shape: {"questions":[{"question_type":"multiple_choice","prompt":"...","prompt_tl":"...","explanation":"...","explanation_tl":"...","options":[{"option_key":"A","option_text":"...","option_text_tl":"...","is_correct":true,"display_order":1},{"option_key":"B",...},{"option_key":"C",...},{"option_key":"D",...}]}]}',
      'Each question must have exactly 4 answer choices, with exactly 1 correct answer.',
      'Make the questions clear, practical, and different in style.',
      'Keep options plausible and avoid duplicate wording.',
      'Do not use markdown, code fences, or explanations outside the JSON.',
      'Source material:',
      context,
    ].filter(Boolean).join('\n\n');

    console.log(`Calling Gemini API with model: ${DEFAULT_MODEL}, context length: ${context.length}`);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`, {
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
          temperature: 0.6,
          maxOutputTokens: 4096,
        },
      }),
    });

    console.log(`Gemini API response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini request failed with status ${response.status}: ${errorText}`);
      const retryAfterSeconds = response.status === 429 ? extractRetryDelaySeconds(errorText) : null;
      return jsonResponse({ error: `Gemini request failed: ${errorText}`, retryAfterSeconds }, response.status);
    }

    const result = await response.json();
    console.log('Parsed Gemini response successfully');
    const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part?.text || '').join('') || '';

    if (!text) {
      console.error('Empty response from Gemini');
      return jsonResponse({ error: 'The AI service returned an empty response.' }, 500);
    }

    console.log(`Parsing JSON from response, text length: ${text.length}`);
    const parsed = parseJsonPayload(text);
    const questions = normalizeQuestions(parsed, questionCount);

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
