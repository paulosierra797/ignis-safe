alter table public.visitor_conversations
  add column if not exists visitor_id_hash text;

create index if not exists visitor_conversations_visitor_id_hash_idx
  on public.visitor_conversations (visitor_id_hash, last_message_at desc)
  where visitor_id_hash is not null;

comment on column public.visitor_conversations.visitor_id_hash is
  'SHA-256 hash of the anonymous per-browser visitor identifier (never the raw id). Used to find and reuse an existing conversation for a returning visitor instead of creating a duplicate, and to rate-limit conversation creation per visitor rather than per IP address.';
