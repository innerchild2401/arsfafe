# Chat/RAG System Summary: How Zorxido Works

## Overview

Zorxido is an AI assistant that answers questions about books uploaded by users. It uses a **Two-Path Brain Strategy** to intelligently route queries either to pre-computed summaries (for general questions) or vector search (for specific questions).

---

## Architecture: Two-Path Brain Strategy

### Path B (Global Query) - Fast & Efficient
**Triggers when:** User asks for summaries, overviews, or "what is this book about"  
**Method:** Pre-computed summaries or Table of Contents inference  
**Speed:** Instant (no vector search needed)  
**Cost:** Low (single LLM call)

### Path A (Specific Query) - Detailed Search
**Triggers when:** User asks specific questions about content  
**Method:** Semantic vector search across book chunks  
**Speed:** Moderate (requires embedding + vector search)  
**Cost:** Higher (embedding + vector search + LLM call)

---

## What It Searches For

### 1. Vector Embeddings (Path A - Specific Queries)
- **Model:** `text-embedding-3-small` (OpenAI)
- **Dimensions:** 1536
- **Index:** HNSW (Hierarchical Navigable Small World) for fast similarity search
- **Storage:** Stored in `child_chunks.embedding` column
- **Search Function:** `match_child_chunks()` (PostgreSQL function using pgvector)
- **What gets embedded:**
  - Each paragraph becomes a `child_chunk` with its own embedding
  - Embeddings are generated during book processing

### 2. Pre-Computed Summaries (Path B - Global Queries)
- **Book-level:** `books.global_summary` - Executive summary of entire book
- **Section-level:** `parent_chunks.concise_summary` - 3-4 sentence summaries per section
- **Generation:** Summaries are created during book processing (not at chat time)

### 3. Table of Contents (Fallback for Path B)
- **Structure:** Chapter titles, section titles, topic labels
- **Used when:** `global_summary` doesn't exist (for older books)
- **Method:** LLM infers summary from ToC structure and topics

---

## How Responses Are Handled

### Step 1: Intent Detection

**Name Questions (Direct Response)**
- Keywords: `["what is your name", "who are you", "what's your name", ...]`
- **Action:** Returns hardcoded response immediately (no search)
- **Response:** "Hello! I'm Zorxido, your AI assistant..."

**Global Query Detection**
- Keywords: `["summarize", "summarise", "summary", "overview", "what is this book about", ...]`
- **Action:** Routes to Path B (if single book) or Path A (if multi-book)

**Specific Query (Default)**
- **Action:** Routes to Path A (vector search)

### Step 2: Path Selection

#### Path B: Pre-Computed Summary
1. Check if `books.global_summary` exists
2. **If YES:** Use pre-computed summary directly
   - System prompt instructs LLM to format summary nicely
   - Temperature: 0.4 (more deterministic)
   - Model: `gpt-4o-mini`
3. **If NO:** Use Table of Contents Hack
   - Fetch all chapter titles, section titles, topic labels
   - Build ToC structure (max 30 chapters, 50 topics)
   - Prompt LLM to infer summary from structure
   - Temperature: 0.4
   - Model: `gpt-4o-mini`

#### Path A: Vector Search
1. Generate query embedding using `text-embedding-3-small`
2. Search using `match_child_chunks()` function
3. **Thresholds:**
   - Specific queries: 0.7 similarity (strict)
   - General queries: 0.5 similarity (looser)
   - Fallback: 0.3 similarity (very loose)
4. **Chunk counts:**
   - Specific queries: 5 chunks
   - General queries: 10 chunks
5. **Fallback Layers:**
   - Try 0.7 threshold → try 0.5 threshold → try 0.3 threshold
   - If vector search fails → get any chunks with embeddings
   - If still nothing → get any chunks (even without embeddings)
   - If still nothing → return error message

### Step 3: Context Building (Path A Only)

- Format chunks with citation references: `[Ref: 1]`, `[Ref: 2]`, etc.
- Build source strings: `"Book Title, Chapter Title, Section Title"`
- Deduplicate sources
- Combine into context string

### Step 4: LLM Response Generation

**System Prompt (Path A - Vector Search):**
```
You are Zorxido, a helpful AI assistant that answers questions based on the provided context from books. 
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are designed to help users understand and explore their uploaded books.
- Always cite your sources using [Ref: N] format where N is the reference number from the context.
- Use the context provided to answer questions. If the user asks to "summarise" or "summarize" a book, provide a comprehensive summary based on all the context provided.
- If the context doesn't contain enough information to fully answer a question, answer based on what is available and mention that your answer is based on the provided context.
- Stay focused on the content from the user's books. If asked about topics not in the books, politely redirect to what you can help with based on their uploaded content.
- For general questions like "summarise this book", use all the provided context to create a comprehensive summary.
```

**System Prompt (Path B - Pre-computed Summary):**
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

**Model Configuration:**
- **Model:** `gpt-4o-mini` (all paths)
- **Temperature:** 
  - Path A (vector search): 0.7 (more creative)
  - Path B (summaries): 0.4 (more deterministic)
- **User message format:** 
  - Path A: `"Context from books:\n\n{context}\n\nQuestion: {user_message}"`
  - Path B: User message directly (summary is in system prompt)

