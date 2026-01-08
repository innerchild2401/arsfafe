-- =====================================================
-- Storage Bucket Policies for 'books' bucket
-- =====================================================
-- Note: This assumes the 'books' bucket has been created in the Supabase dashboard.
-- Storage buckets cannot be created via SQL - they must be created in the dashboard.
--
-- To create the bucket:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket"
-- 3. Name: "books"
-- 4. Public: Yes (or No, depending on your needs)
-- 5. File size limit: Set appropriately (e.g., 100 MB)
-- 6. Allowed MIME types: application/pdf, application/epub+zip (or leave empty)
--
-- After creating the bucket, run this migration to set up RLS policies.

-- =====================================================
-- Storage Object Policies (for files in the bucket)
-- =====================================================

-- Policy: Authenticated users can view all files in the books bucket
-- This allows users to access their uploaded books
DROP POLICY IF EXISTS "Authenticated users can view books" ON storage.objects;
CREATE POLICY "Authenticated users can view books"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'books');

-- Policy: Authenticated users can upload files to the books bucket
-- This allows users to upload their books
DROP POLICY IF EXISTS "Authenticated users can upload books" ON storage.objects;
CREATE POLICY "Authenticated users can upload books"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'books');

-- Policy: Users can update their own files
-- This allows users to replace/update files they uploaded
-- Note: This uses the owner metadata. If you want to track ownership differently,
-- you may need to adjust this policy based on your file naming convention.
DROP POLICY IF EXISTS "Users can update own books" ON storage.objects;
CREATE POLICY "Users can update own books"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'books' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'books' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: Users can delete their own files
-- Similar to update, this allows users to delete files they uploaded
DROP POLICY IF EXISTS "Users can delete own books" ON storage.objects;
CREATE POLICY "Users can delete own books"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'books' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: Admins can do everything
-- This allows admins to manage all files regardless of ownership
DROP POLICY IF EXISTS "Admins can manage all books" ON storage.objects;
CREATE POLICY "Admins can manage all books"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'books' 
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'books' 
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- =====================================================
-- Alternative: Simpler Policies (if you don't need per-user ownership)
-- =====================================================
-- If you want all authenticated users to be able to manage all files,
-- you can use these simpler policies instead:

-- DROP POLICY IF EXISTS "Users can update own books" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can delete own books" ON storage.objects;

-- DROP POLICY IF EXISTS "Authenticated users can update books" ON storage.objects;
-- CREATE POLICY "Authenticated users can update books"
-- ON storage.objects FOR UPDATE
-- TO authenticated
-- USING (bucket_id = 'books')
-- WITH CHECK (bucket_id = 'books');

-- DROP POLICY IF EXISTS "Authenticated users can delete books" ON storage.objects;
-- CREATE POLICY "Authenticated users can delete books"
-- ON storage.objects FOR DELETE
-- TO authenticated
-- USING (bucket_id = 'books');

-- =====================================================
-- Notes:
-- =====================================================
-- 1. The backend uses the service role key, which bypasses RLS.
--    These policies are mainly for frontend access if needed.
-- 2. File ownership tracking: The current implementation stores files
--    with UUID filenames. If you want to track ownership, you could:
--    - Store user_id in the file path (e.g., books/{user_id}/{filename})
--    - Store ownership metadata in the database
--    - Use Supabase Storage metadata features
-- 3. For production, consider making the bucket private and using
--    signed URLs for file access instead of public access.
