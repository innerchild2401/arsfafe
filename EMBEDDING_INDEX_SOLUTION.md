# Embedding Index Solution

## Problem
Supabase's pgvector version has a 2000 dimension limit for indexes, but `text-embedding-3-large` uses 3072 dimensions.

## Solutions

### Option 1: Use text-embedding-3-small (Recommended) ⭐
- **Dimensions**: 1536 (fits in index limit)
- **Cost**: 80% cheaper than large
- **Quality**: ~95% of large model quality
- **Index**: Can create HNSW index

**Implementation**:
```sql
-- After switching to text-embedding-3-small, add index:
CREATE INDEX idx_child_chunks_embedding ON child_chunks 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_parsing_corrections_embedding ON parsing_corrections 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

**Update schema**:
```sql
-- Change embedding column dimension
ALTER TABLE child_chunks ALTER COLUMN embedding TYPE vector(1536);
ALTER TABLE parsing_corrections ALTER COLUMN embedding TYPE vector(1536);
```

### Option 2: Keep text-embedding-3-large (No Index)
- **Dimensions**: 3072 (no index possible)
- **Cost**: Higher
- **Quality**: Best
- **Performance**: Sequential scan (slower for large datasets, but works)

**For small-medium datasets (<100K chunks)**: Sequential scan is acceptable
**For large datasets (>100K chunks)**: Consider Option 1

### Option 3: Upgrade pgvector (Future)
- Wait for Supabase to upgrade pgvector
- Then add indexes for 3072-dim vectors

## Recommendation

**Start with Option 1** (text-embedding-3-small):
- ✅ Fits index limit
- ✅ Much cheaper
- ✅ 95% quality (usually sufficient)
- ✅ Better performance with index

**If quality is critical**, use Option 2 (large, no index) for now, then switch to small later.

## Current Status

The SQL schema now runs without embedding indexes. You can:
1. Proceed with development
2. Use text-embedding-3-small (recommended)
3. Add indexes later when ready
