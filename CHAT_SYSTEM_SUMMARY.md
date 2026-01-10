# Chat/RAG System Summary: How Zorxido Works

## Overview

Zorxido is an AI assistant that answers questions about books uploaded by users. It uses a **Three-Path Brain Strategy** to intelligently route queries based on intent: pre-computed summaries for overviews, hybrid search for specific questions, or deep reasoning model for complex analysis.

---

## Architecture: Three-Path Brain Strategy

### Path B (Global Query) - Fast & Efficient
**Triggers when:** User asks for summaries, overviews, or "what is this book about"  
**Method:** Pre-computed summaries or Table of Contents inference  
**Model:** `gpt-4o-mini` (from `settings.chat_model`)  
**Temperature:** 0.4 (deterministic)  
**Speed:** ~1-2 seconds (no vector search needed)  
**Cost:** Low (~$0.001-0.01 per query)  
**Chunks:** None (uses pre-computed summaries)

### Path A (Specific Query) - Hybrid Search
**Triggers when:** User asks specific questions about content (default fallback)  
**Method:** Hybrid search (vector similarity + keyword matching via RRF)  
**Model:** `gpt-4o-mini` (from `settings.chat_model`)  
**Temperature:** 0.7 (balanced creativity)  
**Speed:** ~2-4 seconds (embedding + hybrid search + LLM call)  
**Cost:** Moderate (~$0.01-0.05 per query)  
**Chunks:** 5 (specific queries) or 10 (general queries)

### Path C (Deep Reasoner) - Complex Analysis
**Triggers when:** Keywords like "analyze", "compare", "why", "connect", "relationship", "contrast", "difference between"  
**Method:** Hybrid search with broader context + reasoning model  
**Model:** `gpt-4o` (from `settings.reasoning_model`)  
**Temperature:** 0.5 (balanced for reasoning)  
**Speed:** ~3-5 seconds (embedding + hybrid search + complex reasoning)  
**Cost:** Higher (~$0.05-0.15 per query, GPT-4o pricing)  
**Chunks:** 15 (broader context for deep analysis)

---

## Path Priority & Selection

```
1. Name Question → Direct Response (hardcoded, no search)
2. Path B → Global Query (if single book + summary keywords)
3. Path C → Deep Reasoner (if reasoning keywords + book_id)
4. Path A → Specific Query (default fallback)
```

### Intent Detection Keywords

**Reasoning Query (Path C):**
```python
["analyze", "analyse", "analysis", "compare", "comparison", "contrast",
 "why", "how does", "how is", "how are", "what causes", "what leads to",
 "connect", "connection", "relationship", "relate", "correlate",
 "explain why", "what is the relationship", "what is the connection",
 "difference between", "similarities between", "distinguish"]
```

**Global Query (Path B):**
```python
["summarize", "summarise", "summary", "overview", "what is this book about",
 "what is the book about", "tell me about this book", "describe this book",
 "what does this book cover", "book summary"]
```

**Note:** Global queries take precedence UNLESS reasoning keywords are detected (reasoning queries bypass global path).

---

## What We Retrieve & How

### 1. Hybrid Search (Path A & Path C)

**Method:** Reciprocal Rank Fusion (RRF) combining vector and keyword search

**Vector Search:**
- **Model:** `text-embedding-3-small` (OpenAI)
- **Dimensions:** 1536
- **Index:** HNSW (Hierarchical Navigable Small World)
- **Distance Metric:** Cosine similarity (`<=>` operator)
- **Index Parameters:** `m = 16, ef_construction = 64`
- **Similarity Calculation:** `1 - (embedding <=> query_embedding)`
- **Storage:** `child_chunks.embedding` column

**Keyword Search:**
- **Method:** Full-text search using PostgreSQL `tsvector`
- **Index:** GIN index on `text_search_vector`
- **Language:** English (`plainto_tsquery('english', query_text)`)
- **Ranking:** `ts_rank()` function
- **Storage:** `child_chunks.text_search_vector` (auto-updated via trigger)

