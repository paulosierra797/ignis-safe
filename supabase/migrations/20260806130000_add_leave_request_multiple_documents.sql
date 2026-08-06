-- Supporting Document on the leave request form becomes optional for all
-- leave types, and personnel may attach up to 5 files instead of 1. The
-- existing single-document columns on leave_requests stay untouched (older
-- rows keep their document there); new submissions store each file as a row
-- in this table instead.

-- Submitting a leave request with attachments is now two inserts (the
-- request row, then its document rows). If the document insert fails after
-- the request row already landed, the client rolls the request back rather
-- than leaving a pending request the personnel never intended to submit
-- (they'd otherwise be stuck: a pending request already blocks resubmission).
grant delete on table public.leave_requests to authenticated;

drop policy if exists "leave_requests_delete_own_pending" on public.leave_requests;
create policy "leave_requests_delete_own_pending"
on public.leave_requests
for delete
to authenticated
using (
  personnel_id = auth.uid()
  and status = 'pending'
);

create table if not exists public.leave_request_documents (
  document_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.leave_requests(request_id) on delete cascade,
  document_path text not null,
  document_url text not null,
  document_name text not null,
  document_mime_type text,
  document_size_bytes integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_leave_request_documents_request on public.leave_request_documents (request_id);

alter table public.leave_request_documents enable row level security;

grant select, insert on table public.leave_request_documents to authenticated;

drop policy if exists "leave_request_documents_select_own_or_admin" on public.leave_request_documents;
create policy "leave_request_documents_select_own_or_admin"
on public.leave_request_documents
for select
to authenticated
using (
  exists (
    select 1
    from public.leave_requests lr
    where lr.request_id = leave_request_documents.request_id
      and (
        lr.personnel_id = auth.uid()
        or exists (
          select 1
          from public.admin actor
          where actor.admin_id = auth.uid()
            and lower(actor.role) = 'admin'
        )
      )
  )
);

drop policy if exists "leave_request_documents_insert_own" on public.leave_request_documents;
create policy "leave_request_documents_insert_own"
on public.leave_request_documents
for insert
to authenticated
with check (
  exists (
    select 1
    from public.leave_requests lr
    where lr.request_id = leave_request_documents.request_id
      and lr.personnel_id = auth.uid()
      and lr.status = 'pending'
  )
);
