# Refined Architecture Proposal - Automated RAG System

## 1. Tech Stack ✅

### Frontend
- **Next.js 14 (App Router)** - ✅ Excellent choice
- **TypeScript** - ✅ Essential for maintainability
- **Tailwind CSS** - ✅ Fast development
- **Shadcn UI** - ✅ Great component library
- **Zustand** - ✅ Lightweight, perfect for this use case

### Backend
- **Python FastAPI** - ✅ **Strong recommendation**
  - Better for AI/ML workloads
  - Excellent async support
  - Easy integration with Python ML libraries
  - **Deployment Options:**
    - Railway (recommended - easy FastAPI deployment)
    - Render (good free tier)
    - Fly.io (global edge deployment)
    - AWS Lambda (serverless, but cold starts)
    - Docker container on Vercel (if needed)

### Database & Vector Store
- **Supabase (PostgreSQL + pgvector)** - ✅ Perfect choice
  - Already in your stack
  - Integrated storage
  - Real-time capabilities

### AI Processing Stack
- **OCR & Parsing:**
  - **Primary**: DeepSeek-VL/V3 (if available) or DeepSeek OCR API
  - **Fallback**: PyMuPDF for native PDFs
  - **Note**: Verify DeepSeek-VL API availability and structured JSON output capability
  
- **Embeddings:**
  - **OpenAI text-embedding-3-large** - ✅ Excellent quality
  - **Alternative**: Consider `text-embedding-3-small` for cost savings (80% cheaper, ~95% quality)
  
- **Topic Labeling:**
  - **GPT-4o-mini** - ✅ Cost-effective choice
  - Batch process labels to reduce API calls
  
- **Correction Logic:**
  - **GPT-4o** - ✅ High quality
  - **Consideration**: Use conditionally (only for complex corrections)
  - **Alternative**: GPT-4o-mini for simple corrections, GPT-4o for complex ones

---

## 2. Core Architecture & Pipelines

### A. Hybrid Ingestion Pipeline ✅

**Traffic Light Classifier Logic:**
```python
def classify_pdf(pdf_path):
    # Use PyMuPDF to extract text
    text_density = calculate_text_density(pdf_path)
    
    if text_density > threshold and has_native_text:
        # Simple PDF - direct extraction
        return extract_with_pymupdf(pdf_path)
    else:
        # Complex PDF - DeepSeek Vision
        return process_with_deepseek_vision(pdf_path)
```

**Structured JSON Output Requirement:**
- **Critical**: Verify DeepSeek-VL/V3 can return structured JSON
- **Fallback Strategy**: If not available, use DeepSeek OCR + post-processing with GPT-4o-mini to structure
- **Structure Schema:**
```json
{
  "document": {
    "title": "string",
    "author": "string",
    "chapters": [
      {
        "chapter_title": "string",
        "sections": [
          {
            "section_title": "string",
            "paragraphs": ["string"]
          }
        ]
      }
    ]
  }
}
```

**Semantic Splitting Rules:**
- Never split by token count ✅
- Split on:
  - Double newlines (paragraph breaks)
  - Semantic pauses (detected via embeddings)
  - Section/chapter boundaries
  - Natural sentence boundaries (for very long paragraphs)

---

### B. Hybrid Chunking & Enrichment ✅

**Parent-Child Indexing Strategy:**

**Database Schema:**
```sql
-- documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  title TEXT,
  author TEXT,
  file_path TEXT,
  uploaded_at TIMESTAMP,
  status TEXT -- 'processing', 'ready', 'error'
);

-- chunks table (parent chunks)
CREATE TABLE parent_chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  chapter_title TEXT,
  section_title TEXT,
  full_text TEXT,
  topic_labels TEXT[], -- Array of 3-5 topic labels
  page_range TEXT,
  chunk_index INTEGER
);

-- child_chunks table (searchable chunks)
CREATE TABLE child_chunks (
  id UUID PRIMARY KEY,
  parent_id UUID REFERENCES parent_chunks(id),
  document_id UUID REFERENCES documents(id),
  text TEXT,
  embedding VECTOR(3072), -- text-embedding-3-large = 3072 dims
  paragraph_index INTEGER,
  page_number INTEGER
);

-- Create indexes
CREATE INDEX ON child_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON child_chunks(parent_id);
CREATE INDEX ON child_chunks(document_id);
```

