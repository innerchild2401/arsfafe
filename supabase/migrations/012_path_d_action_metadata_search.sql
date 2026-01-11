-- =====================================================
-- PATH D ACTION METADATA SEARCH FUNCTION
-- =====================================================
-- Prioritizes chunks whose parent chunks have action_metadata tags
-- Used by Path D (Action Planner) to find methodology/framework/script chunks

CREATE OR REPLACE FUNCTION match_child_chunks_with_action_metadata(
  query_embedding vector(1536),
  query_text text,
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 10,
  book_ids uuid[] DEFAULT NULL,
  keyword_weight float DEFAULT 0.5,
  vector_weight float DEFAULT 0.5,
  action_metadata_tags text[] DEFAULT NULL  -- ['framework', 'script', 'derivation'] or NULL for any
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
  parent_text text,
  action_metadata jsonb,
  action_metadata_boost float  -- Boost score for action metadata (1.5x for tagged chunks)
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
  ),
  scored_results AS (
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
      -- Apply action metadata boost: 1.5x score if parent has matching action_metadata tags
      CASE 
        WHEN pc.action_metadata IS NOT NULL 
          AND (
            action_metadata_tags IS NULL  -- If no filter, boost any action_metadata
            OR (
              pc.action_metadata->'tags' IS NOT NULL
              AND EXISTS (
                SELECT 1 
                FROM jsonb_array_elements_text(pc.action_metadata->'tags') AS tag
                WHERE tag = ANY(action_metadata_tags)
              )
            )
          )
        THEN cr.combined_score * 1.5
        ELSE cr.combined_score
      END as combined_score,
      pc.chapter_title,
      pc.section_title,
      b.title as book_title,
      pc.full_text as parent_text,
      pc.action_metadata,
      CASE 
        WHEN pc.action_metadata IS NOT NULL 
          AND (
            action_metadata_tags IS NULL
            OR (
              pc.action_metadata->'tags' IS NOT NULL
              AND EXISTS (
                SELECT 1 
                FROM jsonb_array_elements_text(pc.action_metadata->'tags') AS tag
                WHERE tag = ANY(action_metadata_tags)
              )
            )
          )
        THEN 1.5
        ELSE 1.0
      END as action_metadata_boost
    FROM combined_results cr
    JOIN parent_chunks pc ON cr.parent_id = pc.id
    JOIN books b ON cr.book_id = b.id
    WHERE cr.combined_score > 0
  )
  SELECT * FROM scored_results
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION match_child_chunks_with_action_metadata TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION match_child_chunks_with_action_metadata IS 'Hybrid search function for Path D (Action Planner). Prioritizes chunks whose parent chunks have action_metadata tags (framework, script, derivation). Boosts score by 1.5x for tagged chunks.';