**RRF Combination:**
- **Formula:** `(1 / (k + vector_rank)) * vector_weight + (1 / (k + keyword_rank)) * keyword_weight`
- **RRF Constant (k):** 60.0
- **Weights:** 
  - `vector_weight`: 0.5 (50%)
  - `keyword_weight`: 0.5 (50%)
- **Function:** `match_child_chunks_hybrid()` (PostgreSQL RPC)

**Fallback:** If hybrid search fails, falls back to pure vector search using `match_child_chunks()` function.

### 2. Pre-Computed Summaries (Path B)

**Book-level:** `books.global_summary`
- Executive summary of entire book
- Generated during book processing
- Temperature: 0.4, max 10K chars (combined chapter summaries)

**Section-level:** `parent_chunks.concise_summary`
- 3-4 sentence summaries per section
- Used for aggregation into chapter summaries
- Temperature: 0.3, max 5K chars input

**Table of Contents Fallback:**
- If `global_summary` doesn't exist (older books)
- Fetches chapter titles, section titles, topic labels (max 30 chapters, 50 topics)
- LLM infers summary from ToC structure
- Model: `gpt-4o-mini`, Temperature: 0.4

### 3. Parent-Child Context Enhancement

**Phase 2: Parent-Child Retrieval** (after chunk search)
- **Function:** `get_parent_context_for_chunks()`
- **Process:**
  1. Collect unique parent IDs from retrieved child chunks
  2. Batch fetch all parent chunks (single query)
  3. Enhance each child chunk with parent's `full_text`
  4. Preserve child chunk text as `reference_text`

**Result:**
- Uses parent chunk's `full_text` for context (better flow for LLM)
- Keeps child chunk text for reference
- Includes chapter_title, section_title from parent

---

## Similarity Thresholds & Chunk Counts

### Path A (Specific Query)
- **Specific queries:** 0.7 threshold, 5 chunks
- **General queries:** 0.5 threshold, 10 chunks
- **Fallback layers:**
  1. Try hybrid search with threshold
  2. Fallback to vector search if hybrid fails
  3. Try 0.3 threshold if no results
  4. Get any chunks with embeddings
  5. Get any chunks (even without embeddings)
  6. Return error if still nothing

### Path C (Deep Reasoner)
- **Threshold:** 0.6 (broader than Path A)
- **Chunk count:** 15 (more context for analysis)
- **Same fallback strategy as Path A**

---

## Context Building & Citations

### Phase 3: Persistent Citations

**Citation Format:** `#chk_xxxx` (8 hex characters from MD5 hash of chunk UUID)

**Generation:**
```python
hash_obj = hashlib.md5(chunk_uuid.encode())
short_id = hash_obj.hexdigest()[:8]
persistent_id = f"#chk_{short_id}"
```

**Context Format:**
```
#chk_a1b2c3d4 {parent_chunk_full_text}

#chk_e5f6g7h8 {parent_chunk_full_text}
```

**Chunk Mapping:**
- **Purpose:** Map persistent IDs (`#chk_xxxx`) to chunk UUIDs for frontend lookup
- **Storage:** `chat_messages.chunk_map` (JSONB column)
- **Format:** `{"#chk_a1b2c3d4": "chunk-uuid-here", ...}`
- **Usage:** Frontend uses this to fetch full chunk data on citation click

**Source Attribution:**
- Format: `"Book Title, Chapter Title, Section Title"`
- Deduplicated by `book_title|chapter|section` key
- Included in response `sources` array

### Active Learning (Corrections Context)

**Phase 4: Active Loop** (before response generation)
- **Function:** `get_relevant_corrections(user_id, message, book_id, limit=3)`
- **Process:**
  1. Query `chat_corrections` table for user's corrections
  2. Filter by book_id (if specified)
  3. Return top 3 relevant corrections
  4. Build corrections context string

