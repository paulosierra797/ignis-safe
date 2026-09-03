import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAX_MESSAGE_LENGTH = 1500;
const DELETION_GRACE_DAYS = 30;
const CONVERSATION_COLUMNS = 'id, visitor_label, visitor_name, visitor_email, status, '
  + 'last_message_preview, last_sender_type, last_message_at, visitor_last_read_at, '
  + 'admin_last_read_at, resolved_at, resolved_by, is_archived, archived_at, archived_by, '
  + 'deletion_requested_at, deletion_requested_by, delete_after, created_at, updated_at';

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeText = (value: unknown) => String(value || '').replace(/\r\n/g, '\n').trim();
const isValidClientId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const authenticateAdmin = async (request: Request) => {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return null;

  const { data: admin, error: adminError } = await serviceClient
    .from('admin')
    .select('admin_id, first_name, last_name, rank, role, status')
    .eq('admin_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (
    adminError
    || !admin
    || String(admin.status || '').trim().toLowerCase() === 'suspended'
  ) return null;
  return admin;
};

const getConversation = async (conversationId: unknown) => {
  const { data, error } = await serviceClient
    .from('visitor_conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('id', String(conversationId || ''))
    .maybeSingle();
  if (error) throw error;
  return data;
};

const getMessages = async (conversationId: string) => {
  const { data: messages, error } = await serviceClient
    .from('visitor_messages')
    .select('id, conversation_id, client_message_id, sender_type, sender_admin_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(500);
  if (error) throw error;

  const adminIds = [...new Set(
    (messages || []).map((message) => message.sender_admin_id).filter(Boolean)
  )];
  const adminNames = new Map<string, string>();

  if (adminIds.length > 0) {
    const { data: admins, error: adminsError } = await serviceClient
      .from('admin')
      .select('admin_id, first_name, last_name, rank')
      .in('admin_id', adminIds);
    if (adminsError) throw adminsError;

    (admins || []).forEach((item) => {
      const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ').trim();
      adminNames.set(
        item.admin_id,
        ((item.rank || '') + ' ' + (fullName || 'Administrator')).trim(),
      );
    });
  }

  return (messages || []).map((message) => ({
    ...message,
    admin_name: message.sender_admin_id
      ? adminNames.get(message.sender_admin_id) || 'Administrator'
      : null,
  }));
};

const markAdminRead = async (conversationId: string) => {
  const now = new Date().toISOString();
  const { error } = await serviceClient
    .from('visitor_conversations')
    .update({ admin_last_read_at: now, updated_at: now })
    .eq('id', conversationId);
  if (error) throw error;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Messaging service is not configured.' }, 500);
  }

  try {
    const admin = await authenticateAdmin(request);
    if (!admin) {
      return jsonResponse({ error: 'Administrator access is required.' }, 403);
    }

    const body = await request.json();
    const action = String(body?.action || '');

    if (action === 'list') {
      const archived = body?.archived === true;
      const { data, error } = await serviceClient
        .from('visitor_conversations')
        .select(CONVERSATION_COLUMNS)
        .eq('is_archived', archived)
        .order('last_message_at', { ascending: false })
        .limit(250);
      if (error) throw error;

      const conversations = (data || []).map((conversation) => ({
        ...conversation,
        unread: conversation.last_sender_type === 'visitor'
          && (!conversation.admin_last_read_at
            || new Date(conversation.last_message_at).getTime()
              > new Date(conversation.admin_last_read_at).getTime()),
      }));

      return jsonResponse({
        data: {
          conversations,
          unreadCount: conversations.filter((conversation) => conversation.unread).length,
        },
        error: null,
      });
    }

    if (action === 'get') {
      const conversation = await getConversation(body?.conversationId);
      if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);

      await markAdminRead(conversation.id);
      const messages = await getMessages(conversation.id);
      return jsonResponse({ data: { conversation, messages }, error: null });
    }

    if (action === 'reply') {
      const conversation = await getConversation(body?.conversationId);
      if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
      if (conversation.is_archived) {
        return jsonResponse({ error: 'Restore this conversation before replying.' }, 409);
      }

      const message = normalizeText(body?.message);
      const clientMessageId = String(body?.clientMessageId || '');
      if (!message || message.length > MAX_MESSAGE_LENGTH) {
        return jsonResponse({
          error: 'Your reply must contain 1 to ' + MAX_MESSAGE_LENGTH + ' characters.',
        }, 400);
      }
      if (!isValidClientId(clientMessageId)) {
        return jsonResponse({ error: 'Unable to safely identify this reply. Please try again.' }, 400);
      }

      const now = new Date().toISOString();
      const { error: messageError } = await serviceClient
        .from('visitor_messages')
        .insert({
          conversation_id: conversation.id,
          client_message_id: clientMessageId,
          sender_type: 'admin',
          sender_admin_id: admin.admin_id,
          body: message,
          created_at: now,
        });
      if (messageError && messageError.code !== '23505') throw messageError;

      const { error: updateError } = await serviceClient
        .from('visitor_conversations')
        .update({
          status: 'open',
          resolved_at: null,
          resolved_by: null,
          last_message_preview: message.slice(0, 180),
          last_sender_type: 'admin',
          last_message_at: now,
          admin_last_read_at: now,
          updated_at: now,
        })
        .eq('id', conversation.id);
      if (updateError) throw updateError;

      const refreshed = await getConversation(conversation.id);
      const messages = await getMessages(conversation.id);
      return jsonResponse({ data: { conversation: refreshed, messages }, error: null });
    }

    if (action === 'set-status') {
      const conversation = await getConversation(body?.conversationId);
      if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);

      const status = body?.status === 'resolved' ? 'resolved' : 'open';
      const now = new Date().toISOString();
      // Resolving a conversation archives it automatically, so admins no longer
      // need a separate Archive step. Reopening returns it to the active inbox
      // and cancels any pending deletion (mirrors the 'restore' action).
      const statusUpdate = status === 'resolved'
        ? {
          status,
          resolved_at: now,
          resolved_by: admin.admin_id,
          is_archived: true,
          archived_at: conversation.archived_at || now,
          archived_by: conversation.archived_by || admin.admin_id,
          admin_last_read_at: now,
          updated_at: now,
        }
        : {
          status,
          resolved_at: null,
          resolved_by: null,
          is_archived: false,
          archived_at: null,
          archived_by: null,
          deletion_requested_at: null,
          deletion_requested_by: null,
          delete_after: null,
          admin_last_read_at: now,
          updated_at: now,
        };
      const { error } = await serviceClient
        .from('visitor_conversations')
        .update(statusUpdate)
        .eq('id', conversation.id);
      if (error) throw error;

      const refreshed = await getConversation(conversation.id);
      return jsonResponse({ data: { conversation: refreshed }, error: null });
    }

    if (action === 'archive') {
      const conversation = await getConversation(body?.conversationId);
      if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);

      const now = new Date().toISOString();
      const { data, error } = await serviceClient
        .from('visitor_conversations')
        .update({
          is_archived: true,
          archived_at: conversation.archived_at || now,
          archived_by: conversation.archived_by || admin.admin_id,
          admin_last_read_at: now,
          updated_at: now,
        })
        .eq('id', conversation.id)
        .select(CONVERSATION_COLUMNS)
        .single();
      if (error) throw error;
      return jsonResponse({ data: { conversation: data }, error: null });
    }

    if (action === 'restore') {
      const conversation = await getConversation(body?.conversationId);
      if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);

      const now = new Date().toISOString();
      const { data, error } = await serviceClient
        .from('visitor_conversations')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
          deletion_requested_at: null,
          deletion_requested_by: null,
          delete_after: null,
          admin_last_read_at: now,
          updated_at: now,
        })
        .eq('id', conversation.id)
        .select(CONVERSATION_COLUMNS)
        .single();
      if (error) throw error;
      return jsonResponse({ data: { conversation: data }, error: null });
    }

    if (action === 'schedule-delete') {
      const conversation = await getConversation(body?.conversationId);
      if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
      if (!conversation.is_archived) {
        return jsonResponse({ error: 'Archive this conversation before scheduling deletion.' }, 409);
      }

      if (conversation.delete_after) {
        return jsonResponse({ data: { conversation }, error: null });
      }

      const now = new Date();
      const deleteAfter = new Date(
        now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await serviceClient
        .from('visitor_conversations')
        .update({
          deletion_requested_at: now.toISOString(),
          deletion_requested_by: admin.admin_id,
          delete_after: deleteAfter,
          admin_last_read_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', conversation.id)
        .select(CONVERSATION_COLUMNS)
        .single();
      if (error) throw error;
      return jsonResponse({ data: { conversation: data }, error: null });
    }

    return jsonResponse({ error: 'Unsupported messaging action.' }, 400);
  } catch (error) {
    console.error('Admin visitor chat request failed:', error);
    return jsonResponse({ error: 'Visitor messaging is temporarily unavailable.' }, 500);
  }
});
