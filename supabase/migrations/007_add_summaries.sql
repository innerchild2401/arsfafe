-- =====================================================
-- ADD SUMMARIES FOR TWO-PATH CHAT STRATEGY
-- =====================================================
-- Pre-computed summaries for global queries (summarize, overview)
-- Chapter summaries for better book-level summarization

-- Add global_summary to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS global_summary TEXT;

-- Add concise_summary to parent_chunks (chapter summaries)
ALTER TABLE parent_chunks ADD COLUMN IF NOT EXISTS concise_summary TEXT;

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_books_global_summary ON books(book_id) WHERE global_summary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_chunks_concise_summary ON parent_chunks(book_id) WHERE concise_summary IS NOT NULL;
