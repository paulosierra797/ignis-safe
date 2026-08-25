import { createClient } from 'npm:@supabase/supabase-js@2.97.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
};

const RECOVERABLE_ROLES = new Set(['admin', 'personnel']);
const RECOVERABLE_STATUSES = new Set(['active', 'inactive', 'on leave']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_RESPONSE_TIME_MS = 450;

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const respond = async (
  startedAt: number,
  body: Record<string, unknown>,
  status = 200,
) => {
  const remainingDelay = MIN_RESPONSE_TIME_MS - (Date.now() - startedAt);
  if (remainingDelay > 0) await wait(remainingDelay);

  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
};

const errorBody = (code: string, message: string) => ({
  data: null,
  error: { code, message },
});

const getSafeRedirectUrl = (rawRedirect: unknown, requestOrigin: string | null) => {
  try {
    const redirectUrl = new URL(String(rawRedirect || ''));
    const originUrl = requestOrigin ? new URL(requestOrigin) : null;
    const isSecure = redirectUrl.protocol === 'https:';
    const isLocalDevelopment =
      redirectUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(redirectUrl.hostname);

    if ((!isSecure && !isLocalDevelopment) || redirectUrl.pathname !== '/login') {
      return null;
    }

    if (originUrl && redirectUrl.origin !== originUrl.origin) {
      return null;
    }

    redirectUrl.hash = '';
    redirectUrl.search = '';
    return redirectUrl.toString();
  } catch {
    return null;
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();

  if (request.method !== 'POST') {
    return respond(
      startedAt,
      errorBody('METHOD_NOT_ALLOWED', 'Only password reset requests are accepted.'),
      405,
    );
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const email = normalize(payload?.email);
    const redirectTo = getSafeRedirectUrl(
      payload?.redirectTo,
      request.headers.get('origin'),
    );

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return respond(
        startedAt,
        errorBody('INVALID_EMAIL', 'Enter a valid email address.'),
      );
    }

    if (!redirectTo) {
      return respond(
        startedAt,
        errorBody('INVALID_REDIRECT', 'The password recovery destination is invalid.'),
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Password reset function is missing Supabase configuration.');
      return respond(
        startedAt,
        errorBody(
          'SERVICE_UNAVAILABLE',
          'Password recovery is temporarily unavailable. Please try again later.',
        ),
      );
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: account, error: accountError } = await serviceClient
      .from('admin')
      .select('admin_id, email, role, status')
      .ilike('email', email)
      .maybeSingle();

    if (accountError) {
      console.error('Could not check website account eligibility:', accountError.message);
      return respond(
        startedAt,
        errorBody(
          'SERVICE_UNAVAILABLE',
          'Password recovery is temporarily unavailable. Please try again later.',
        ),
      );
    }

    const role = normalize(account?.role).replace(/[_-]+/g, ' ');
    const status = normalize(account?.status);
    const isWebsiteAccount =
      Boolean(account?.admin_id) &&
      RECOVERABLE_ROLES.has(role) &&
      RECOVERABLE_STATUSES.has(status);

    if (!isWebsiteAccount) {
      return respond(
        startedAt,
        errorBody(
          'ACCOUNT_NOT_AUTHORIZED',
          'This email is not authorized for Admin or Personnel website access.',
        ),
      );
    }

    const { data: authRecord, error: authRecordError } =
      await serviceClient.auth.admin.getUserById(account.admin_id);

    const authEmail = normalize(authRecord?.user?.email);
    if (authRecordError || !authRecord?.user || authEmail !== email) {
      if (authRecordError) {
        console.error('Could not validate the linked Auth account:', authRecordError.message);
      }

      return respond(
        startedAt,
        errorBody(
          'ACCOUNT_NOT_AUTHORIZED',
          'This email is not authorized for Admin or Personnel website access.',
        ),
      );
    }

    const { error: resetError } = await serviceClient.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (resetError) {
      const isRateLimited = /rate|too many|security purposes/i.test(resetError.message);
      console.error('Could not send password recovery email:', resetError.message);

      return respond(
        startedAt,
        errorBody(
          isRateLimited ? 'RESET_RATE_LIMITED' : 'RESET_EMAIL_FAILED',
          isRateLimited
            ? 'A reset email was requested recently. Please wait before trying again.'
            : 'We could not send the reset email. Please try again later.',
        ),
      );
    }

    return respond(startedAt, {
      data: { sent: true },
      error: null,
    });
  } catch (error) {
    console.error('Unexpected password reset error:', error);
    return respond(
      startedAt,
      errorBody(
        'SERVICE_UNAVAILABLE',
        'Password recovery is temporarily unavailable. Please try again later.',
      ),
    );
  }
});
