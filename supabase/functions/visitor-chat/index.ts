import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { corsHeaders } from '../_shared/cors.ts';
import { maskOffensiveLanguage } from '../_shared/contentModeration.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAX_MESSAGE_LENGTH = 1500;
const MIN_MESSAGE_LENGTH = 3;
const MESSAGE_COOLDOWN_MS = 15 * 1000;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const randomCharacters = (length: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join('');
};

const createRecoveryCode = () => {
  const value = randomCharacters(20);
  return 'IGNIS-' + value.match(/.{1,4}/g)?.join('-');
};

const normalizeRecoveryCode = (value: unknown) =>
  String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalizeText = (value: unknown) => String(value || '').replace(/\r\n/g, '\n').trim();
const isValidName = (value: string) => /^\p{L}+(?:\s+\p{L}+)*$/u.test(value);
const isValidGmailAddress = (value: string) => /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(value);
const isValidClientId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getRequestSource = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || forwarded
    || 'unknown';
};

const getRateKey = async (
  request: Request,
  action: string,
  subject = '',
  includeRequestSource = true,
) => {
  return sha256([
    action,
    includeRequestSource ? getRequestSource(request) : 'shared',
    subject,
    SERVICE_ROLE_KEY.slice(-32),
  ].join(':'));
};

const enforceRateLimits = async ({
  request,
  action,
  rules,
}: {
  request: Request;
  action: 'start' | 'restore' | 'message';
  rules: Array<{
    subject: string;
    windowMs: number;
    limit: number;
    includeRequestSource?: boolean;
  }>;
}) => {
  const keyHashes = await Promise.all(rules.map((rule) => getRateKey(
    request,
    action,
    rule.subject,
    rule.includeRequestSource !== false,
  )));
  const { data, error } = await serviceClient.rpc('consume_visitor_chat_rate_limits', {
    p_key_hashes: keyHashes,
    p_action: action,
    p_window_seconds: rules.map((rule) => Math.ceil(rule.windowMs / 1000)),
    p_limits: rules.map((rule) => rule.limit),
  });
  if (error) throw error;
  return data === true;
};

const normalizedMessageFingerprint = (value: string) => value
  .toLowerCase()
  .replace(/\s+/gu, ' ')
  .trim();

const validateMessageContent = (message: string) => {
  if (message.length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    return 'Your message must contain ' + MIN_MESSAGE_LENGTH + ' to '
      + MAX_MESSAGE_LENGTH + ' characters.';
  }
  if ((message.match(/https?:\/\/|www\./giu) || []).length > 2) {
    return 'Please include no more than two links in one message.';
  }
  if (/(.)\1{14,}/u.test(message) || !/[\p{L}\p{N}]{2}/u.test(message)) {
    return 'Please write a clear message before sending.';
  }
  return '';
};

const isRecentDuplicate = async (conversationId: string, message: string) => {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await serviceClient
    .from('visitor_messages')
    .select('body')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'visitor')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;

  const fingerprint = normalizedMessageFingerprint(message);
  return (data || []).some((item) => normalizedMessageFingerprint(item.body) === fingerprint);
};

const loadConversation = async (recoveryCode: unknown) => {
  const normalizedCode = normalizeRecoveryCode(recoveryCode);
  if (normalizedCode.length !== 25) return null;

  const accessCodeHash = await sha256(normalizedCode);
  const { data, error } = await serviceClient
    .from('visitor_conversations')
    .select('*')
    .eq('access_code_hash', accessCodeHash)
    .maybeSingle();

  if (error) throw error;
  if (data?.delete_after && new Date(data.delete_after).getTime() <= Date.now()) {
    await serviceClient.from('visitor_conversations').delete().eq('id', data.id);
    return null;
  }
  return data;
};

