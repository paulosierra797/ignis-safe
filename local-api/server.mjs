import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const PORT = process.env.PORT || 3001;

const API_KEY = process.env.GEMINI_API_KEY || 
                process.env.GOOGLE_AI_STUDIO_API_KEY ||
                process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
                process.env.GOOGLE_API_KEY;

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const extractRetryDelaySecondsFromError = (err) => {
  try {
    if (!err) return null;
    if (typeof err === 'object') {
      const details = err.errorDetails || err.details || err.error?.details;
      if (Array.isArray(details)) {
        for (const d of details) {
          if (d?.retryDelay) {
            const match = String(d.retryDelay).match(/(\d+)s/);
            if (match) return Number(match[1]);
          }
          if (typeof d === 'string') {
            const m = d.match(/retryDelay\"\s*:\s*\"(\d+)s\"/i) || d.match(/retryDelay\s*[:=]\s*(\d+)s/i);
            if (m) return Number(m[1]);
          }
        }
      }
      if (err.retryDelay) {
        const match = String(err.retryDelay).match(/(\d+)s/);
        if (match) return Number(match[1]);
      }
    }

    if (typeof err === 'string') {
      const m = err.match(/retryDelay\"\s*:\s*\"(\d+)s\"/i) || err.match(/retryDelay\s*[:=]\s*(\d+)s/i);
      if (m) return Number(m[1]);
    }
  } catch (e) {
    // ignore
  }
  return null;
};

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.post('/api/generate-assessment-questions', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ 
      error: 'Missing GEMINI_API_KEY in environment variables.',
      data: null 
    });
  }

  try {
    const { moduleNo, questionCount, context, assessmentTitle, assessmentType } = req.body;

    if (!moduleNo) {
      return res.status(400).json({ error: 'moduleNo is required.', data: null });
    }

    if (!context) {
      return res.status(400).json({ error: 'context is required.', data: null });
    }

    const safeCount = Math.min(Math.max(Number(questionCount) || 5, 1), 10);

    const prompt = [
      `You are generating assessment questions for Module ${moduleNo}.`,
      assessmentTitle ? `Assessment title: ${assessmentTitle}.` : '',
      assessmentType ? `Assessment type: ${assessmentType}.` : '',
      `Create exactly ${safeCount} multiple-choice questions grounded only in the source material below.`,
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

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent({
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
    });

    const text = result.response.text();

    if (!text) {
      return res.status(500).json({ 
        error: 'The AI service returned an empty response.',
        data: null 
      });
    }

    // Parse JSON from response, handling markdown code fences
    const jsonText = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const firstBrace = jsonText.indexOf('{');
    const firstBracket = jsonText.indexOf('[');
    const startIndex = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);

    let parsed;
    if (startIndex > 0) {
      parsed = JSON.parse(jsonText.slice(startIndex));
    } else {
      parsed = JSON.parse(jsonText);
    }

    const questions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.questions)
        ? parsed.questions
        : [];

    const normalizedQuestions = questions
      .map((item) => ({
        question_type: 'multiple_choice',
        prompt: String(item.prompt || '').trim(),
        prompt_tl: String(item.prompt_tl || '').trim(),
        explanation: String(item.explanation || '').trim(),
        explanation_tl: String(item.explanation_tl || '').trim(),
        options: Array.isArray(item.options)
          ? item.options
            .map((option, index) => ({
              option_key: String(option?.option_key || '').trim().toUpperCase(),
              option_text: String(option?.option_text || '').trim(),
              option_text_tl: String(option?.option_text_tl || '').trim(),
              is_correct: Boolean(option?.is_correct),
              display_order: Number.isFinite(Number(option?.display_order)) ? Number(option?.display_order) : index + 1,
            }))
            .filter((option) => option.option_key && option.option_text)
          : [],
      }))
      .filter((item) => item.prompt.length > 0)
      .slice(0, safeCount);

    if (normalizedQuestions.length === 0) {
      return res.status(500).json({ 
        error: 'The AI response did not contain usable questions.',
        data: null 
      });
    }

    res.json({ data: { questions: normalizedQuestions }, error: null });
  } catch (error) {
    console.error('Error generating questions:', error);
    const retryAfter = extractRetryDelaySecondsFromError(error) || (error?.errorDetails ? extractRetryDelaySecondsFromError({ errorDetails: error.errorDetails }) : null);
    if (error?.status === 429) {
      return res.status(429).json({ error: error.message || 'Rate limit exceeded', data: null, retryAfterSeconds: retryAfter });
    }

    res.status(500).json({ 
      error: error.message || 'Unknown error',
      data: null,
      retryAfterSeconds: retryAfter
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Local API server running on http://localhost:${PORT}`);
  console.log(`📝 POST http://localhost:${PORT}/api/generate-assessment-questions`);
  if (!API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not set. Set it as an environment variable to use the AI generator.');
  }
});
