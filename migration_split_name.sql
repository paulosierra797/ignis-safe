-- Migration: Split name into first_name and last_name, and add avatar_url
-- Run this in Supabase SQL Editor if you have an existing admin table

-- Step 1: Add new columns
ALTER TABLE admin ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE admin ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE admin ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Step 2: Migrate existing data (split name into first and last)
UPDATE admin 
SET 
  first_name = SPLIT_PART(name, ' ', 1),
  last_name = CASE 
    WHEN array_length(string_to_array(name, ' '), 1) > 1 
    THEN substring(name from length(SPLIT_PART(name, ' ', 1)) + 2)
    ELSE ''
  END
WHERE first_name IS NULL;

-- Step 3: Make first_name and last_name NOT NULL after migration
ALTER TABLE admin ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE admin ALTER COLUMN last_name SET NOT NULL;

-- Step 4: Drop the old name column (optional - only after verifying data is correct)
-- ALTER TABLE admin DROP COLUMN name;

-- Note: After running this migration, verify your data before dropping the name column:
-- SELECT admin_id, name, first_name, last_name FROM admin LIMIT 10;
