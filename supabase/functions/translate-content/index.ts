import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { corsHeaders } from '../_shared/cors.ts';

type SupportedLanguage = 'en' | 'fil';
type TranslationSection = 'learning_materials' | 'assessment_questions' | 'about_us';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const AZURE_TRANSLATOR_KEY = Deno.env.get('AZURE_TRANSLATOR_KEY') || '';
const AZURE_TRANSLATOR_REGION = Deno.env.get('AZURE_TRANSLATOR_REGION') || '';
const AZURE_TRANSLATOR_ENDPOINT = (
  Deno.env.get('AZURE_TRANSLATOR_ENDPOINT') || 'https://api.cognitive.microsofttranslator.com'
).replace(/\/+$/, '');
const MONTHLY_CHARACTER_LIMIT = Math.min(
  Math.max(Number(Deno.env.get('AZURE_TRANSLATOR_MONTHLY_CHAR_LIMIT') || 2_000_000), 1),
  2_000_000,
);
const REQUESTS_PER_MINUTE = Math.min(
  Math.max(Number(Deno.env.get('AZURE_TRANSLATOR_REQUESTS_PER_MINUTE') || 10), 1),
  60,
);
const MAX_TEXT_ITEMS = 1_000;
const MAX_REQUEST_CHARACTERS = 50_000;
const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>(['en', 'fil']);
const SUPPORTED_SECTIONS = new Set<TranslationSection>([
  'learning_materials',
  'assessment_questions',
  'about_us',
]);

const serviceClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

const jsonResponse = (payload: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(payload),
  {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  },
);

const authenticateAdmin = async (request: Request) => {
  const authHeader = request.headers.get('Authorization') || '';
  const tokenMatch = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!tokenMatch || !SUPABASE_URL || !SUPABASE_ANON_KEY || !serviceClient) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
  if (authError || !userData?.user?.id) return null;

  const { data: admin, error: adminError } = await serviceClient
    .from('admin')
    .select('admin_id')
    .eq('admin_id', userData.user.id)
    .eq('role', 'admin')
    .ilike('status', 'active')
    .maybeSingle();

  return adminError || !admin?.admin_id ? null : admin.admin_id as string;
};

