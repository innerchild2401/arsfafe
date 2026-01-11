-- =====================================================
-- ADD ARTIFACT COLUMN TO CHAT_MESSAGES FOR PATH D
-- =====================================================

-- Add artifact column to store structured JSON artifacts (checklist/notebook/script)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS artifact JSONB;

-- Create index for faster lookups (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_chat_messages_artifact ON chat_messages USING GIN (artifact);

-- Add comment for documentation
COMMENT ON COLUMN chat_messages.artifact IS 'Structured JSON artifact for Path D (Action Planner): checklist, notebook, or script artifacts with steps/cells/scenes';
