import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { UAParser } from 'npm:ua-parser-js@1.0.39';
import { corsHeaders } from '../_shared/cors.ts';

// Records an admin backoffice login audit row (success or failure) with
// server-trusted security metadata. Identity for a SUCCESS row is never
// taken from the request body — it is derived only from a Supabase JWT this
// function verifies itself via the service role client. A FAILED row has no
// authenticated session to derive identity from, so the attempted email is
// used only to correlate against an existing admin account (or discarded if
// it doesn't match one); it is never treated as proof that account holder
// performed the attempt.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || forwarded
    || 'unknown';
};

// Normalized, non-identifying failure categories. Raw Supabase Auth error
// text is never stored — only one of these safe buckets.
const SAFE_FAILURE_REASONS = new Set([
  'invalid_credentials',
  'account_not_authorized',
  'account_inactive',
  'too_many_attempts',
  'unknown_error',
]);

const normalizeFailureReason = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return SAFE_FAILURE_REASONS.has(normalized) ? normalized : 'unknown_error';
};

// Plain User-Agent string parsing only — no canvas/font/WebGL fingerprinting.
const parseDeviceInfo = (userAgent: string) => {
  if (!userAgent) {
    return { deviceType: null, operatingSystem: null, browser: null, browserVersion: null };
  }

  const result = new UAParser(userAgent).getResult();
  const rawDeviceType = result.device?.type;
  const deviceType = rawDeviceType === 'mobile'
    ? 'Mobile'
    : rawDeviceType === 'tablet'
      ? 'Tablet'
      : 'Desktop';

  const operatingSystem = [result.os?.name, result.os?.version].filter(Boolean).join(' ') || null;

  return {
    deviceType,
    operatingSystem,
    browser: result.browser?.name || null,
    browserVersion: result.browser?.version || null,
  };
};

// The device/session identifier is an existing opaque per-browser marker
// (see src/utils/deviceTrust.js) already used to skip repeat OTP prompts. It
// is stored here purely as supporting session metadata for investigators —
// never as proof of who physically held the device.
const sanitizeSessionIdentifier = (value: unknown) => {
  const str = String(value || '').trim();
  if (!str) return null;
  return str.slice(0, 128);
};

const buildMetadata = (request: Request, body: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const userAgent = request.headers.get('user-agent') || '';
  const device = parseDeviceInfo(userAgent);

  return {
    ip_address: getClientIp(request),
    user_agent: userAgent || null,
    device_type: device.deviceType,
    operating_system: device.operatingSystem,
    browser: device.browser,
    browser_version: device.browserVersion,
    session_identifier: sanitizeSessionIdentifier(body?.sessionIdentifier),
    // The admin backoffice login flow never collects GPS — there is no
    // legitimately-available location to attach here.
    location: null,
    ...extra,
  };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('record-login-audit is missing Supabase configuration.');
    return jsonResponse({ data: { recorded: false }, error: null });
  }

  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // supabase-js's functions.invoke() always sends SOME Authorization
    // header — the caller's session token when one exists, otherwise the
    // client's anon key. So "a token is present" does NOT by itself mean
    // this is an authenticated success report; only a token that verifies
    // to a real user does. Anything else (anon key, missing, expired,
    // tampered) falls through to the unauthenticated failed-login path
    // below, which never trusts the token anyway — it only correlates
    // body.email against an existing admin.
    if (token) {
      const { data: userData, error: userError } = await serviceClient.auth.getUser(token);

      if (!userError && userData?.user?.id) {
        const { data: adminRow, error: adminError } = await serviceClient
          .from('admin')
          .select('admin_id, first_name, last_name, email')
          .eq('admin_id', userData.user.id)
          .maybeSingle();

        if (!adminError && adminRow) {
          const actorName = `${adminRow.first_name || ''} ${adminRow.last_name || ''}`.trim()
            || adminRow.email
            || 'Admin User';

          const { error: insertError } = await serviceClient.from('admin_activity_logs').insert({
            admin_id: adminRow.admin_id,
            actor_name: actorName,
            action: 'User Login',
            action_type: 'login',
            details: 'Successful login.',
            status: 'SUCCESS',
            metadata: buildMetadata(request, body),
          });

          if (insertError) {
            console.error('record-login-audit: failed to insert success row:', insertError.message);
            return jsonResponse({ data: { recorded: false }, error: null });
          }

          return jsonResponse({ data: { recorded: true }, error: null });
        }

        if (adminError) {
          console.error('record-login-audit: admin lookup failed:', adminError.message);
        }

        // A real, verified user session, but not linked to an admin row.
        // This is not a password-stage failure to audit (LoginPage.jsx only
        // calls this endpoint at all after its own authorization checks
        // already passed) — no-op rather than falling through, since the
        // success-path caller never sends an email to correlate anyway.
        return jsonResponse({ data: { recorded: false }, error: null });
      }
      // Token did not verify as a real user session — fall through.
    }

    // No token, or a token that didn't verify: this is a failed-login
    // report from the browser. The email is used only to correlate against
    // an existing admin account, never as an authenticated identity.
    const email = normalizeEmail(body?.email);
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return jsonResponse({ data: { recorded: true }, error: null });
    }

    const { data: adminRow, error: adminLookupError } = await serviceClient
      .from('admin')
      .select('admin_id, first_name, last_name, email')
      .ilike('email', email)
      .maybeSingle();

    if (adminLookupError) {
      console.error('record-login-audit: failed-attempt admin lookup failed:', adminLookupError.message);
      return jsonResponse({ data: { recorded: false }, error: null });
    }

    // No matching admin account: this is noise (bot traffic, typos), not a
    // security-relevant event against a real account. Do not store it.
    if (!adminRow) {
      return jsonResponse({ data: { recorded: true }, error: null });
    }

    const actorName = `${adminRow.first_name || ''} ${adminRow.last_name || ''}`.trim()
      || adminRow.email
      || 'Unknown';
    const failureReason = normalizeFailureReason(body?.failureReason);

    const { error: insertError } = await serviceClient.from('admin_activity_logs').insert({
      admin_id: adminRow.admin_id,
      actor_name: actorName,
      action: 'Failed Login Attempt',
      action_type: 'login',
      details: `Attempted login for ${adminRow.email}.`,
      status: 'FAILED',
      metadata: buildMetadata(request, body, { failure_reason: failureReason }),
    });

    if (insertError) {
      console.error('record-login-audit: failed to insert failed-attempt row:', insertError.message);
    }

    // Same response shape regardless of match, so this endpoint can't be
    // used to probe which emails belong to real admin accounts.
    return jsonResponse({ data: { recorded: true }, error: null });
  } catch (error) {
    console.error('record-login-audit request failed:', error);
    // Never surface a failure to the caller — audit recording must not
    // affect the login flow itself.
    return jsonResponse({ data: { recorded: false }, error: null });
  }
});
