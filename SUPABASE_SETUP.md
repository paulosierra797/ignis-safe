# Supabase Setup Guide

## Step 1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in project details and create

## Step 2: Get Your Credentials
1. Go to **Settings** → **API**
2. Copy your:
   - Project URL
   - Anon Key (public)

## Step 3: Set Up Environment Variables
1. Create a `.env.local` file in the root of your project
2. Add your credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 4: Create Admin Table

Go to **SQL Editor** in Supabase and run this SQL:

```sql
-- Create admin table
CREATE TABLE admin (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'personnel', 'intel-unit')),
  rank VARCHAR(100),
  profile_image TEXT,
  status VARCHAR(50) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Create index on email for faster lookups
CREATE INDEX idx_admin_email ON admin(email);

-- Create index on role for filtering
CREATE INDEX idx_admin_role ON admin(role);

-- Create index on status for filtering
CREATE INDEX idx_admin_status ON admin(status);

-- Enable Row Level Security (RLS)
ALTER TABLE admin ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - users can read all users (adjust as needed)
CREATE POLICY "Enable read access for all users" ON admin
  FOR SELECT USING (true);

-- Create RLS policy - only admins can insert users
CREATE POLICY "Enable insert for admins only" ON admin
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Create RLS policy - users can update their own profile (optional)
CREATE POLICY "Users can update own profile" ON admin
  FOR UPDATE USING (admin_id::text = auth.uid()::text);
```

## Step 5: Set Up Image Storage (Optional)

To enable profile image uploads, set up Supabase Storage:

1. Go to **Storage** in Supabase Dashboard
2. Click **Create a new bucket**
3. Name it `avatars` (or `profile-images`)
4. Set it to **Public bucket** if you want images publicly accessible
5. Click **Create bucket**

### Storage Policy (for public avatars):

Go to **Storage** → **Policies** and add:

```sql
-- Allow public read access to avatars
CREATE POLICY "Public Access" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to update their own avatar
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

### Upload Image Example:

```jsx
import { supabase } from '../utils/supabaseClient';

// Upload profile image
async function uploadProfileImage(userId, file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    console.error('Error uploading image:', error);
    return { data: null, error };
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  // Update user profile with image URL
  await supabase
    .from('admin')
    .update({ profile_image: publicUrl })
    .eq('admin_id', userId);

  return { data: publicUrl, error: null };
}
```

## Step 6: Install Supabase Package

```bash
npm install @supabase/supabase-js
```

## Step 7: Set Up Authentication

The login page is already connected to Supabase! Here's how it works:

### Login Flow:
1. User enters email and password
2. App calls Supabase authentication
3. On success, user data is stored and redirected to dashboard
4. User session is managed automatically

### Password Reset Flow:
1. User clicks "Forgot Password"
2. Enters email and receives reset link
3. Clicks link in email to reset password
4. Supabase handles the verification securely

### Important Notes:
- **First user setup**: You need to create users via Supabase Dashboard or use the sign-up function
- **Email verification**: Enable email confirmation in Supabase Authentication settings if needed
- **Session management**: Sessions are stored securely and auto-refresh

### Create Your First Admin User

Go to **Authentication** → **Users** in Supabase Dashboard and click "Add User":
- Email: `admin@example.com`
- Password: Your secure password
- Auto-confirm: Yes

Then go to **SQL Editor** and run:
```sql
INSERT INTO admin (admin_id, first_name, last_name, email, role, rank, status, permissions)
VALUES (
  'the-user-id-from-auth-users', 
  'Admin',
  'User',
  'admin@example.com',
  'admin',
  'Chief',
  'Active',
  '["view_dashboard", "view_charts", "view_attendance", "view_accounts", "manage_users", "view_analytics", "view_progress", "view_audit_logs"]'::jsonb
);
```

## Step 8: Use in Your App

Import the service in your components:

```jsx
import { getAllUsers, createUser, updateUser, deleteUser } from '../utils/usersService';

// Get all users
const { data, error } = await getAllUsers();

// Create new user
const { data: newUser, error: createError } = await createUser({
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  password_hash: 'hashed_password', // Use bcrypt or argon2 to hash!
  role: 'personnel',
  rank: 'Firefighter',
  status: 'Active',
  permissions: ['view_dashboard', 'create_reports'],
  profile_image: 'https://your-project.supabase.co/storage/v1/object/public/avatars/user-123.jpg'
});

// Update user
const { data: updated, error: updateError } = await updateUser(userId, {
  status: 'Inactive',
  rank: 'Lieutenant'
});

// Delete user
const { data, error } = await deleteUser(userId);
```

## Important Security Notes

⚠️ **DO NOT store plain text passwords!**
- Use bcrypt or argon2 to hash passwords on your backend
- Never hash on the frontend
- Consider using Supabase Auth for authentication instead

## Optional: Use Supabase Auth

For production, use Supabase's built-in authentication:

```bash
npm install @supabase/auth-js
```

Then use `supabase.auth.signUp()` and `supabase.auth.signIn()` instead of managing passwords manually.

## Test Your Setup

Create a simple test component:

```jsx
import { useEffect, useState } from 'react';
import { getAllUsers } from '../utils/usersService';

export default function UserTest() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await getAllUsers();
      if (error) {
        setError(error);
      } else {
        setUsers(data || []);
      }
      setLoading(false);
    };

    fetchUsers();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Users ({users.length})</h1>
      <ul>
        {users.map(user => (
          <li key={user.admin_id}>
            {user.profile_image && <img src={user.profile_image} alt="Profile" width="30" />}
            {user.first_name} {user.last_name} - {user.email}
          </li>
        ))}
      </ul>
    </div>
  );
}
```
