-- =====================================================
-- PROCESSING LOGS TABLE
-- =====================================================
-- Stores real-time processing logs for book uploads
-- Allows frontend to display progress during processing

CREATE TABLE IF NOT EXISTS processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  
  -- Log Entry
  log_message TEXT NOT NULL,
  log_level TEXT NOT NULL CHECK (log_level IN ('info', 'success', 'error', 'warning')),
  
  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_processing_logs_book ON processing_logs(book_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_created ON processing_logs(book_id, created_at DESC);

-- RLS Policies
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see logs for books they have access to
CREATE POLICY IF NOT EXISTS "Users can view logs for their books"
  ON processing_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_book_access
      WHERE user_book_access.book_id = processing_logs.book_id
      AND user_book_access.user_id = auth.uid()
      AND user_book_access.is_visible = true
    )
  );

-- Service role can insert/update logs (for backend processing)
CREATE POLICY IF NOT EXISTS "Service role can insert logs"
  ON processing_logs
  FOR INSERT
  WITH CHECK (true);

-- Function to clean up old logs (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_processing_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM processing_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