**Topic Labeling Process:**
1. Extract parent chunk (chapter/section)
2. Send to GPT-4o-mini with prompt:
   ```
   Extract 3-5 concise topic labels (2-4 words each) for this text section.
   Return as JSON array: ["label1", "label2", "label3"]
   
   Text: {parent_chunk_text}
   ```
3. Store labels in `parent_chunks.topic_labels` array
4. Use labels for filtering/searching in UI

**Embedding Strategy:**
- Generate embeddings for **child chunks only** (cost optimization)
- Store `parent_id` with each child chunk
- During retrieval: Get child chunks, then fetch parent context if needed

---

### C. Active Learning Loop (The "Brain") 🧠

**Implementation Strategy:**

**Phase 1: Basic Correction Storage**
```sql
CREATE TABLE parsing_corrections (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  original_text TEXT,
  corrected_text TEXT,
  correction_type TEXT, -- 'merge', 'split', 'edit', 'typo_fix'
  context_before TEXT,
  context_after TEXT,
  correction_rule TEXT, -- Generated rule description
  embedding VECTOR(3072), -- Embedding of error context
  created_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0
);
```

**Phase 2: Rule Generation**
When user makes correction:
1. Calculate diff between original and corrected
2. Extract context (surrounding text)
3. Generate rule using GPT-4o-mini:
   ```
   User corrected this text. Generate a reusable rule for similar contexts.
   
   Original: {original}
   Corrected: {corrected}
   Context: {context}
   
   Rule format: "When [condition], apply [action]"
   ```
4. Store rule with embedded context

**Phase 3: Rule Injection**
Before processing new document:
1. Extract document characteristics (structure, language, domain)
2. Query `parsing_corrections` for similar contexts:
   ```sql
   SELECT correction_rule, correction_type
   FROM parsing_corrections
   WHERE embedding <-> (SELECT embedding FROM document_context) < 0.3
   ORDER BY usage_count DESC
   LIMIT 5;
   ```
3. Inject rules into DeepSeek system prompt:
   ```
   System: You are processing a PDF document. Apply these learned rules:
   - {rule1}
   - {rule2}
   ...
   
   Process this document following the structure: Document -> Chapter -> Section -> Paragraph
   ```

**Phase 4: Rule Validation**
- Track which rules are used and successful
- Increment `usage_count` for effective rules
- Archive rules that don't improve accuracy

**Considerations:**
- Start simple: Just store corrections, add rule generation later
- Limit rule injection to avoid prompt bloat (max 5-10 rules)
- A/B test: Compare accuracy with/without active learning

---

## 3. User Interface (Frontend)

### The Editor Dashboard ✅

**Split View Layout:**
```
┌─────────────────┬─────────────────┐
│   PDF Viewer    │  Text Editor    │
│   (PDF.js)      │  (Structured)   │
│                 │                 │
│  [PDF Content]  │  [Chapter 1]     │
│                 │  [Section 1.1]  │
│                 │  [Paragraph 1]  │
│                 │  [Paragraph 2]  │
│                 │  [Actions...]   │
└─────────────────┴─────────────────┘
```

**Interactive Chunking Tools:**
- **Merge with Previous**: Combine two paragraphs
- **Split Here**: Break paragraph at cursor
- **Edit Text**: Direct text editing
- **Add Section Break**: Create new section
- **Add Chapter Break**: Create new chapter

**Metadata Editor:**
- Editable fields:
  - Document Title
  - Author
  - Chapter Titles
  - Section Titles
  - Topic Labels (AI-generated, user-editable)

**Visual Feedback:**
- **Low Confidence Regions**: 
  - Highlight in yellow/orange
  - Show confidence score from DeepSeek
  - Tooltip: "OCR confidence: 85%"
  
- **Warning Flags**:
  - Broken sentences (detected via NLP)
  - Incomplete paragraphs (ending mid-sentence)
  - Formatting issues (mixed fonts, sizes)
  - Missing punctuation patterns

**Validation Logic:**
```typescript
function validateChunk(chunk: Chunk): ValidationResult {
  const issues = [];
  
  // Check for broken sentences
  if (!endsWithPunctuation(chunk.text)) {
    issues.push({ type: 'incomplete_sentence', severity: 'warning' });
  }
  
  // Check for low confidence
  if (chunk.confidence < 0.85) {
    issues.push({ type: 'low_confidence', severity: 'warning', score: chunk.confidence });
  }
  
  // Check for formatting issues
  if (hasMixedFormatting(chunk.text)) {
    issues.push({ type: 'formatting_issue', severity: 'info' });
  }
  
  return { valid: issues.length === 0, issues };
}
```