const loadMessages = async (conversationId: string) => {
  const { data, error } = await serviceClient
    .from('visitor_messages')
    .select('id, conversation_id, client_message_id, sender_type, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(500);

  if (error) throw error;
  return data || [];
};

const publicConversation = (conversation: Record<string, unknown>) => ({
  id: conversation.id,
  visitorLabel: conversation.visitor_label,
  visitorName: conversation.visitor_name,
  visitorEmail: conversation.visitor_email,
  status: conversation.status,
  lastMessageAt: conversation.last_message_at,
  visitorLastReadAt: conversation.visitor_last_read_at,
  createdAt: conversation.created_at,
});

const fetchConversation = async (conversation: Record<string, unknown>, markRead: boolean) => {
  const messages = await loadMessages(String(conversation.id));
  const visitorLastReadAt = conversation.visitor_last_read_at
    ? new Date(String(conversation.visitor_last_read_at)).getTime()
    : 0;
  const hasUnreadAdminReply = messages.some((message) =>
    message.sender_type === 'admin'
    && new Date(message.created_at).getTime() > visitorLastReadAt
  );

  if (markRead && hasUnreadAdminReply) {
    const now = new Date().toISOString();
    await serviceClient
      .from('visitor_conversations')
      .update({ visitor_last_read_at: now, updated_at: now })
      .eq('id', conversation.id);
  }

  return {
    conversation: publicConversation(conversation),
    messages,
    hasUnreadAdminReply,
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
    return jsonResponse({ error: 'Messaging service is not configured.' }, 500);
  }

  try {
    const body = await request.json();
    const action = String(body?.action || '');

    if (action === 'start') {
      if (normalizeText(body?.website)) {
        return jsonResponse({ error: 'Unable to create this conversation.' }, 400);
      }

      const visitorName = normalizeText(body?.name);
      const visitorEmail = normalizeText(body?.email).toLowerCase();
      const rawMessage = normalizeText(body?.message);
      const validationError = validateMessageContent(rawMessage);
      const message = maskOffensiveLanguage(rawMessage);
      const clientMessageId = String(body?.clientMessageId || '');

      if (visitorName.length < 2 || visitorName.length > 80 || !isValidName(visitorName)) {
        return jsonResponse({ error: 'Please enter a valid name using letters and spaces only.' }, 400);
      }
      if (visitorEmail && (visitorEmail.length > 254 || !isValidGmailAddress(visitorEmail))) {
        return jsonResponse({ error: 'Please enter a valid email address ending in @gmail.com.' }, 400);
      }
      if (validationError) return jsonResponse({ error: validationError }, 400);
      if (!isValidClientId(clientMessageId)) {
        return jsonResponse({ error: 'Unable to safely identify this message. Please try again.' }, 400);
      }

      const emailRateRule = visitorEmail
        ? [{
            subject: 'email-' + (await sha256(visitorEmail)),
            windowMs: 24 * 60 * 60 * 1000,
            limit: 2,
            includeRequestSource: false,
          }]
        : [];
      const allowed = await enforceRateLimits({
        request,
        action: 'start',
        rules: [
          { subject: 'connection-short', windowMs: 30 * 60 * 1000, limit: 1 },
          { subject: 'connection-day', windowMs: 24 * 60 * 60 * 1000, limit: 3 },
          ...emailRateRule,
        ],
      });
      if (!allowed) {
        return jsonResponse({
          error: 'Too many new conversations were created from this connection. Please try again later.',
        }, 429);
      }

      const recoveryCode = createRecoveryCode();
      const accessCodeHash = await sha256(normalizeRecoveryCode(recoveryCode));
      const visitorLabel = 'Visitor ' + randomCharacters(8);
      const now = new Date().toISOString();

      const { data: conversation, error: conversationError } = await serviceClient
        .from('visitor_conversations')
        .insert({
          visitor_label: visitorLabel,
          visitor_name: visitorName,
          visitor_email: visitorEmail,
          access_code_hash: accessCodeHash,
          last_message_preview: message.slice(0, 180),
          last_sender_type: 'visitor',
          last_message_at: now,
          visitor_last_read_at: now,
        })
        .select('*')
        .single();
      if (conversationError) throw conversationError;

      const acknowledgement =
        'Your message has been received. An administrator will reply here. '
        + 'This channel is not monitored for emergencies. Call 911 for immediate assistance.';

      const { error: messageError } = await serviceClient
        .from('visitor_messages')
        .insert([
          {
            conversation_id: conversation.id,
            client_message_id: clientMessageId,
            sender_type: 'visitor',
            body: message,
            created_at: now,
          },
          {
            conversation_id: conversation.id,
            sender_type: 'system',
            body: acknowledgement,
            created_at: now,
          },
        ]);
      if (messageError) {
        await serviceClient.from('visitor_conversations').delete().eq('id', conversation.id);
        throw messageError;
      }

      const result = await fetchConversation(conversation, true);
      return jsonResponse({ data: { ...result, recoveryCode }, error: null });
    }

    if (action === 'fetch') {
      const conversation = await loadConversation(body?.recoveryCode);
      if (!conversation) {
        const allowed = await enforceRateLimits({
          request,
          action: 'restore',
          rules: [
            { subject: 'invalid-recovery', windowMs: 30 * 60 * 1000, limit: 5 },
            { subject: 'invalid-recovery-day', windowMs: 24 * 60 * 60 * 1000, limit: 12 },
          ],
        });
        return jsonResponse({
          error: allowed
            ? 'Conversation not found. Check the recovery code and try again.'
            : 'Too many unsuccessful recovery attempts. Please try again later.',
        }, allowed ? 404 : 429);
      }

      const result = await fetchConversation(conversation, body?.markRead === true);
      return jsonResponse({ data: result, error: null });
    }

    if (action === 'send') {
      const conversation = await loadConversation(body?.recoveryCode);
      if (!conversation) {
        return jsonResponse({ error: 'Conversation access could not be verified.' }, 403);
      }

      const rawMessage = normalizeText(body?.message);
      const clientMessageId = String(body?.clientMessageId || '');
      const validationError = validateMessageContent(rawMessage);
      if (validationError) return jsonResponse({ error: validationError }, 400);
      if (!isValidClientId(clientMessageId)) {
        return jsonResponse({ error: 'Unable to safely identify this message. Please try again.' }, 400);
      }

      const { data: existingMessage, error: existingMessageError } = await serviceClient
        .from('visitor_messages')
        .select('id')
        .eq('conversation_id', conversation.id)
        .eq('client_message_id', clientMessageId)
        .maybeSingle();
      if (existingMessageError) throw existingMessageError;
      if (existingMessage) {
        const result = await fetchConversation(conversation, true);
        return jsonResponse({ data: result, error: null });
      }

      if (new Date(conversation.created_at).getTime() > Date.now() - MESSAGE_COOLDOWN_MS) {
        return jsonResponse({ error: 'Please wait 15 seconds before sending another message.' }, 429);
      }

      const message = maskOffensiveLanguage(rawMessage);
      if (await isRecentDuplicate(String(conversation.id), message)) {
        return jsonResponse({ error: 'This message was already sent. Please write a new message.' }, 409);
      }

      const allowed = await enforceRateLimits({
        request,
        action: 'message',
        rules: [
          {
            subject: String(conversation.id) + '-cooldown',
            windowMs: MESSAGE_COOLDOWN_MS,
            limit: 1,
            includeRequestSource: false,
          },
          {
            subject: String(conversation.id) + '-ten-minutes',
            windowMs: 10 * 60 * 1000,
            limit: 5,
            includeRequestSource: false,
          },
          {
            subject: String(conversation.id) + '-daily',
            windowMs: 24 * 60 * 60 * 1000,
            limit: 25,
            includeRequestSource: false,
          },
        ],
      });
      if (!allowed) {
        return jsonResponse({
          error: 'Message limit reached. Please wait before sending another message.',
        }, 429);
      }

      const now = new Date().toISOString();
      const { error: messageError } = await serviceClient
        .from('visitor_messages')
        .insert({
          conversation_id: conversation.id,
          client_message_id: clientMessageId,
          sender_type: 'visitor',
          body: message,
          created_at: now,
        });

      if (messageError && messageError.code !== '23505') throw messageError;

      const { error: updateError } = await serviceClient
        .from('visitor_conversations')
        .update({
          status: 'open',
          is_archived: false,
          archived_at: null,
          archived_by: null,
          deletion_requested_at: null,
          deletion_requested_by: null,
          delete_after: null,
          resolved_at: null,
          resolved_by: null,
          last_message_preview: message.slice(0, 180),
          last_sender_type: 'visitor',
          last_message_at: now,
          visitor_last_read_at: now,
          updated_at: now,
        })
        .eq('id', conversation.id);
      if (updateError) throw updateError;

      const refreshedConversation = { ...conversation, status: 'open', last_message_at: now };
      const result = await fetchConversation(refreshedConversation, true);
      return jsonResponse({ data: result, error: null });
    }

    return jsonResponse({ error: 'Unsupported messaging action.' }, 400);
  } catch (error) {
    console.error('Visitor chat request failed:', error);
    return jsonResponse({ error: 'Messaging is temporarily unavailable. Please try again.' }, 500);
  }
});
