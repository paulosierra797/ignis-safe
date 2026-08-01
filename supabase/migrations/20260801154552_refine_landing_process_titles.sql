update public.landing_content
set content = jsonb_set(
  jsonb_set(
    content,
    '{process,english,title}',
    to_jsonb('Fire Safety Inspection Certificate (FSIC) & Fire Safety Evaluation Clearance (FSEC) Online Application'::text),
    true
  ),
  '{process,tagalog,title}',
  to_jsonb('Online Application para sa Fire Safety Inspection Certificate (FSIC) at Fire Safety Evaluation Clearance (FSEC)'::text),
  true
),
updated_at = now();
