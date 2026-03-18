# Database Schema Update Guide

## Changes Made

### 1. Database Schema Changes

#### Updated Fields:
- ❌ Removed: `name` (single field)
- ✅ Added: `first_name` VARCHAR(255) NOT NULL
- ✅ Added: `last_name` VARCHAR(255) NOT NULL
- ✅ Added: `profile_image` TEXT (for storing profile image URLs)

### 2. Files Modified/Created

#### Documentation:
- **SUPABASE_SETUP.md** - Updated with new schema
- **migration_split_name.sql** - Migration script for existing databases

#### New Services:
- **src/utils/imageService.js** - Profile image upload/delete utilities

#### Updated Components:
- **src/components/PersonnelProfile.jsx** - Added edit mode, removed role field
- **src/components/IntelUnitProfile.jsx** - Added edit mode, removed role field
- **src/components/PersonnelProfile.css** - Added styles for edit/save buttons

## Implementation Steps

### Step 1: Run Database Migration

If you have an existing database with data, run the migration:

```sql
-- In Supabase SQL Editor, run: migration_split_name.sql
```

This will:
1. Add `first_name`, `last_name`, and `profile_image` columns
2. Split existing `name` data into first and last names
3. Keep original `name` column for verification (you can drop it later)

### Step 2: Set Up Storage Bucket

1. Go to Supabase Dashboard → **Storage**
2. Create a new bucket named `avatars`
3. Set it to **Public** for easy access
4. Run the storage policies from SUPABASE_SETUP.md (Step 5)

### Step 3: Update Your Code

The profile pages are already updated with:
- Edit mode toggle (click "Edit Profile" to enable editing)
- Role field removed
- Save button appears when editing

### Step 4: Add Image Upload to Profile Pages (Optional)

To enable image uploads in the profile pages, you can add:

```jsx
import { uploadProfileImage } from '../utils/imageService';

// In your component:
const handleImageUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const { data: imageUrl, error } = await uploadProfileImage(
    currentUser.admin_id,
    file
  );

  if (error) {
    alert('Error uploading image: ' + error);
  } else {
    console.log('Image uploaded successfully:', imageUrl);
    // Refresh user data or update local state
  }
};

// In your JSX (replace the edit button):
<button className="edit-picture-btn" onClick={() => document.getElementById('imageUpload').click()}>
  <span>✏️</span>
</button>
<input
  id="imageUpload"
  type="file"
  accept="image/*"
  style={{ display: 'none' }}
  onChange={handleImageUpload}
/>
```

## Schema Reference

### New `admin` Table Structure:

```sql
CREATE TABLE admin (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'personnel', 'intel-unit')),
  rank VARCHAR(100),
  profile_image TEXT,
  status VARCHAR(50) DEFAULT 'Active',
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);
```

## API/Service Updates Needed

Your `usersService.js` already uses the `admin` table, so no changes needed there. However, when creating/updating users, use:

```javascript
// Old way:
await createUser({
  name: 'John Doe',
  // ...
});

// New way:
await createUser({
  first_name: 'John',
  last_name: 'Doe',
  profile_image: 'https://...',  // optional
  // ...
});
```

## Testing Checklist

- [ ] Run migration script in Supabase
- [ ] Verify data split correctly (check first_name and last_name)
- [ ] Create storage bucket and policies
- [ ] Test profile page edit mode
- [ ] Test image upload (if implemented)
- [ ] Update any other components that reference the `name` field

## Notes

- **Profile Images**: Stored as URLs in the database, actual files in Supabase Storage
- **Image Limits**: 5MB max size, supports JPEG, PNG, GIF, WebP
- **Role Field**: Removed from profile pages as it's system-controlled
- **Edit Mode**: Users must click "Edit Profile" before they can modify fields
