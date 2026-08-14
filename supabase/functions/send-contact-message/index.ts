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

const renderContactEmail = ({
  name,
  email,
  topic,
  message,
  submittedAt,
}: {
  name: string;
  email: string;
  topic: string;
  message: string;
  submittedAt: string;
}) => {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeTopic = escapeHtml(topic);
  const safeSubmittedAt = escapeHtml(submittedAt);
  const safeMessage = escapeHtml(message);
  const replySubject = encodeURIComponent(`Re: ${topic}`);
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>New Contact Us Submission</title>
    <style>
      @media screen and (max-width: 600px) {
        .email-container { width: 100% !important; }
        .email-padding { padding-left: 20px !important; padding-right: 20px !important; }
        .details-label { width: 96px !important; }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background-color:#f1f5f9; -webkit-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; font-family:'Poppins','Segoe UI',Arial,sans-serif;">
            <!-- Header -->
            <tr>
              <td align="center" style="background:linear-gradient(135deg,#dc2626 0%,#991b1b 100%); background-color:#b91c1c; padding:28px 24px;">
                <div style="color:#ffffff; font-size:22px; font-weight:700; letter-spacing:1px; line-height:1.3;">IGNIS SAFE</div>
                <div style="color:#fde8e8; font-size:13px; font-weight:400; margin-top:4px; line-height:1.4;">Bureau of Fire Protection &mdash; Dasmari&ntilde;as City Fire Station</div>
              </td>
            </tr>
            <!-- Body intro -->
            <tr>
              <td class="email-padding" style="padding:32px 36px 8px;">
                <h1 style="margin:0 0 6px; padding-bottom:12px; border-bottom:2px solid #dc2626; font-size:20px; font-weight:600; color:#172033;">New Contact Us Submission</h1>
                <p style="margin:14px 0 24px; font-size:14px; line-height:1.6; color:#475569;">You have received a new message through the IGNIS SAFE website Contact Us form. Details are below.</p>
              </td>
            </tr>
            <!-- Details card -->
            <tr>
              <td class="email-padding" style="padding:0 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc; border:1px solid #e5e7eb; border-radius:8px;">
                  <tr>
                    <td class="details-label" width="110" style="width:110px; padding:14px 8px 14px 20px; font-size:12px; font-weight:600; letter-spacing:0.4px; color:#b91c1c; text-transform:uppercase; vertical-align:top; border-bottom:1px solid #e5e7eb;">Name</td>
                    <td style="padding:14px 20px 14px 8px; font-size:14px; color:#172033; vertical-align:top; border-bottom:1px solid #e5e7eb;">${safeName}</td>
                  </tr>
                  <tr>
                    <td class="details-label" width="110" style="width:110px; padding:14px 8px 14px 20px; font-size:12px; font-weight:600; letter-spacing:0.4px; color:#b91c1c; text-transform:uppercase; vertical-align:top; border-bottom:1px solid #e5e7eb;">Email</td>
                    <td style="padding:14px 20px 14px 8px; font-size:14px; color:#172033; vertical-align:top; border-bottom:1px solid #e5e7eb;">${safeEmail}</td>
                  </tr>
                  <tr>
                    <td class="details-label" width="110" style="width:110px; padding:14px 8px 14px 20px; font-size:12px; font-weight:600; letter-spacing:0.4px; color:#b91c1c; text-transform:uppercase; vertical-align:top; border-bottom:1px solid #e5e7eb;">Topic</td>
                    <td style="padding:14px 20px 14px 8px; font-size:14px; color:#172033; vertical-align:top; border-bottom:1px solid #e5e7eb;">${safeTopic}</td>
                  </tr>
                  <tr>
                    <td class="details-label" width="110" style="width:110px; padding:14px 8px 14px 20px; font-size:12px; font-weight:600; letter-spacing:0.4px; color:#b91c1c; text-transform:uppercase; vertical-align:top;">Date &amp; Time</td>
                    <td style="padding:14px 20px 14px 8px; font-size:14px; color:#172033; vertical-align:top;">${safeSubmittedAt}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Message box -->
            <tr>
              <td class="email-padding" style="padding:20px 36px 0;">
                <div style="font-size:12px; font-weight:600; letter-spacing:0.4px; color:#b91c1c; text-transform:uppercase; margin-bottom:8px;">Message</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc; border:1px solid #e5e7eb; border-left:4px solid #dc2626; border-radius:6px;">
                  <tr>
                    <td style="padding:16px 20px; font-size:14px; line-height:1.7; color:#172033; white-space:pre-wrap;">${safeMessage}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Reply CTA -->
            <tr>
              <td align="center" class="email-padding" style="padding:28px 36px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:6px; background:linear-gradient(135deg,#dc2626 0%,#991b1b 100%); background-color:#b91c1c;">
                      <a href="mailto:${safeEmail}?subject=${replySubject}" style="display:inline-block; padding:13px 32px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; letter-spacing:0.3px;">Reply to Sender</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td align="center" style="background-color:#f8fafc; border-top:1px solid #e5e7eb; padding:20px 24px;">
                <p style="margin:0; font-size:12px; line-height:1.6; color:#94a3b8;">This email was generated automatically from the IGNIS SAFE website Contact Us form.</p>
                <p style="margin:4px 0 0; font-size:12px; line-height:1.6; color:#94a3b8;">&copy; ${year} IGNIS SAFE &middot; Bureau of Fire Protection &mdash; Dasmari&ntilde;as City Fire Station</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

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
        html: renderContactEmail({ name, email, topic, message, submittedAt }),
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