**Injection:**
- Corrections context prepended to system prompt
- Helps LLM learn from past mistakes
- Format: `"{corrections_context}\n\nCORE INSTRUCTIONS:..."`

---

## LLM Model Calls & Prompts

### Path B: Pre-Computed Summary

**System Prompt:**
```
You are Zorxido, a helpful AI assistant. The user asked for a high-level summary.
DO NOT search for specific details.
I have provided you with a Pre-Computed Executive Summary of the document below.
Use this summary to answer the user's request in a structured format.

Document Title: {title}
Author: {author}

Executive Summary:
{global_summary}

Instruction: Present this summary in a clear, structured format. If the user asked to "summarize" or asked "what is this book about", provide a comprehensive overview covering: Introduction (overview of the book's purpose), Key Themes (main arguments and concepts), and Conclusion (overall message and takeaways).
```

**Model:** `gpt-4o-mini`  
**Temperature:** 0.4  
**Messages:**
- System: Summary prompt
- User: Original user message

**Saved as:** `model_used: "global_summary_path"` or `"toc_hack_path"`

### Path C: Deep Reasoner

**System Prompt (Investigator):**
```
You are Zorxido, an expert AI investigator that analyzes information from books with deep reasoning and critical thinking.

{corrections_context}

CORE INSTRUCTIONS:
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are an INVESTIGATOR, not just a summarizer. You think critically, analyze relationships, and detect conflicts.
- ALWAYS cite your sources using the persistent citation format (e.g., #chk_a1b2c3d4) that appears before each chunk.

DEEP REASONING MODE:
- Don't just summarize the chunks. Explicitly look for:
  * Contradictions or conflicting information between different chunks
  * Underlying themes or patterns across chunks
  * Causal relationships (what leads to what)
  * Comparisons and contrasts between concepts
  * Connections and correlations between ideas

CONFLICT DETECTION (CRITICAL):
- If the retrieved chunks offer multiple potential answers (e.g., two different dates, conflicting explanations, contradictory statements), DO NOT guess.
- Explicitly list the conflict: "I found conflicting information: In #chk_xxx it says X, but in #chk_yyy it says Y."
- Ask the user to clarify which source/document version they trust, or if they want you to investigate further.

ACTIVE ANALYSIS:
- Compare information across chunks: "When comparing #chk_xxx and #chk_yyy, we see..."
- Identify relationships: "There appears to be a connection between..."
- Explain causality: "Based on #chk_xxx, this leads to... because..."
- Highlight patterns: "A recurring theme across multiple chunks is..."

ACCURACY AND HONESTY:
- If the context doesn't contain enough information to fully answer, say so explicitly.
- Base your analysis only on the provided chunks. Don't hallucinate.
- Stay focused on the content from the user's books.
- If asked about topics not in the books, politely redirect to what you can help with.

FORMAT:
- Use structured reasoning: explain your thought process step by step.
- Cite sources inline as you make claims: "According to #chk_xxx, the revenue grew..."
- If you detect conflicts, use a clear "CONFLICT DETECTED" section.
```

**Model:** `gpt-4o` (from `settings.reasoning_model`)  
**Temperature:** 0.5  
**Messages:**
- System: Investigator prompt with corrections context
- User: `"Context from books:\n\n{context}\n\nQuestion: {user_message}"`

**Saved as:** `model_used: "deep_reasoner_gpt-4o"`

### Path A: Hybrid Search

