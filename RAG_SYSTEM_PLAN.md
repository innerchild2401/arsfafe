# Automated RAG System Plan for PDF Books

## Project Overview
Build an automated RAG (Retrieval-Augmented Generation) system that allows users to upload PDF books, processes them with topic-based chunking (not token-based), labels chunks, and displays them to users.

---

## 1. PDF Text Extraction (OCR)

### Primary Option: **DeepSeek OCR**
**Why it's ideal:**
- **High Accuracy**: 99%+ on printed text, 92%+ on handwritten
- **Complex Layout Preservation**: Maintains tables, forms, columns, and document structure
- **Multilingual Support**: 50+ languages
- **Developer-Friendly**: RESTful APIs and SDKs for easy integration
- **Cost Efficiency**: Can reduce token usage by up to 20x by converting to high-res images
- **Open Source**: Available as open-source solution
- **Website**: [deepseekocr.dev](https://deepseekocr.dev)

**Integration**: Can be integrated via API calls from Next.js backend

### Alternative OCR Options:
1. **Tesseract OCR** - Open-source, widely used, but less accurate for complex layouts
2. **Amazon Textract** - Cloud-based, good for AWS ecosystem
3. **Google Cloud Vision OCR** - Powerful, good multilingual support
4. **Azure Computer Vision OCR** - Microsoft ecosystem integration
5. **PyMuPDF (fitz)** - Python library, good for text extraction from native PDFs (not scanned)
6. **pdfplumber** - Python library, excellent for structured data extraction

**Recommendation**: Use **DeepSeek OCR** for scanned/image-based PDFs, and **PyMuPDF/pdfplumber** as fallback for native text PDFs (faster and cheaper).

---

## 2. Topic-Based Chunking Strategy

### Challenge
Traditional chunking splits by tokens/characters, which can break semantic meaning. We need **semantic/topic-based chunking**.

### Available Approaches:

#### Option A: **Semantic Chunking with Embeddings**
- Use embedding models to identify semantic boundaries
- Split when semantic similarity drops significantly
- **Tools**: LangChain's `SemanticChunker`, custom implementation with sentence transformers

#### Option B: **Document Structure-Based Chunking**
- Leverage PDF structure (headings, paragraphs, sections)
- Use heading hierarchy to identify topics
- **Tools**: PyMuPDF for structure extraction, custom logic

#### Option C: **Hybrid Approach (Recommended)**
1. **Structure Detection**: Extract headings, sections, chapters from PDF
2. **Semantic Boundary Detection**: Use embeddings to find natural topic breaks
3. **Intelligent Merging**: Combine small sections that belong to same topic
4. **Overlap Strategy**: Add small overlaps at boundaries to maintain context

### Implementation Libraries:
- **LangChain**: Has `SemanticChunker` and `RecursiveCharacterTextSplitter` with custom separators
- **LlamaIndex**: Offers `SemanticSplitterNodeParser` for topic-based splitting
- **Custom Solution**: Use sentence transformers + cosine similarity to detect topic shifts

### Chunking Metadata to Store:
- Topic label (auto-generated)
- Chapter/section title
- Page numbers
- Book title
- Author
- Timestamp
- Chunk index

---

## 3. Embedding Models

### Options:

#### Option A: **OpenAI Embeddings** (`text-embedding-3-small` or `text-embedding-3-large`)
- **Pros**: High quality, easy integration, good for general text
- **Cons**: API costs, rate limits, data sent to OpenAI
- **Cost**: ~$0.02 per 1M tokens (small), ~$0.13 per 1M tokens (large)

#### Option B: **Cohere Embeddings** (`embed-english-v3.0`)
- **Pros**: Good quality, competitive pricing, multilingual support
- **Cons**: API dependency
- **Cost**: Varies by tier

#### Option C: **Sentence Transformers** (Open Source)
- **Models**: 
  - `all-MiniLM-L6-v2` (fast, 384 dims)
  - `all-mpnet-base-v2` (better quality, 768 dims)
  - `multi-qa-mpnet-base-dot-v1` (optimized for Q&A)
- **Pros**: Free, runs locally, no API costs, privacy-friendly
- **Cons**: Requires compute resources, slightly lower quality than OpenAI
- **Best for**: Cost-sensitive, privacy-focused deployments

#### Option D: **Supabase Vector Embeddings** (pgvector)
- If using Supabase, can leverage their embedding functions
- Integrates well with Supabase storage

**Recommendation**: Start with **Sentence Transformers** (`all-mpnet-base-v2`) for cost efficiency and privacy. Upgrade to OpenAI if quality needs improvement.

---

## 4. Vector Database Options

### Option A: **Supabase (pgvector)** ⭐ **RECOMMENDED**
**Why it fits your stack:**
- You already have Supabase configured (from env.local)
- Built-in pgvector extension for vector similarity search
- Integrated with Supabase Storage for PDF files
- Real-time capabilities
- Generous free tier
- Easy to deploy with Next.js
- **Features**: 
  - Cosine similarity, L2 distance, inner product
  - HNSW indexing for fast searches
  - Metadata filtering
  - Row-level security

### Option B: **Pinecone**
- **Pros**: Managed service, excellent performance, easy scaling
- **Cons**: Costs money, separate service to manage
- **Best for**: High-scale production apps

### Option C: **Weaviate**
- **Pros**: Open-source, self-hostable, good features
- **Cons**: Requires infrastructure management
- **Best for**: Self-hosted solutions

### Option D: **Chroma**
- **Pros**: Lightweight, easy to use, good for prototyping
- **Cons**: Less scalable, primarily for smaller projects
- **Best for**: Development/testing

### Option E: **Qdrant**
- **Pros**: Open-source, performant, good filtering
- **Cons**: Requires self-hosting or paid cloud
- **Best for**: Self-hosted production

**Recommendation**: Use **Supabase with pgvector** since you're already using Supabase. It's the most integrated solution.

---

## 5. RAG Framework Options

### Option A: **LangChain**
- **Pros**: 
  - Most popular, extensive documentation
  - Built-in chunking strategies
  - Many integrations
  - Good for complex workflows
- **Cons**: Can be heavy, learning curve
- **Best for**: Complex RAG pipelines

### Option B: **LlamaIndex**
- **Pros**: 
  - Optimized for RAG
  - Good document management
  - Built-in query engines
  - Better for document-centric apps
- **Cons**: Less flexible than LangChain
- **Best for**: Document Q&A systems

### Option C: **Haystack** (by deepset)
- **Pros**: 
  - Production-ready
  - Good monitoring tools
  - Pipeline-based architecture
- **Cons**: Less popular, smaller community
- **Best for**: Enterprise deployments

### Option D: **Custom Implementation**
- **Pros**: Full control, lightweight, no dependencies
- **Cons**: More development time
- **Best for**: Simple, specific use cases

**Recommendation**: Start with **LangChain** for flexibility, or **LlamaIndex** if you want document-focused features out of the box.

---

## 6. LLM for Generation

### Options:
1. **OpenAI GPT-4/GPT-3.5-turbo** - You already have API key
2. **Anthropic Claude** - Excellent for long context
3. **DeepSeek Chat** - Cost-effective alternative
4. **Open Source Models** (via Ollama, HuggingFace) - Free but requires infrastructure

**Recommendation**: Use **OpenAI GPT-4** or **GPT-3.5-turbo** since you have the API key configured.

---

## 7. Architecture Recommendation

### Tech Stack:
```
Frontend: Next.js 14 (App Router) + TypeScript
Backend: Next.js API Routes
Storage: Supabase Storage (for PDFs)
Vector DB: Supabase (pgvector)
OCR: DeepSeek OCR API
Embeddings: Sentence Transformers (local) or OpenAI
LLM: OpenAI GPT-4/3.5
Framework: LangChain or LlamaIndex
```

### Data Flow:
1. **Upload**: User uploads PDF → Supabase Storage
2. **Extract**: Backend calls DeepSeek OCR → Get text + structure
3. **Chunk**: Topic-based chunking using semantic similarity + structure
4. **Embed**: Generate embeddings for each chunk
5. **Store**: Save chunks + embeddings + metadata to Supabase (pgvector)
6. **Label**: Auto-generate topic labels using LLM or keyword extraction
7. **Display**: Show labeled chunks to user in UI
8. **Query**: User queries → Embed query → Vector search → Retrieve chunks → Generate answer

---

## 8. Topic Labeling Strategy

### Options:

#### Option A: **LLM-Based Labeling**
- Use GPT to generate topic labels for each chunk
- **Prompt**: "Extract a 3-5 word topic label for this text: [chunk]"
- **Pros**: High quality, contextual
- **Cons**: API costs, slower

#### Option B: **Keyword Extraction**
- Use NLP libraries (spaCy, NLTK) to extract key phrases
- **Pros**: Fast, free
- **Cons**: Less contextual

#### Option C: **Hybrid**
- Extract keywords, then use LLM to refine into readable labels
- **Pros**: Balance of speed and quality
- **Cons**: Two-step process

**Recommendation**: Use **LLM-based labeling** for better user experience, with caching to reduce costs.

---

## 9. User Interface Components

### Required Features:
1. **PDF Upload**: Drag-and-drop or file picker
2. **Processing Status**: Show progress (uploading → extracting → chunking → embedding → ready)
3. **Chunk Browser**: 
   - List of all chunks with labels
   - Search/filter by topic
   - Preview chunk content
   - View metadata (page, chapter, etc.)
4. **Query Interface**: 
   - Search bar
   - Chat-like interface for Q&A
   - Show source chunks used in answer
5. **Book Management**: 
   - List of uploaded books
   - Delete books
   - View book details

---

## 10. Implementation Phases

### Phase 1: Foundation
- [ ] Set up Supabase tables (books, chunks, embeddings)
- [ ] Implement PDF upload to Supabase Storage
- [ ] Basic PDF text extraction (PyMuPDF for native PDFs)

### Phase 2: OCR Integration
- [ ] Integrate DeepSeek OCR API
- [ ] Handle both native and scanned PDFs
- [ ] Extract document structure (headings, sections)

### Phase 3: Chunking
- [ ] Implement topic-based chunking
- [ ] Use semantic similarity for boundary detection
- [ ] Add overlap strategy
- [ ] Extract and store metadata

### Phase 4: Embeddings & Storage
- [ ] Set up pgvector in Supabase
- [ ] Generate embeddings (Sentence Transformers or OpenAI)
- [ ] Store chunks with embeddings
- [ ] Implement vector search

### Phase 5: Labeling
- [ ] Implement topic labeling (LLM-based)
- [ ] Cache labels to reduce API calls
- [ ] Display labels in UI

### Phase 6: Query & Generation
- [ ] Build query interface
- [ ] Implement RAG pipeline (retrieve → generate)
- [ ] Show source attribution
- [ ] Add reranking if needed

### Phase 7: UI/UX
- [ ] Build chunk browser
- [ ] Add search/filter functionality
- [ ] Improve processing status indicators
- [ ] Add book management

### Phase 8: Optimization
- [ ] Add caching layer
- [ ] Optimize embedding generation
- [ ] Implement batch processing
- [ ] Add monitoring and analytics

---

## 11. Cost Considerations

### Estimated Monthly Costs (for moderate usage):
- **DeepSeek OCR**: Check pricing (likely pay-per-use)
- **OpenAI Embeddings**: ~$10-50/month (depending on volume)
- **OpenAI GPT-4**: ~$20-100/month (depending on queries)
- **Supabase**: Free tier should cover initial usage
- **Vercel**: Free tier for hosting

**Total**: ~$30-150/month for moderate usage

**Cost Optimization**:
- Use Sentence Transformers instead of OpenAI embeddings (saves ~$50/month)
- Cache embeddings and labels
- Batch process PDFs
- Use GPT-3.5-turbo instead of GPT-4 for most queries

---

## 12. Best Practices Summary

1. **Chunking**: Use semantic/topic-based, not token-based
2. **Overlap**: Add 10-20% overlap between chunks
3. **Metadata**: Store rich metadata (page, chapter, topic, timestamp)
4. **Hybrid Search**: Combine vector search with keyword search for better results
5. **Reranking**: Use reranking models to improve top-k results
6. **Monitoring**: Track retrieval accuracy, response quality, user feedback
7. **Caching**: Cache embeddings, labels, and frequent queries
8. **Error Handling**: Graceful degradation if OCR/API fails
9. **Security**: Validate PDFs, sanitize inputs, rate limit uploads
10. **Scalability**: Design for async processing, queue system for large PDFs

---

## 13. Recommended Final Stack

Based on your requirements and existing setup:

| Component | Technology | Reason |
|-----------|-----------|--------|
| **OCR** | DeepSeek OCR + PyMuPDF | Best accuracy + fallback |
| **Chunking** | Custom semantic chunking (LangChain) | Topic-based as required |
| **Embeddings** | Sentence Transformers (all-mpnet-base-v2) | Cost-effective, privacy-friendly |
| **Vector DB** | Supabase (pgvector) | Already in stack, integrated |
| **RAG Framework** | LangChain | Flexible, well-documented |
| **LLM** | OpenAI GPT-4/3.5 | Already configured |
| **Labeling** | OpenAI GPT-3.5-turbo | Quality labels, cost-effective |
| **Storage** | Supabase Storage | Integrated solution |
| **Hosting** | Vercel | Already set up |

---

## Next Steps

1. Review and approve this plan
2. Set up Supabase schema (tables for books, chunks, embeddings)
3. Start with Phase 1 implementation
4. Iterate based on testing and feedback

---

## References

- [DeepSeek OCR](https://deepseekocr.dev)
- [LangChain Documentation](https://python.langchain.com)
- [LlamaIndex Documentation](https://docs.llamaindex.ai)
- [Supabase Vector (pgvector) Guide](https://supabase.com/docs/guides/ai/vector-columns)
- [RAG Best Practices](https://medium.com/@vrajdcs/best-practices-for-retrieval-augmented-generation-rag-implementation-ccecb269fb42)