const publicErrorForAzureStatus = (status: number) => {
  if (status === 403) {
    return { status: 429, message: 'The monthly translation allowance is unavailable or exhausted. You can still enter the translation manually.' };
  }
  if (status === 429) {
    return { status: 429, message: 'Translation is temporarily rate-limited. Please wait a moment or enter the translation manually.' };
  }
  if ([408, 500, 502, 503, 504].includes(status)) {
    return { status: 503, message: 'Translation is temporarily unavailable. Your text is unchanged and can still be translated manually.' };
  }
  return { status: 502, message: 'Translation could not be completed. Your text is unchanged and can still be translated manually.' };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  if (!AZURE_TRANSLATOR_KEY || !serviceClient) {
    console.error('translate-content: missing server-side provider configuration');
    return jsonResponse({
      error: 'Translation is not configured right now. You can still enter the translation manually.',
    }, 503);
  }

  let endpoint: URL;
  try {
    endpoint = new URL(AZURE_TRANSLATOR_ENDPOINT);
    if (endpoint.protocol !== 'https:') throw new Error('HTTPS required');
  } catch {
    console.error('translate-content: invalid provider endpoint configuration');
    return jsonResponse({
      error: 'Translation is not configured right now. You can still enter the translation manually.',
    }, 503);
  }

  const adminId = await authenticateAdmin(request);
  if (!adminId) return jsonResponse({ error: 'Administrator access is required.' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid translation request.' }, 400);
  }

  const sourceLanguage = String(body.sourceLanguage || '') as SupportedLanguage;
  const targetLanguage = String(body.targetLanguage || '') as SupportedLanguage;
  const section = String(body.section || '') as TranslationSection;
  const texts = Array.isArray(body.texts)
    ? body.texts.map((value) => typeof value === 'string' ? value : '')
    : [];

  if (!SUPPORTED_LANGUAGES.has(sourceLanguage)
    || !SUPPORTED_LANGUAGES.has(targetLanguage)
    || sourceLanguage === targetLanguage
    || !SUPPORTED_SECTIONS.has(section)) {
    return jsonResponse({ error: 'Invalid translation language or section.' }, 400);
  }

  if (texts.length < 1 || texts.length > MAX_TEXT_ITEMS || texts.some((text) => !text.trim())) {
    return jsonResponse({ error: 'Add source text before translating.' }, 400);
  }

  const characterCount = texts.reduce((total, text) => total + text.length, 0);
  if (characterCount < 1 || characterCount > MAX_REQUEST_CHARACTERS) {
    return jsonResponse({
      error: 'Translate a smaller amount of text at one time (up to 50,000 characters).',
    }, 413);
  }

  const requestId = crypto.randomUUID();
  const { data: reservation, error: reservationError } = await serviceClient.rpc(
    'reserve_translation_usage',
    {
      p_request_id: requestId,
      p_admin_id: adminId,
      p_characters: characterCount,
      p_monthly_limit: MONTHLY_CHARACTER_LIMIT,
      p_requests_per_minute: REQUESTS_PER_MINUTE,
      p_section: section,
      p_source_language: sourceLanguage,
      p_target_language: targetLanguage,
    },
  );

  if (reservationError) {
    const technicalMessage = String(reservationError.message || '');
    if (technicalMessage.includes('translation_rate_limit_exceeded')) {
      return jsonResponse({
        error: 'Translation is temporarily rate-limited. Please wait a moment or enter the translation manually.',
      }, 429);
    }
    if (technicalMessage.includes('translation_monthly_quota_exhausted')) {
      return jsonResponse({
        error: 'The monthly translation allowance has been reached. You can still enter the translation manually.',
      }, 429);
    }
    console.error('translate-content: usage reservation failed', { code: reservationError.code });
    return jsonResponse({
      error: 'Translation is temporarily unavailable. Your text is unchanged and can still be translated manually.',
    }, 503);
  }

  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/translate`;
  endpoint.searchParams.set('api-version', '3.0');
  endpoint.searchParams.set('from', sourceLanguage);
  endpoint.searchParams.set('to', targetLanguage);
  endpoint.searchParams.set('textType', 'plain');

  const providerHeaders: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
    'X-ClientTraceId': requestId,
  };
  if (AZURE_TRANSLATOR_REGION) {
    providerHeaders['Ocp-Apim-Subscription-Region'] = AZURE_TRANSLATOR_REGION;
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: providerHeaders,
      body: JSON.stringify(texts.map((text) => ({ Text: text }))),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    await serviceClient.rpc('finalize_translation_usage', {
      p_request_id: requestId,
      p_success: false,
      p_billed_characters: 0,
    });
    console.error('translate-content: provider request failed', {
      errorType: error instanceof Error ? error.constructor.name : 'unknown',
    });
    return jsonResponse({
      error: 'Translation is temporarily unavailable. Your text is unchanged and can still be translated manually.',
    }, 503);
  }

  if (!providerResponse.ok) {
    await serviceClient.rpc('finalize_translation_usage', {
      p_request_id: requestId,
      p_success: false,
      p_billed_characters: 0,
    });
    console.error('translate-content: provider rejected request', { status: providerResponse.status });
    const publicError = publicErrorForAzureStatus(providerResponse.status);
    return jsonResponse({ error: publicError.message }, publicError.status);
  }

  let translations: string[];
  try {
    const payload = await providerResponse.json();
    translations = Array.isArray(payload)
      ? payload.map((item) => String(item?.translations?.[0]?.text || ''))
      : [];
    if (translations.length !== texts.length || translations.some((text) => !text.trim())) {
      throw new Error('Incomplete translation response');
    }
  } catch {
    await serviceClient.rpc('finalize_translation_usage', {
      p_request_id: requestId,
      p_success: false,
      p_billed_characters: 0,
    });
    console.error('translate-content: provider returned an invalid response');
    return jsonResponse({
      error: 'Translation returned an incomplete result. Your text is unchanged and can still be translated manually.',
    }, 502);
  }

  const meteredCharacters = Number(providerResponse.headers.get('X-Metered-Usage'));
  const billedCharacters = Number.isFinite(meteredCharacters) && meteredCharacters >= 0
    ? Math.min(meteredCharacters, characterCount)
    : characterCount;
  const { error: finalizeError } = await serviceClient.rpc('finalize_translation_usage', {
    p_request_id: requestId,
    p_success: true,
    p_billed_characters: billedCharacters,
  });
  if (finalizeError) {
    // Keep the reservation in place if metering finalization fails. That is
    // conservative: it prevents an accounting failure from exceeding F0.
    console.error('translate-content: usage finalization failed', { code: finalizeError.code });
  }

  return jsonResponse({
    translations,
    usage: {
      characters: billedCharacters,
      remainingCharacters: Number(reservation?.remainingCharacters ?? 0),
      monthlyLimit: Number(reservation?.monthlyLimit ?? MONTHLY_CHARACTER_LIMIT),
    },
  });
});