**System Prompt (Investigator - same as Path C but simpler analysis):**
```
You are Zorxido, an expert AI assistant and investigator that answers questions based on the provided context from books with critical thinking and attention to detail.

{corrections_context}

CORE INSTRUCTIONS:
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are designed to help users understand and explore their uploaded books.
- ALWAYS cite your sources using the persistent citation format (e.g., #chk_a1b2c3d4) that appears before each chunk in the context.

INVESTIGATOR MODE:
- You are an ACTIVE INVESTIGATOR, not just a passive summarizer.
- Don't just summarize the chunks. Look for:
  * Contradictions or conflicting information between different chunks
  * Underlying themes or patterns across chunks
  * Connections and relationships between ideas
  * Multiple perspectives on the same topic

CONFLICT DETECTION (CRITICAL):
- If the retrieved chunks offer multiple potential answers (e.g., two different dates for an event, conflicting explanations, contradictory statements), DO NOT guess.
- Explicitly list the conflict: "I found conflicting information: In #chk_xxx it says X, but in #chk_yyy it says Y."
- Ask the user to clarify which document version they trust, or if they want you to investigate further.
- This builds massive trust - users will think "Wow, it spotted a conflict I missed."

ACCURACY AND HONESTY:
- Use the context provided to answer questions. If the user asks to "summarise" or "summarize" a book, provide a comprehensive summary based on all the context provided.
- If the context doesn't contain enough information to fully answer a question, explicitly state what information is missing and answer based on what is available.
- Mention that your answer is based on the provided context.
- Stay focused on the content from the user's books. If asked about topics not in the books, politely redirect to what you can help with based on their uploaded content.

CITATION FORMAT:
- Always cite sources inline as you make claims: "According to #chk_xxx, the revenue grew..."
- For general questions like "summarise this book", use all the provided context to create a comprehensive summary with proper citations throughout.

FORMAT:
- Use structured reasoning when appropriate: explain your thought process step by step.
- If you detect conflicts, use a clear "CONFLICT DETECTED" section before proceeding.
- Be thorough but concise.
```

**Model:** `gpt-4o-mini` (from `settings.chat_model`)  
**Temperature:** 0.7  
**Messages:**
- System: Investigator prompt with corrections context
- User: `"Context from books:\n\n{context}\n\nQuestion: {user_message}"`

**Saved as:** `model_used: "investigator_gpt-4o-mini"`

---

## Response Storage

Every interaction is saved to `chat_messages` table with:

**User Message:**
- `user_id`: UUID
- `book_id`: UUID (nullable, NULL for multi-book queries)
- `role`: "user"
- `content`: User's message text
- `tokens_used`: NULL
- `model_used`: NULL

**Assistant Message:**
- `user_id`: UUID
- `book_id`: UUID (nullable)
- `role`: "assistant"
- `content`: Assistant's response text
- `retrieved_chunks`: UUID[] (array of chunk UUIDs used)
- `sources`: TEXT[] (array of source strings like "Book Title, Chapter Title")
- `chunk_map`: JSONB (map of persistent IDs to chunk UUIDs: `{"#chk_xxxx": "uuid"}`)
- `tokens_used`: INTEGER (from OpenAI usage)
- `model_used`: TEXT (e.g., "global_summary_path", "toc_hack_path", "deep_reasoner_gpt-4o", "investigator_gpt-4o-mini", "direct_response", "no_context_response")

**Usage Tracking:**
- Updates `user_profiles.chat_messages_this_month` after each successful response

---

## Configuration

### Model Settings (from `backend/app/config.py`)

```python
# Embedding Model
embedding_model: str = "text-embedding-3-small"
embedding_dimensions: int = 1536

# LLM Models
structure_model: str = "gpt-4o-mini"        # Book processing
chat_model: str = "gpt-4o-mini"             # Path A & Path B
reasoning_model: str = "gpt-4o"             # Path C (deep reasoning)
labeling_model: str = "gpt-4o-mini"         # Topic generation
```

### Vector Search Configuration

- **Index Type:** HNSW (Hierarchical Navigable Small World)
- **Distance Metric:** Cosine similarity (`<=>` operator)
- **Index Parameters:** `m = 16, ef_construction = 64`
- **Similarity Calculation:** `1 - (embedding <=> query_embedding)`
- **Storage:** `child_chunks.embedding` column (VECTOR(1536))

### Keyword Search Configuration

