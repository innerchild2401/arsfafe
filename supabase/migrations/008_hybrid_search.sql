-- =====================================================
-- HYBRID SEARCH SETUP (Vector + Keyword)
-- =====================================================
-- Add tsvector column for full-text search
-- Enable hybrid search combining vector similarity and keyword matching

-- Add tsvector column to child_chunks for full-text search
ALTER TABLE child_chunks ADD COLUMN IF NOT EXISTS text_search_vector tsvector;

-- Create function to update text_search_vector when text changes
CREATE OR REPLACE FUNCTION update_child_chunk_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.text_search_vector := to_tsvector('english', COALESCE(NEW.text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update text_search_vector
DROP TRIGGER IF EXISTS child_chunks_search_vector_update ON child_chunks;
CREATE TRIGGER child_chunks_search_vector_update
  BEFORE INSERT OR UPDATE OF text ON child_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_child_chunk_search_vector();

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_child_chunks_text_search ON child_chunks USING GIN (text_search_vector);

-- Update existing rows (initial population)
UPDATE child_chunks 
SET text_search_vector = to_tsvector('english', COALESCE(text, ''))
WHERE text_search_vector IS NULL;

-- =====================================================
-- HYBRID SEARCH FUNCTION (Vector + Keyword + RRF)
-- =====================================================
-- Reciprocal Rank Fusion (RRF) combines vector and keyword search results

CREATE OR REPLACE FUNCTION match_child_chunks_hybrid(
  query_embedding vector(1536),
  query_text text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  book_ids uuid[] DEFAULT NULL,
  keyword_weight float DEFAULT 0.5,
  vector_weight float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  text text,
  parent_id uuid,
  book_id uuid,
  paragraph_index int,
  page_number int,
  similarity float,
  keyword_rank int,
  vector_rank int,
  combined_score float,
  chapter_title text,
  section_title text,
  book_title text,
  parent_text text
)
LANGUAGE plpgsql
AS $$
DECLARE
  k float := 60.0; -- RRF constant (typically 60)
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      cc.id,
      cc.text,
      cc.parent_id,
      cc.book_id,
      cc.paragraph_index,
      cc.page_number,
      1 - (cc.embedding <=> query_embedding) as similarity,
      ROW_NUMBER() OVER (ORDER BY cc.embedding <=> query_embedding) as rank
    FROM child_chunks cc
    JOIN books b ON cc.book_id = b.id
    WHERE
      (book_ids IS NULL OR cc.book_id = ANY(book_ids))
      AND cc.embedding IS NOT NULL
      AND 1 - (cc.embedding <=> query_embedding) > match_threshold
  ),
  keyword_results AS (
    SELECT
      cc.id,
      cc.text,
      cc.parent_id,
      cc.book_id,
      cc.paragraph_index,
      cc.page_number,
      ts_rank(cc.text_search_vector, plainto_tsquery('english', query_text)) as keyword_score,
      ROW_NUMBER() OVER (ORDER BY ts_rank(cc.text_search_vector, plainto_tsquery('english', query_text)) DESC) as rank
    FROM child_chunks cc
    JOIN books b ON cc.book_id = b.id
    WHERE
      (book_ids IS NULL OR cc.book_id = ANY(book_ids))
      AND cc.text_search_vector IS NOT NULL
      AND cc.text_search_vector @@ plainto_tsquery('english', query_text)
  ),
  combined_results AS (
    SELECT
      COALESCE(v.id, k.id) as id,
      COALESCE(v.text, k.text) as text,
      COALESCE(v.parent_id, k.parent_id) as parent_id,
      COALESCE(v.book_id, k.book_id) as book_id,
      COALESCE(v.paragraph_index, k.paragraph_index) as paragraph_index,
      COALESCE(v.page_number, k.page_number) as page_number,
      COALESCE(v.similarity, 0.0) as similarity,
      v.rank as vector_rank,
      k.rank as keyword_rank,
      -- Reciprocal Rank Fusion (RRF) formula: 1 / (k + rank)
      COALESCE(1.0 / (k + v.rank), 0.0) * vector_weight + 
      COALESCE(1.0 / (k + k.rank), 0.0) * keyword_weight as combined_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results k ON v.id = k.id
  )
  SELECT
    cr.id,
    cr.text,
    cr.parent_id,
    cr.book_id,
    cr.paragraph_index,
    cr.page_number,
    cr.similarity,
    cr.keyword_rank,
    cr.vector_rank,
    cr.combined_score,
    pc.chapter_title,
    pc.section_title,
    b.title as book_title,
    pc.full_text as parent_text
  FROM combined_results cr
  JOIN parent_chunks pc ON cr.parent_id = pc.id
  JOIN books b ON cr.book_id = b.id
  WHERE cr.combined_score > 0
  ORDER BY cr.combined_score DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION match_child_chunks_hybrid TO authenticated;

-- =====================================================
-- CORRECTIONS TABLE (Phase 4: Active Loop)
-- =====================================================

CREATE TABLE IF NOT EXISTS chat_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  book_id UUID REFERENCES books(id) ON DELETE SET NULL,
  chunk_id UUID REFERENCES child_chunks(id) ON DELETE SET NULL,
  
  -- Original incorrect response
  original_message TEXT NOT NULL,
  original_response TEXT NOT NULL,
  original_chunks UUID[],
  
  -- User correction
  incorrect_text TEXT NOT NULL, -- The part of the response that was wrong
  correct_text TEXT NOT NULL, -- What the user says it should be
  user_feedback TEXT, -- Additional context from user
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  corrected_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for corrections
CREATE INDEX IF NOT EXISTS idx_chat_corrections_user ON chat_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_corrections_book ON chat_corrections(book_id);
CREATE INDEX IF NOT EXISTS idx_chat_corrections_chunk ON chat_corrections(chunk_id);
CREATE INDEX IF NOT EXISTS idx_chat_corrections_created ON chat_corrections(created_at DESC);

-- Enable RLS
ALTER TABLE chat_corrections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for corrections
DROP POLICY IF EXISTS "Users can view their own corrections" ON chat_corrections;
CREATE POLICY "Users can view their own corrections"
  ON chat_corrections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own corrections" ON chat_corrections;
CREATE POLICY "Users can insert their own corrections"
  ON chat_corrections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage corrections" ON chat_corrections;
CREATE POLICY "Service role can manage corrections"
  ON chat_corrections FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
