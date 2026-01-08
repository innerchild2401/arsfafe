-- =====================================================
-- Initial Database Schema for RAG System
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector"; -- For pgvector

-- =====================================================
-- USER PROFILES (Extends Supabase Auth)
-- =====================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  
  -- Usage Limits
  has_limits BOOLEAN DEFAULT true,
  max_books INTEGER,  -- NULL = unlimited
  max_pages_per_month INTEGER,  -- NULL = unlimited
  max_chat_messages_per_month INTEGER,  -- NULL = unlimited
  
  -- Usage Tracking
  current_books_count INTEGER DEFAULT 0,
  pages_processed_this_month INTEGER DEFAULT 0,
  chat_messages_this_month INTEGER DEFAULT 0,
  month_reset_date TIMESTAMP DEFAULT NOW(),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by UUID REFERENCES user_profiles(id)
);

-- Indexes for user_profiles
CREATE INDEX idx_user_profiles_status ON user_profiles(status);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- =====================================================
-- BOOKS
-- =====================================================
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- File Info
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'epub')),
  file_size BIGINT NOT NULL,
  file_hash TEXT NOT NULL,  -- SHA-256 for deduplication
  file_path TEXT NOT NULL,  -- Supabase Storage path
  
  -- Metadata
  title TEXT,
  author TEXT,
  extracted_text TEXT,  -- Full text (for deduplication check)
  text_hash TEXT,  -- Hash of extracted text (for content deduplication)
  
  -- Processing Status
  status TEXT DEFAULT 'uploaded' CHECK (status IN (
    'uploaded', 
    'processing', 
    'ready', 
    'error'
  )),
  processing_error TEXT,
  
  -- Processing Metadata
  total_pages INTEGER,
  total_chunks INTEGER,
  processed_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Deduplication: Prevent duplicate file uploads
  UNIQUE(file_hash)
);

-- Indexes for books
CREATE INDEX idx_books_file_hash ON books(file_hash);
CREATE INDEX idx_books_text_hash ON books(text_hash);
CREATE INDEX idx_books_status ON books(status);
CREATE INDEX idx_books_file_type ON books(file_type);
CREATE INDEX idx_books_created_at ON books(created_at);

-- =====================================================
-- USER-BOOK ACCESS (Many-to-Many with Soft Delete)
-- =====================================================
CREATE TABLE user_book_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  
  -- Access Info
  is_owner BOOLEAN DEFAULT false,  -- True for original uploader
  access_granted_at TIMESTAMP DEFAULT NOW(),
  granted_by UUID REFERENCES user_profiles(id),  -- NULL if owner
  
  -- Soft Delete (user-specific)
  is_visible BOOLEAN DEFAULT true,  -- False = user deleted it
  deleted_at TIMESTAMP,
  
  UNIQUE(user_id, book_id)
);

-- Indexes for user_book_access
CREATE INDEX idx_user_book_access_user ON user_book_access(user_id);
CREATE INDEX idx_user_book_access_book ON user_book_access(book_id);
CREATE INDEX idx_user_book_access_visible ON user_book_access(user_id, is_visible) WHERE is_visible = true;
CREATE INDEX idx_user_book_access_owner ON user_book_access(book_id, is_owner) WHERE is_owner = true;

-- =====================================================
-- PARENT CHUNKS (Full Chapters/Sections)
-- =====================================================
CREATE TABLE parent_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  
  -- Structure
  chapter_title TEXT,
  section_title TEXT,
  full_text TEXT NOT NULL,
  topic_labels TEXT[],  -- Array of topic labels from GPT-4o-mini
  
  -- Metadata
  page_range TEXT,
  chunk_index INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for parent_chunks
CREATE INDEX idx_parent_chunks_book ON parent_chunks(book_id);
CREATE INDEX idx_parent_chunks_chapter ON parent_chunks(book_id, chapter_title);

-- =====================================================
-- CHILD CHUNKS (Searchable Paragraphs with Embeddings)
-- =====================================================
CREATE TABLE child_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES parent_chunks(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  
  -- Content
  text TEXT NOT NULL,
  embedding VECTOR(1536),  -- text-embedding-3-small = 1536 dimensions
  
  -- Metadata
  paragraph_index INTEGER,
  page_number INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for child_chunks
CREATE INDEX idx_child_chunks_book ON child_chunks(book_id);
CREATE INDEX idx_child_chunks_parent ON child_chunks(parent_id);
-- Using HNSW instead of ivfflat (ivfflat max 2000 dims, text-embedding-3-large is 3072)
CREATE INDEX idx_child_chunks_embedding ON child_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- =====================================================
-- CHAT MESSAGES
-- =====================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  book_id UUID REFERENCES books(id) ON DELETE SET NULL,  -- NULL for general chat
  
  -- Message Content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- RAG Context
  retrieved_chunks UUID[],  -- Array of child_chunk IDs used in response
  sources TEXT[],  -- Array of source citations (e.g., "Book Title, Chapter 3")
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  tokens_used INTEGER,  -- For usage tracking
  model_used TEXT  -- e.g., 'gpt-4o-mini', 'gpt-4o'
);