- **Method:** PostgreSQL full-text search
- **Index:** GIN index on `text_search_vector`
- **Language:** English
- **Ranking:** `ts_rank(text_search_vector, plainto_tsquery('english', query_text))`
- **Storage:** `child_chunks.text_search_vector` (tsvector, auto-updated via trigger)

### Hybrid Search Configuration

- **Function:** `match_child_chunks_hybrid()` (PostgreSQL RPC)
- **RRF Constant (k):** 60.0
- **Weights:** 
  - `vector_weight`: 0.5 (50%)
  - `keyword_weight`: 0.5 (50%)
- **Fallback:** `match_child_chunks()` (pure vector search)

---

## Frontend Citation Interaction

### Citation Parsing (in `QuantumChat.tsx`)

**Format Detection:** Regex `/#chk_[a-f0-9]{8}/gi` matches citations in response text

**Process:**
1. Parse citations from assistant message content
2. Map persistent ID (`#chk_xxxx`) to chunk UUID using `chunk_map`
3. Extract chunk text snippet (next ~200 chars after citation)
4. Render `CitationTooltip` component for each citation

### CitationTooltip Component

**Hover Behavior:**
- Shows tooltip on `onMouseEnter`
- Displays chunk text preview (~200 chars)
- Shows source information
- Shows "Click to view full context →" hint if clickable

**Click Behavior:**
- Calls `handleCitationClick(chunkId)`
- Fetches full chunk data from `/api/books/chunks/{chunkId}`
- Opens `ChunkViewerPanel` sliding from right

### ChunkViewerPanel Component

**Displays:**
- Book title and author
- Chapter and section titles
- Topic labels (if available)
- Concise summary (if available)
- Full parent context text
- Exact paragraph (child chunk text)
- Metadata (paragraph index, page number, chunk ID)

**Panel Behavior:**
- Slides in from right with animation
- Mobile overlay on small screens
- Close button in header

---

## Capabilities

### ✅ What It Can Do

