-- =====================================================
-- ADD CHUNK_MAP TO CHAT_MESSAGES FOR CITATION MAPPING
-- =====================================================

-- Add chunk_map column to store persistent ID -> UUID mapping
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS chunk_map JSONB DEFAULT '{}'::jsonb;

-- Create index for faster lookups (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_chat_messages_chunk_map ON chat_messages USING GIN (chunk_map);

-- Add comment for documentation
COMMENT ON COLUMN chat_messages.chunk_map IS 'Maps persistent chunk IDs (#chk_xxxx) to chunk UUIDs for citation lookup';
