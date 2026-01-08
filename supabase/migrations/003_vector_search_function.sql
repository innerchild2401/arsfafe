-- =====================================================
-- Vector Search Function for RAG
-- =====================================================

CREATE OR REPLACE FUNCTION match_child_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  book_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  text text,
  parent_id uuid,
  book_id uuid,
  paragraph_index int,
  page_number int,
  similarity float,
  chapter_title text,
  section_title text,
  book_title text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.text,
    cc.parent_id,
    cc.book_id,
    cc.paragraph_index,
    cc.page_number,
    1 - (cc.embedding <=> query_embedding) as similarity,
    pc.chapter_title,
    pc.section_title,
    b.title as book_title
  FROM child_chunks cc
  JOIN parent_chunks pc ON cc.parent_id = pc.id
  JOIN books b ON cc.book_id = b.id
  WHERE
    (book_ids IS NULL OR cc.book_id = ANY(book_ids))
    AND cc.embedding IS NOT NULL
    AND 1 - (cc.embedding <=> query_embedding) > match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION match_child_chunks TO authenticated;
