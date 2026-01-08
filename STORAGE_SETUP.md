# Supabase Storage Setup Guide

## Step 1: Create the Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"** or **"Create bucket"**
4. Configure the bucket:
   - **Name**: `books`
   - **Public bucket**: ✅ **Yes** (uncheck if you want private)
   - **File size limit**: Set to a reasonable limit (e.g., 50 MB or 100 MB)
   - **Allowed MIME types**: 
     - `application/pdf`
     - `application/epub+zip`
     - Or leave empty to allow all types
5. Click **"Create bucket"**

## Step 2: Set Up Storage Policies (Optional but Recommended)

After creating the bucket, you can set up Row Level Security (RLS) policies to control access. Run the SQL migration file:

```sql
-- See: supabase/migrations/005_storage_policies.sql
```

Or manually create policies in the Supabase dashboard:

1. Go to **Storage** → **Policies** tab
2. Select the `books` bucket
3. Create policies for:
   - **SELECT**: Allow authenticated users to view files
   - **INSERT**: Allow authenticated users to upload files
   - **UPDATE**: Allow authenticated users to update their own files
   - **DELETE**: Allow authenticated users to delete their own files

## Step 3: Verify the Bucket

After creating the bucket, try uploading a file again. The error should be resolved.

## Troubleshooting

- **Bucket not found**: Make sure the bucket name is exactly `books` (case-sensitive)
- **Permission denied**: Check that your service role key is correctly configured in the backend environment variables
- **File size limit**: Ensure the bucket's file size limit is sufficient for your book files
