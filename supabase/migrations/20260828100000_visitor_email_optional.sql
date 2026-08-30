alter table public.visitor_conversations
  drop constraint if exists visitor_conversations_visitor_email_check;

alter table public.visitor_conversations
  add constraint visitor_conversations_visitor_email_check check (
    visitor_email = ''
    or (
      char_length(visitor_email) between 3 and 254
      and visitor_email ~* '^[a-zA-Z0-9._%+-]+@gmail\.com$'
    )
  );
