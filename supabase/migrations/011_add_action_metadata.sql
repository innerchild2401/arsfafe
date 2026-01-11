-- =====================================================
-- ADD ACTION METADATA COLUMN TO PARENT_CHUNKS TABLE
-- =====================================================

-- Add action_metadata column to store methodology tags (framework, script, derivation)
-- This enables Path D to find action-oriented content during ingestion
ALTER TABLE parent_chunks ADD COLUMN IF NOT EXISTS action_metadata JSONB;

-- Create index for faster lookups on JSONB content
-- This allows efficient queries like: WHERE action_metadata ? 'framework'
CREATE INDEX IF NOT EXISTS idx_parent_chunks_action_metadata ON parent_chunks USING GIN (action_metadata);

-- Add comment for documentation
COMMENT ON COLUMN parent_chunks.action_metadata IS 'Action metadata tags for Path D (Action Planner). Tags: "framework", "script", "derivation". Stored as JSONB array or object.';