-- Indexes for chat_messages
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_book ON chat_messages(book_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(user_id, created_at DESC);
CREATE INDEX idx_chat_messages_user_book ON chat_messages(user_id, book_id, created_at DESC);

-- =====================================================
-- PARSING CORRECTIONS (Active Learning)
-- =====================================================
CREATE TABLE parsing_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  book_id UUID REFERENCES books(id),
  
  -- Correction Data
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  correction_type TEXT,  -- 'merge', 'split', 'edit', 'typo_fix'
  context_before TEXT,
  context_after TEXT,
  correction_rule TEXT,  -- Generated rule description
  
  -- Embedding for similarity search
  embedding VECTOR(1536),  -- text-embedding-3-small = 1536 dimensions
  
  -- Usage Tracking
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for parsing_corrections
CREATE INDEX idx_parsing_corrections_user ON parsing_corrections(user_id);
CREATE INDEX idx_parsing_corrections_book ON parsing_corrections(book_id);
CREATE INDEX idx_parsing_corrections_usage ON parsing_corrections(usage_count DESC);
-- HNSW index for vector similarity search (1536 dims fits within 2000 limit)
CREATE INDEX idx_parsing_corrections_embedding ON parsing_corrections USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_parsing_corrections_user ON parsing_corrections(user_id);
CREATE INDEX idx_parsing_corrections_book ON parsing_corrections(book_id);
CREATE INDEX idx_parsing_corrections_usage ON parsing_corrections(usage_count DESC);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update book count when access is created/deleted
CREATE OR REPLACE FUNCTION update_user_book_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_visible = true THEN
    UPDATE user_profiles
    SET current_books_count = current_books_count + 1
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_visible = true AND NEW.is_visible = false THEN
      -- Book was soft deleted
      UPDATE user_profiles
      SET current_books_count = current_books_count - 1
      WHERE id = NEW.user_id;
    ELSIF OLD.is_visible = false AND NEW.is_visible = true THEN
      -- Book was restored
      UPDATE user_profiles
      SET current_books_count = current_books_count + 1
      WHERE id = NEW.user_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.is_visible = true THEN
    UPDATE user_profiles
    SET current_books_count = current_books_count - 1
    WHERE id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for book count updates
CREATE TRIGGER update_book_count_on_access
  AFTER INSERT OR UPDATE OR DELETE ON user_book_access
  FOR EACH ROW EXECUTE FUNCTION update_user_book_count();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_book_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsing_corrections ENABLE ROW LEVEL SECURITY;

-- User Profiles Policies
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Books Policies
CREATE POLICY "Users can view books they have access to"
  ON books FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_book_access
      WHERE book_id = books.id
        AND user_id = auth.uid()
        AND is_visible = true
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can insert books"
  ON books FOR INSERT
  WITH CHECK (true);  -- Will be validated in application logic

CREATE POLICY "Admins can view all books"
  ON books FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- User Book Access Policies
CREATE POLICY "Users can view own access"
  ON user_book_access FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own access"
  ON user_book_access FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own access"
  ON user_book_access FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all access"
  ON user_book_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Parent Chunks Policies
CREATE POLICY "Users can view chunks from accessible books"
  ON parent_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_book_access
      WHERE book_id = parent_chunks.book_id
        AND user_id = auth.uid()
        AND is_visible = true
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Child Chunks Policies
CREATE POLICY "Users can view child chunks from accessible books"
  ON child_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_book_access
      WHERE book_id = child_chunks.book_id
        AND user_id = auth.uid()
        AND is_visible = true
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Chat Messages Policies
CREATE POLICY "Users can view own messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Parsing Corrections Policies
CREATE POLICY "Users can view own corrections"
  ON parsing_corrections FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own corrections"
  ON parsing_corrections FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- =====================================================
-- INITIAL ADMIN USER SETUP
-- =====================================================
-- Note: After running this, you'll need to manually set your user as admin
-- Run this after you've signed up:
-- UPDATE user_profiles SET role = 'admin', status = 'approved' WHERE email = 'your-email@example.com';

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE user_profiles IS 'User profiles extending Supabase Auth with role, status, and usage limits';
COMMENT ON TABLE books IS 'Books uploaded by users with deduplication via file_hash';
COMMENT ON TABLE user_book_access IS 'Many-to-many relationship between users and books with soft delete';
COMMENT ON TABLE parent_chunks IS 'Full chapters/sections (context-rich parent chunks)';
COMMENT ON TABLE child_chunks IS 'Individual paragraphs with embeddings (search-optimized child chunks)';
COMMENT ON TABLE chat_messages IS 'Chat conversation history with RAG context';
COMMENT ON TABLE parsing_corrections IS 'Active learning: user corrections to improve parsing';

COMMENT ON COLUMN books.file_hash IS 'SHA-256 hash of file for deduplication';
COMMENT ON COLUMN books.text_hash IS 'SHA-256 hash of extracted text for content-based deduplication';
COMMENT ON COLUMN user_book_access.is_visible IS 'Soft delete: false means user deleted it, but book remains in DB';
COMMENT ON COLUMN child_chunks.embedding IS 'Vector embedding (1536 dims, text-embedding-3-small) for semantic search';
