-- =====================================================
-- Fix Infinite Recursion in user_profiles RLS Policies
-- =====================================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Create a security definer function to check if user is admin
-- This function bypasses RLS, preventing infinite recursion
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id AND role = 'admin'
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin(uuid) TO anon;

-- Recreate admin policies using the function (no recursion)
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  USING (is_admin(auth.uid()));

-- Also fix the books policies that have the same issue
DROP POLICY IF EXISTS "Admins can view all books" ON books;

CREATE POLICY "Admins can view all books"
  ON books FOR SELECT
  USING (is_admin(auth.uid()));

-- Fix user_book_access admin policy
DROP POLICY IF EXISTS "Admins can view all access" ON user_book_access;

CREATE POLICY "Admins can view all access"
  ON user_book_access FOR SELECT
  USING (is_admin(auth.uid()));

-- Fix books policy that references user_profiles
DROP POLICY IF EXISTS "Users can view books they have access to" ON books;

CREATE POLICY "Users can view books they have access to"
  ON books FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_book_access
      WHERE book_id = books.id
        AND user_id = auth.uid()
        AND is_visible = true
    )
    OR is_admin(auth.uid())
  );

-- Fix parent_chunks policies
DROP POLICY IF EXISTS "Users can view chunks from accessible books" ON parent_chunks;

CREATE POLICY "Users can view chunks from accessible books"
  ON parent_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_book_access
      WHERE book_id = parent_chunks.book_id
        AND user_id = auth.uid()
        AND is_visible = true
    )
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can view all chunks" ON parent_chunks;

CREATE POLICY "Admins can view all chunks"
  ON parent_chunks FOR SELECT
  USING (is_admin(auth.uid()));

-- Fix child_chunks policies
DROP POLICY IF EXISTS "Users can view child chunks from accessible books" ON child_chunks;

CREATE POLICY "Users can view child chunks from accessible books"
  ON child_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_book_access
      WHERE book_id = child_chunks.book_id
        AND user_id = auth.uid()
        AND is_visible = true
    )
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can view all child chunks" ON child_chunks;

CREATE POLICY "Admins can view all child chunks"
  ON child_chunks FOR SELECT
  USING (is_admin(auth.uid()));

-- Fix chat_messages admin policy
DROP POLICY IF EXISTS "Admins can view all messages" ON chat_messages;

CREATE POLICY "Admins can view all messages"
  ON chat_messages FOR SELECT
  USING (is_admin(auth.uid()));
