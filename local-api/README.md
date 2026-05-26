# Local API Server for Question Generation

This is a local Node.js server that provides the AI question generation endpoint without needing Supabase Edge Functions.

## Quick Start

1. Install dependencies:
```bash
npm install

# Or from the repo root:
npm run local-api:install
```

2. Set your Google API key:
```bash
# Windows PowerShell
$env:GEMINI_API_KEY = "your-api-key-here"
npm start

# Or from the repo root:
npm run local-api:start

# Or bash
export GEMINI_API_KEY="your-api-key-here"
npm start
```

3. The server will run on `http://localhost:3001`

The frontend is configured to fall back to this local server if Supabase is not available.

## Environment Variables

- `GEMINI_API_KEY` - Your Google AI Studio API key (recommended)
- `GOOGLE_API_KEY` - Alternative: same as above
- `GOOGLE_AI_STUDIO_API_KEY` - Alternative: same as above
- `GOOGLE_GENERATIVE_AI_API_KEY` - Alternative: same as above
- `GEMINI_MODEL` - Optional: defaults to `gemini-2.5-flash`
- `PORT` - Optional: defaults to `3001`

## Development

Watch mode (restart on file changes):
```bash
npm run dev
```

## Endpoint

**POST** `/api/generate-assessment-questions`

Request body:
```json
{
  "moduleNo": 1,
  "questionCount": 5,
  "context": "Module learning material text...",
  "assessmentTitle": "Module 1 - Pre-test",
  "assessmentType": "pre-test"
}
```

Response:
```json
{
  "data": {
    "questions": [
      {
        "question_type": "multiple_choice",
        "prompt": "Question text...",
        "prompt_tl": "Question text in local language...",
        "explanation": "Explanation...",
        "explanation_tl": "Explanation in local language...",
        "options": [
          {
            "option_key": "A",
            "option_text": "Option A text",
            "option_text_tl": "Option A in local language",
            "is_correct": false,
            "display_order": 1
          },
          ...
        ]
      }
    ]
  },
  "error": null
}
```
