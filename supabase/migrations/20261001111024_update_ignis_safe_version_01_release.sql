update public.landing_content
set content = jsonb_set(content, '{mobileRelease}',
  '{"version":"01","size":"223.42 MB","compatibility":"Android 7.1+","architecture":"Android devices only","format":"APK","releaseDate":"October 1, 2026"}'::jsonb),
  updated_at = now()
where id = 'default';
