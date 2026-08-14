import { corsHeaders } from '../_shared/cors.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const GMAIL_USER = Deno.env.get('GMAIL_USER');
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');
const RECIPIENT_EMAIL = Deno.env.get('CONTACT_RECIPIENT_EMAIL') || 'ignissafe.bfpdasmarinas@gmail.com';

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Strip CR/LF so submitted values can't inject extra SMTP/MIME headers.
const stripHeaderInjection = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('CRITICAL: Missing GMAIL_USER or GMAIL_APP_PASSWORD in Supabase function secrets');
    return jsonResponse({ error: 'Email service is not configured.' }, 500);
  }

  try {
    const body = await request.json();

    const name = stripHeaderInjection(String(body?.name || '').trim());
    const email = stripHeaderInjection(String(body?.email || '').trim());
    const topic = stripHeaderInjection(String(body?.topic || '').trim());
    const message = String(body?.message || '').trim();

    if (!name || !email || !topic || !message) {
      return jsonResponse({ error: 'Name, email, topic, and message are all required.' }, 400);
    }

    if (!isValidEmail(email)) {
      return jsonResponse({ error: 'Please provide a valid email address.' }, 400);
    }

    const submittedAt = new Date().toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'long',
      timeStyle: 'medium',
    });

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_USER,
          password: GMAIL_APP_PASSWORD,
        },
      },
    });

    try {
      await client.send({
        from: `IGNIS SAFE Website <${GMAIL_USER}>`,
        to: RECIPIENT_EMAIL,
        replyTo: email,
        subject: `[IGNIS SAFE Contact] ${topic} - ${name}`,
        content: 'auto',
        html: `
          <h2 style="margin:0 0 12px;">New Contact Us Submission</h2>
          <p style="margin:0 0 6px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p style="margin:0 0 6px;"><strong>Topic:</strong> ${escapeHtml(topic)}</p>
          <p style="margin:0 0 12px;"><strong>Date/Time:</strong> ${escapeHtml(submittedAt)}</p>
          <p style="margin:0 0 6px;"><strong>Message:</strong></p>
          <p style="margin:0; white-space:pre-wrap;">${escapeHtml(message)}</p>
        `,
      });
    } finally {
      await client.close();
    }

    return jsonResponse({ data: { success: true }, error: null });
  } catch (error) {
    console.error('Failed to send contact message:', error);
    return jsonResponse({ error: 'Failed to send your message. Please try again later.' }, 500);
  }
});