1. **Answer specific questions** about book content using hybrid search (Path A)
2. **Summarize entire books** using pre-computed summaries (Path B - fast, cheap)
3. **Deep analysis** with reasoning model for complex queries (Path C)
4. **Detect conflicts** between chunks and explicitly report them
5. **Multi-book queries** (when `book_id` is null, searches across all user's books)
6. **Persistent citations** with `#chk_xxxx` format for clickable chunk viewing
7. **Parent-child context** retrieval (uses parent chunk's full text for better context)
8. **Active learning** from user corrections (injected into prompts)
9. **Graceful fallbacks** if vector search fails (multiple layers)
10. **Usage tracking** (tokens, messages per month)

### ⚠️ Limitations

1. **Single book only for Path B** - Summaries only work for one book at a time
2. **No real-time summary generation** - Must be pre-computed during processing
3. **ToC hack is inferential** - Less accurate than pre-computed summaries
4. **Embedding dependency** - Path A & C require chunks to have embeddings
5. **No cross-book synthesis** - Can search multiple books but won't synthesize across them intelligently
6. **Max context limits** - Limited by LLM token limits (currently ~15 chunks max for Path C)
7. **Path C requires book_id** - Deep reasoning only works for single book queries

---

## Performance Characteristics

### Path B (Summaries)
- **Latency:** ~1-2 seconds (single LLM call, no vector search)
- **Cost:** ~$0.001-0.01 per query (GPT-4o-mini pricing)
- **Scalability:** Excellent (no vector search overhead)

### Path A (Hybrid Search)
- **Latency:** ~2-4 seconds (embedding + hybrid search + LLM call)
- **Cost:** ~$0.01-0.05 per query (embedding + GPT-4o-mini with context)
- **Scalability:** Good (HNSW index is fast, hybrid search adds minimal overhead)

### Path C (Deep Reasoner)
- **Latency:** ~3-5 seconds (embedding + hybrid search + GPT-4o reasoning)
- **Cost:** ~$0.05-0.15 per query (GPT-4o pricing, 15 chunks context)
- **Scalability:** Moderate (more expensive model, larger context)

---

## Example Query Flows

### Example 1: "Can you summarize this book?"
1. ✅ Detected as global query (keywords: "summarize")
2. ✅ Path B selected (single book + global query)
3. ✅ Check `global_summary` exists in database
4. ✅ Use pre-computed summary
5. ✅ Format with GPT-4o-mini (temperature 0.4)
6. ✅ Return structured summary
7. **Model:** `gpt-4o-mini`  
8. **Saved as:** `model_used: "global_summary_path"`

### Example 2: "What is the bond maturity date mentioned in Chapter 3?"
1. ✅ Detected as specific query (no global/reasoning keywords)
2. ✅ Path A selected (default fallback)
3. ✅ Generate query embedding using `text-embedding-3-small`
4. ✅ Hybrid search with 0.7 threshold (vector + keyword via RRF)
5. ✅ Retrieve top 5 relevant chunks
6. ✅ Enhance with parent context (get parent full_text)
7. ✅ Build context with persistent citations (`#chk_xxxx`)
8. ✅ Generate chunk_map (persistent ID → UUID mapping)
9. ✅ Inject corrections context (if available)
10. ✅ Generate response with GPT-4o-mini (temperature 0.7, investigator prompt)
11. ✅ Return answer with inline `#chk_xxx` citations
12. **Model:** `gpt-4o-mini`  
13. **Saved as:** `model_used: "investigator_gpt-4o-mini"`

### Example 3: "Analyze the relationship between X and Y"
1. ✅ Detected as reasoning query (keywords: "analyze", "relationship")
2. ✅ Path C selected (reasoning keywords + book_id)
3. ✅ Check for relevant corrections (limit 3)
4. ✅ Generate query embedding using `text-embedding-3-small`
5. ✅ Hybrid search with 0.6 threshold (broader context)
6. ✅ Retrieve 15 chunks (more than Path A)
7. ✅ Enhance with parent context
8. ✅ Build context with persistent citations
9. ✅ Inject corrections context + deep reasoning prompt
10. ✅ Generate response with GPT-4o (temperature 0.5, investigator prompt with deep reasoning)
11. ✅ Return analysis with structured reasoning and `#chk_xxx` citations
12. **Model:** `gpt-4o`  
13. **Saved as:** `model_used: "deep_reasoner_gpt-4o"`

### Example 4: "Summarize all my books"
1. ✅ Detected as global query but multi-book (no book_id or multiple books)
2. ✅ Path A selected (summaries only work for single book)
3. ✅ Generate query embedding
4. ✅ Hybrid search across all books (0.5 threshold, 10 chunks)
5. ✅ Retrieve chunks from different books
6. ✅ Generate response from chunks (not pre-computed summary)
7. **Model:** `gpt-4o-mini`  
8. **Saved as:** `model_used: "investigator_gpt-4o-mini"`

---

## Security & Access Control

- **User isolation:** Each user only sees their own books (RLS policies)
- **RLS policies:** Row-Level Security enforces access control at database level
- **Admin client:** Backend uses service role key for operations, bypassing RLS
- **Usage limits:** Checked before processing (can be configured per user)
- **Book access:** Only books in `user_book_access` table with `is_visible = true`

---

## Future Improvements

1. ✅ **Hybrid search:** Implemented (vector + keyword via RRF)
2. **Re-ranking:** Use LLM to re-rank retrieved chunks for better relevance
3. **Cross-book synthesis:** Enable intelligent summarization across multiple books
4. ✅ **Persistent citations:** Implemented (`#chk_xxxx` format with chunk_map)
5. ✅ **Citation click handlers:** Implemented (hover tooltip + sliding panel)
6. **Streaming responses:** Stream tokens as they're generated for better UX
7. **Conversation memory:** Remember previous questions in the same session
8. **Query expansion:** Automatically expand queries with synonyms/related terms
9. **Citation page numbers:** Track and display page numbers in citations
10. **Multi-turn reasoning:** Chain multiple reasoning steps for complex queries
