begin;

insert into public.about_us_contact_points (
  contact_key,
  contact_type,
  display_value,
  dial_value,
  is_active
)
values (
  'dasma_mobile',
  'mobile',
  '0995-336-9534',
  '09953369534',
  true
)
on conflict (contact_key) do update
set contact_type = excluded.contact_type,
    display_value = excluded.display_value,
    dial_value = excluded.dial_value,
    is_active = true,
    updated_at = now();

insert into public.about_us_emergency_numbers (
  section_key,
  label_en,
  label_tl,
  icon_key,
  display_order,
  is_active,
  contact_key
)
select
  'emergency_contacts',
  'Mobile',
  'Mobile',
  'phone_iphone',
  1,
  true,
  'dasma_mobile'
where not exists (
  select 1
  from public.about_us_emergency_numbers
  where contact_key = 'dasma_mobile'
);

commit;
