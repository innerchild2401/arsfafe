# Storage RLS Troubleshooting

If you're getting RLS violations even with the admin client, try these steps:

## Option 1: Make the Bucket Public (Recommended for Testing)

1. Go to Supabase Dashboard → Storage
2. Click on the `books` bucket
3. Go to **Settings** tab
4. Toggle **"Public bucket"** to **ON**
5. Save changes

Public buckets have less strict RLS enforcement.

## Option 2: Temporarily Disable Storage Policies

If you want to test without RLS policies, you can temporarily drop them:

```sql
-- Drop all storage policies for the books bucket
DROP POLICY IF EXISTS "Authenticated users can view books" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload books" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own books" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own books" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all books" ON storage.objects;
```

Then try uploading again. If it works, the policies are the issue.

## Option 3: Check Bucket Configuration

1. Go to Supabase Dashboard → Storage → `books` bucket
2. Check:
   - **Public bucket**: Should be ON for easier access
   - **File size limit**: Should be sufficient (e.g., 100 MB)
   - **Allowed MIME types**: Should include `application/pdf` and `application/epub+zip`, or leave empty

## Option 4: Verify Service Role Key

Make sure your backend environment variables are set correctly:

- `SUPABASE_SERVICE_ROLE_KEY` - This is the key that bypasses RLS
- `SUPABASE_KEY` - This is the anon key (subject to RLS)

The backend should be using `SUPABASE_SERVICE_ROLE_KEY` for storage operations.

## Option 5: Use Storage API Directly

If RLS continues to be an issue, you can use the Supabase Storage REST API directly with the service role key, which completely bypasses RLS:

```python
import httpx

async def upload_file_direct(file_content: bytes, filename: str):
    """Upload file directly using Storage REST API with service role key"""
    url = f"{SUPABASE_URL}/storage/v1/object/books/{filename}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/pdf"  # or application/epub+zip
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, content=file_content, headers=headers)
        response.raise_for_status()
        return response.json()
```

## Current Status

The backend code now uses the admin client (service role key) for all storage operations, which should bypass RLS. If you're still getting RLS errors:

1. Make sure the bucket is public
2. Check that `SUPABASE_SERVICE_ROLE_KEY` is correctly set in Railway
3. Try temporarily dropping the storage policies to test