### Step 5: Response Storage

Every interaction is saved to `chat_messages` table with:
- User message
- Assistant response
- Retrieved chunk IDs (if Path A)
- Sources array
- Tokens used
- Model used (`global_summary_path`, `toc_hack_path`, `gpt-4o-mini`, etc.)

---

## Thresholds & Configuration

### Similarity Thresholds
- **0.7** - Strict (specific queries): Only very relevant chunks
- **0.5** - Moderate (general queries): More lenient matching
- **0.3** - Loose (fallback): Get any somewhat related chunks

### Chunk Limits
- **5 chunks** - Specific queries (focused context)
- **10 chunks** - General queries (broader context)

### Model Settings
- **Embedding Model:** `text-embedding-3-small` (1536 dimensions)
- **Chat Model:** `gpt-4o-mini`
- **Structure Model:** `gpt-4o-mini` (for book processing)
- **Labeling Model:** `gpt-4o-mini` (for topic generation)

### Vector Search Configuration
- **Index Type:** HNSW (Hierarchical Navigable Small World)
- **Distance Metric:** Cosine similarity (`<=>` operator)
- **Index Parameters:** `m = 16, ef_construction = 64`
- **Similarity Calculation:** `1 - (embedding <=> query_embedding)`

---

## Capabilities

### ✅ What It Can Do

1. **Answer specific questions** about book content using semantic search
2. **Summarize entire books** using pre-computed summaries (fast, cheap)
3. **Infer summaries** from Table of Contents (for existing books)
4. **Multi-book queries** (when `book_id` is null, searches across all user's books)
5. **Source citations** with `[Ref: N]` format
6. **Context-aware responses** based on retrieved chunks
7. **Graceful fallbacks** if vector search fails
8. **Usage tracking** (tokens, messages per month)

### ⚠️ Limitations

1. **Single book only for Path B** - Summaries only work for one book at a time
2. **No real-time summary generation** - Must be pre-computed during processing
3. **ToC hack is inferential** - Less accurate than pre-computed summaries
4. **Embedding dependency** - Path A requires chunks to have embeddings
5. **No cross-book synthesis** - Can search multiple books but won't synthesize across them intelligently
6. **Max context limits** - Limited by LLM token limits (currently ~10 chunks for general queries)

---

## Processing Pipeline (Summary Generation)

### During Book Upload:
1. **Extract structure** (chapters, sections, paragraphs) using GPT-4o-mini
2. **Generate section summaries** (3-4 sentences each) → stored in `parent_chunks.concise_summary`
3. **Aggregate chapter summaries** from section summaries
4. **Generate book-level executive summary** from chapter summaries → stored in `books.global_summary`

### Summary Generation Settings:
- **Section Summary:** Temperature 0.3, max 5K chars input
- **Book Summary:** Temperature 0.4, max 10K chars (combined chapter summaries)
- **Model:** GPT-4o-mini for both

---

## Example Query Flows

### Example 1: "Can you summarize this book?"
1. ✅ Detected as global query
2. ✅ Path B selected (single book)
3. ✅ Check `global_summary` exists
4. ✅ Use pre-computed summary
5. ✅ Format with LLM (temperature 0.4)
6. ✅ Return structured summary

### Example 2: "What is the bond maturity date mentioned in Chapter 3?"
1. ✅ Detected as specific query
2. ✅ Path A selected
3. ✅ Generate query embedding
4. ✅ Vector search with 0.7 threshold
5. ✅ Retrieve top 5 relevant chunks
6. ✅ Build context with citations
7. ✅ Generate response with LLM (temperature 0.7)
8. ✅ Return answer with `[Ref: 1]` citations

### Example 3: "Summarize all my books"
1. ✅ Detected as global query but multi-book
2. ✅ Path A selected (summaries only work for single book)
3. ✅ Generate query embedding
4. ✅ Vector search across all books (0.5 threshold)
5. ✅ Retrieve 10 chunks from different books
6. ✅ Generate response from chunks

---

## Security & Access Control

- **User isolation:** Each user only sees their own books
- **RLS policies:** Row-Level Security enforces access control at database level
- **Admin client:** Backend uses service role key for operations, bypassing RLS
- **Usage limits:** Checked before processing (can be configured per user)

---

## Performance Characteristics

### Path B (Summaries)
- **Latency:** ~1-2 seconds (single LLM call)
- **Cost:** ~$0.001-0.01 per query (depending on summary length)
- **Scalability:** Excellent (no vector search overhead)

### Path A (Vector Search)
- **Latency:** ~2-4 seconds (embedding + vector search + LLM call)
- **Cost:** ~$0.01-0.05 per query (embedding + LLM with context)
- **Scalability:** Good (HNSW index is fast, but cost scales with query volume)

---

## Future Improvements

1. **Hybrid search:** Combine vector search with keyword search
2. **Re-ranking:** Use LLM to re-rank retrieved chunks for better relevance
3. **Cross-book synthesis:** Enable intelligent summarization across multiple books
4. **Citation page numbers:** Track and display page numbers in citations
5. **Streaming responses:** Stream tokens as they're generated for better UX
6. **Conversation memory:** Remember previous questions in the same session
7. **Query expansion:** Automatically expand queries with synonyms/related terms
