-- Storage Policies for profile_pic bucket
-- Run these commands in Supabase SQL Editor

-- 1. Allow public read access to profile pictures
CREATE POLICY "Public Access to Profile Pictures"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile_pic');

-- 2. Allow authenticated users to upload their own profile pictures
CREATE POLICY "Users can upload own profile picture"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile_pic' 
  AND auth.uid() IS NOT NULL
);

-- 3. Allow users to update their own profile pictures
CREATE POLICY "Users can update own profile picture"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile_pic' 
  AND auth.uid() IS NOT NULL
);

-- 4. Allow users to delete their own profile pictures
CREATE POLICY "Users can delete own profile picture"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profile_pic' 
  AND auth.uid() IS NOT NULL
);

-- Optional: If you want to restrict uploads to specific user folders only
-- Replace policy #2 with this more restrictive version:
/*
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile_pic' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);
*/