---

## 4. Additional Recommendations

### A. Processing Pipeline States
```typescript
type ProcessingState = 
  | 'uploaded'
  | 'classifying'      // Traffic light check
  | 'extracting'       // OCR/parsing
  | 'structuring'      // JSON structure creation
  | 'chunking'         // Parent-child creation
  | 'labeling'         // Topic label generation
  | 'embedding'        // Vector generation
  | 'indexing'         // Database storage
  | 'ready'
  | 'error';
```

### B. Error Handling
- **Retry Logic**: For API failures (DeepSeek, OpenAI)
- **Fallback**: If DeepSeek fails, try PyMuPDF
- **Partial Success**: Store what was processed, allow reprocessing
- **User Notifications**: Real-time updates via Supabase Realtime

### C. Performance Optimizations
- **Batch Processing**: Process multiple PDFs in queue
- **Async Processing**: Use background jobs (Celery, or Supabase Edge Functions)
- **Caching**: Cache embeddings for similar text chunks
- **Streaming**: Stream processing updates to frontend

### D. Cost Management
- **Embedding Caching**: Check if similar text already embedded
- **Batch Labeling**: Process multiple chunks in one API call
- **Smart Routing**: Use cheaper models when possible
- **Usage Tracking**: Monitor API costs per document

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up FastAPI backend
- [ ] Configure Supabase schema
- [ ] Implement PDF upload to Supabase Storage
- [ ] Basic PyMuPDF extraction

### Phase 2: OCR Integration (Week 2-3)
- [ ] Integrate DeepSeek OCR/Vision API
- [ ] Implement traffic light classifier
- [ ] Test structured JSON output
- [ ] Handle both simple and complex PDFs

### Phase 3: Chunking System (Week 3-4)
- [ ] Implement parent-child chunking
- [ ] Semantic splitting logic
- [ ] Topic labeling with GPT-4o-mini
- [ ] Store in Supabase with pgvector

### Phase 4: Frontend Editor (Week 4-5)
- [ ] PDF.js integration
- [ ] Split view layout
- [ ] Interactive chunking tools
- [ ] Metadata editor
- [ ] Visual feedback (confidence, warnings)

### Phase 5: Active Learning (Week 5-6)
- [ ] Correction storage system
- [ ] Rule generation logic
- [ ] Rule injection into prompts
- [ ] Rule validation and tracking

### Phase 6: Query & RAG (Week 6-7)
- [ ] Vector search implementation
- [ ] RAG pipeline (retrieve + generate)
- [ ] Source attribution
- [ ] Query interface

### Phase 7: Polish & Optimization (Week 7-8)
- [ ] Error handling
- [ ] Performance optimization
- [ ] Cost monitoring
- [ ] User testing and feedback

---

## 6. Open Questions & Decisions Needed

1. **DeepSeek-VL/V3 API**: 
   - ✅ Verify API availability and pricing
   - ✅ Confirm structured JSON output capability
   - ✅ Test with sample PDFs

2. **FastAPI Deployment**:
   - Choose: Railway, Render, or Fly.io?
   - Consider: Docker containerization for portability

3. **Active Learning Complexity**:
   - Start with simple correction storage?
   - Or implement full rule generation from day 1?

4. **Cost Budget**:
   - Set monthly limits?
   - Implement usage alerts?

5. **User Authentication**:
   - Supabase Auth?
   - Or separate auth system?

---

## 7. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| DeepSeek API unavailable | Fallback to PyMuPDF + GPT structuring |
| High API costs | Implement caching, batch processing |
| Active learning complexity | Start simple, iterate |
| FastAPI deployment issues | Use managed services (Railway/Render) |
| Poor chunking quality | Allow manual correction, learn from it |

---

## Summary

Your architecture is **excellent** and production-ready. The main considerations are:

1. ✅ **Verify DeepSeek-VL/V3 API** availability and structured output
2. ✅ **Choose FastAPI deployment** platform (Railway recommended)
3. ✅ **Start with simpler active learning**, iterate to full system
4. ✅ **Implement cost monitoring** from the start

The parent-child chunking and active learning loop are **innovative** and will set your system apart. The UI with editor is **user-friendly** and enables the feedback loop.

**Ready to proceed?** We can start with Phase 1 implementation.
