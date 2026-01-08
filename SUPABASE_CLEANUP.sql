-- =====================================================
-- Cleanup Script: Drop all indexes if they exist
-- Run this FIRST if you're getting "already exists" errors
-- =====================================================

-- Drop indexes if they exist
DROP INDEX IF EXISTS idx_user_profiles_status;
DROP INDEX IF EXISTS idx_user_profiles_role;
DROP INDEX IF EXISTS idx_user_profiles_email;

DROP INDEX IF EXISTS idx_books_file_hash;
DROP INDEX IF EXISTS idx_books_text_hash;
DROP INDEX IF EXISTS idx_books_status;
DROP INDEX IF EXISTS idx_books_file_type;
DROP INDEX IF EXISTS idx_books_created_at;

DROP INDEX IF EXISTS idx_user_book_access_user;
DROP INDEX IF EXISTS idx_user_book_access_book;
DROP INDEX IF EXISTS idx_user_book_access_visible;
DROP INDEX IF EXISTS idx_user_book_access_owner;

DROP INDEX IF EXISTS idx_parent_chunks_book;
DROP INDEX IF EXISTS idx_parent_chunks_chapter;

DROP INDEX IF EXISTS idx_child_chunks_book;
DROP INDEX IF EXISTS idx_child_chunks_parent;
DROP INDEX IF EXISTS idx_child_chunks_embedding;

DROP INDEX IF EXISTS idx_chat_messages_user;
DROP INDEX IF EXISTS idx_chat_messages_book;
DROP INDEX IF EXISTS idx_chat_messages_created;
DROP INDEX IF EXISTS idx_chat_messages_user_book;

DROP INDEX IF EXISTS idx_parsing_corrections_user;
DROP INDEX IF EXISTS idx_parsing_corrections_book;
DROP INDEX IF EXISTS idx_parsing_corrections_usage;
DROP INDEX IF EXISTS idx_parsing_corrections_embedding;

-- Now you can run SUPABASE_SETUP.sql again
