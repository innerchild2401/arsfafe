# User System & Architecture Design

## Overview

Tiered user system with admin controls, usage limits, book deduplication, and knowledge center chat interface.

---

## User Roles & Permissions

### 1. **Admin** (You)
- ✅ Accept/reject user signups
- ✅ Set usage limits per user
- ✅ Unlimited access
- ✅ View all users and their activity
- ✅ Manage system settings

### 2. **Regular Users**
- ✅ Sign up via Supabase Auth
- ⏳ **Pending** status until admin approves
- ✅ Once approved: Can upload books and chat
- ✅ Only see their own books
- ⚠️ Subject to usage limits (if set)

---

## Database Schema

### Users Table (Extends Supabase Auth)
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  
  -- Usage Limits
  has_limits BOOLEAN DEFAULT true,
  max_books INTEGER,  -- NULL = unlimited
  max_pages_per_month INTEGER,  -- NULL = unlimited
  max_chat_messages_per_month INTEGER,  -- NULL = unlimited
  
  -- Usage Tracking
  current_books_count INTEGER DEFAULT 0,
  pages_processed_this_month INTEGER DEFAULT 0,
  chat_messages_this_month INTEGER DEFAULT 0,
  month_reset_date TIMESTAMP DEFAULT NOW(),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by UUID REFERENCES user_profiles(id)
);

-- Indexes
CREATE INDEX idx_user_profiles_status ON user_profiles(status);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
```

### Books Table
```sql
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- File Info
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'epub')),
  file_size BIGINT NOT NULL,
  file_hash TEXT NOT NULL,  -- For deduplication (SHA-256)
  file_path TEXT NOT NULL,  -- Supabase Storage path
  
  -- Metadata
  title TEXT,
  author TEXT,
  extracted_text TEXT,  -- Full text (for deduplication check)
  text_hash TEXT,  -- Hash of extracted text (for content deduplication)
  
  -- Processing Status
  status TEXT DEFAULT 'uploaded' CHECK (status IN (
    'uploaded', 
    'processing', 
    'ready', 
    'error'
  )),
  processing_error TEXT,
  
  -- Processing Metadata
  total_pages INTEGER,
  total_chunks INTEGER,
  processed_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Deduplication
  UNIQUE(file_hash)  -- Prevent duplicate file uploads
);

-- Indexes
CREATE INDEX idx_books_file_hash ON books(file_hash);
CREATE INDEX idx_books_text_hash ON books(text_hash);
CREATE INDEX idx_books_status ON books(status);
```

### User-Book Access (Many-to-Many)
```sql
CREATE TABLE user_book_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  
  -- Access Info
  is_owner BOOLEAN DEFAULT false,  -- True for original uploader
  access_granted_at TIMESTAMP DEFAULT NOW(),
  granted_by UUID REFERENCES user_profiles(id),  -- NULL if owner
  
  -- Soft Delete (user-specific)
  is_visible BOOLEAN DEFAULT true,  -- False = user deleted it
  deleted_at TIMESTAMP,
  
  UNIQUE(user_id, book_id)
);

-- Indexes
CREATE INDEX idx_user_book_access_user ON user_book_access(user_id);
CREATE INDEX idx_user_book_access_book ON user_book_access(book_id);
CREATE INDEX idx_user_book_access_visible ON user_book_access(user_id, is_visible);
```

### Chunks Table (Parent-Child Structure)
```sql
CREATE TABLE parent_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  
  -- Structure
  chapter_title TEXT,
  section_title TEXT,
  full_text TEXT NOT NULL,
  topic_labels TEXT[],  -- Array of topic labels
  
  -- Metadata
  page_range TEXT,
  chunk_index INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE child_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES parent_chunks(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  
  -- Content
  text TEXT NOT NULL,
  embedding VECTOR(3072),  -- text-embedding-3-large = 3072 dims
  
  -- Metadata
  paragraph_index INTEGER,
  page_number INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_child_chunks_book ON child_chunks(book_id);
CREATE INDEX idx_child_chunks_parent ON child_chunks(parent_id);
CREATE INDEX idx_child_chunks_embedding ON child_chunks USING ivfflat (embedding vector_cosine_ops);
```

### Chat Messages Table
```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  book_id UUID REFERENCES books(id) ON DELETE SET NULL,  -- NULL for general chat
  
  -- Message Content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- RAG Context
  retrieved_chunks UUID[],  -- Array of child_chunk IDs used
  sources TEXT[],  -- Array of source citations
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  tokens_used INTEGER,  -- For usage tracking
  model_used TEXT  -- e.g., 'gpt-4o-mini'
);

-- Indexes
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_book ON chat_messages(book_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
```

### Parsing Corrections (Active Learning)
```sql
CREATE TABLE parsing_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  book_id UUID REFERENCES books(id),
  
  -- Correction Data
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  correction_type TEXT,  -- 'merge', 'split', 'edit', 'typo_fix'
  context_before TEXT,
  context_after TEXT,
  correction_rule TEXT,  -- Generated rule
  
  -- Embedding for similarity search
  embedding VECTOR(3072),
  
  -- Usage Tracking
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_parsing_corrections_embedding ON parsing_corrections USING ivfflat (embedding vector_cosine_ops);
```

---

## User Flow

### 1. **User Signup**
```
User signs up via Supabase Auth
    ↓
User profile created with status='pending'
    ↓
User redirected to dashboard (read-only)
    ↓
Admin receives notification (optional)
```

### 2. **Admin Approval**
```
Admin views pending users
    ↓
Admin approves user
    ↓
User status → 'approved'
    ↓
User can now upload and chat
```

### 3. **Book Upload**
```
User uploads book
    ↓
Check: Is user approved? → If no, reject
    ↓
Check: Usage limits? → If exceeded, reject
    ↓
Calculate file_hash (SHA-256)
    ↓
Check: Does book exist? (by file_hash)
    ├─ YES → Grant access to existing book
    └─ NO → Process new book
        ↓
    Upload to Supabase Storage
    ↓
    Create book record
    ↓
    Create user_book_access (is_owner=true)
    ↓
    Process book (OCR, chunking, embedding)
    ↓
    Update book status → 'ready'
```

### 4. **Book Deduplication**
```
User uploads book
    ↓
Calculate file_hash
    ↓
Query: SELECT * FROM books WHERE file_hash = ?
    ↓
If exists:
    ├─ Check: Does user already have access?
    │   ├─ YES → Show existing book
    │   └─ NO → Grant access
    │       ↓
    │   Create user_book_access (is_owner=false)
    │   ↓
    │   Return existing book (no processing needed!)
    ↓
If not exists:
    └─ Process as new book
```

### 5. **Soft Delete**
```
User deletes book
    ↓
Update user_book_access:
    is_visible = false
    deleted_at = NOW()
    ↓
Book remains in database
    ↓
Other users still have access
    ↓
User can "restore" later (set is_visible = true)
```

---

## API Endpoints

### Admin Endpoints
```python
# Admin: List pending users
GET /api/admin/users/pending

# Admin: Approve user
POST /api/admin/users/{user_id}/approve
Body: {
  "has_limits": true,
  "max_books": 10,
  "max_pages_per_month": 1000,
  "max_chat_messages_per_month": 500
}

# Admin: Set user limits
PUT /api/admin/users/{user_id}/limits
Body: {
  "has_limits": false,  # or true
  "max_books": null,  # null = unlimited
  "max_pages_per_month": 1000,
  "max_chat_messages_per_month": 500
}

# Admin: View all users
GET /api/admin/users

# Admin: View user activity
GET /api/admin/users/{user_id}/activity
```

### User Endpoints
```python
# User: Get own profile
GET /api/user/profile

# User: Upload book
POST /api/user/books/upload
Body: FormData (file, title, author)

# User: List own books
GET /api/user/books
Query: ?include_deleted=false

# User: Delete book (soft delete)
DELETE /api/user/books/{book_id}

# User: Restore book
POST /api/user/books/{book_id}/restore

# User: Chat with book
POST /api/user/chat
Body: {
  "book_id": "uuid",  # or null for general chat
  "message": "What does the book say about X?"
}

# User: Get chat history
GET /api/user/chat
Query: ?book_id=uuid
```

---

## Usage Limit Enforcement

### Middleware/Decorator
```python
from functools import wraps
from fastapi import HTTPException

def check_usage_limits(limit_type: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user = get_current_user()
            
            # Admin bypass
            if user.role == 'admin':
                return await func(*args, **kwargs)
            
            # Check if user has limits
            if not user.has_limits:
                return await func(*args, **kwargs)
            
            # Check specific limit
            if limit_type == 'books':
                if user.max_books and user.current_books_count >= user.max_books:
                    raise HTTPException(403, "Book limit exceeded")
            
            elif limit_type == 'pages':
                if user.max_pages_per_month and user.pages_processed_this_month >= user.max_pages_per_month:
                    raise HTTPException(403, "Monthly page limit exceeded")
            
            elif limit_type == 'chat':
                if user.max_chat_messages_per_month and user.chat_messages_this_month >= user.max_chat_messages_per_month:
                    raise HTTPException(403, "Monthly chat limit exceeded")
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# Usage
@check_usage_limits('books')
async def upload_book(file: UploadFile):
    ...
```

### Monthly Reset
```python
# Cron job or scheduled task
async def reset_monthly_usage():
    """
    Reset monthly usage counters
    """
    await db.execute("""
        UPDATE user_profiles
        SET 
            pages_processed_this_month = 0,
            chat_messages_this_month = 0,
            month_reset_date = NOW()
        WHERE month_reset_date < NOW() - INTERVAL '1 month'
    """)
```

---

## Book Deduplication Logic

```python
import hashlib
from pathlib import Path

async def upload_book(file: UploadFile, user_id: UUID):
    """
    Upload book with deduplication
    """
    # Read file
    file_content = await file.read()
    
    # Calculate hash
    file_hash = hashlib.sha256(file_content).hexdigest()
    
    # Check if book exists
    existing_book = await db.fetch_one("""
        SELECT id FROM books WHERE file_hash = $1
    """, file_hash)
    
    if existing_book:
        # Book exists - check if user has access
        access = await db.fetch_one("""
            SELECT id FROM user_book_access 
            WHERE user_id = $1 AND book_id = $2
        """, user_id, existing_book['id'])
        
        if access:
            # User already has access
            return {"book_id": existing_book['id'], "status": "existing"}
        else:
            # Grant access to existing book
            await db.execute("""
                INSERT INTO user_book_access (user_id, book_id, is_owner, is_visible)
                VALUES ($1, $2, false, true)
            """, user_id, existing_book['id'])
            
            return {"book_id": existing_book['id'], "status": "access_granted"}
    
    # New book - process it
    # ... upload to storage, process, etc.
    book_id = await process_new_book(file_content, file_hash, user_id)
    
    return {"book_id": book_id, "status": "new"}
```

---

## Knowledge Center Chat Interface

### Features:
1. **Book Selection**: User can select which book(s) to chat with
2. **Multi-Book Chat**: Chat across multiple books
3. **Source Citations**: Show which chunks were used
4. **Chat History**: Persistent conversation history
5. **Book-Specific Chat**: Filter chat by book

### UI Components:
```
┌─────────────────────────────────────┐
│  Knowledge Center                   │
├─────────────────────────────────────┤
│  [Select Books ▼] [All Books]       │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Chat History                 │   │
│  │                               │   │
│  │ User: What is X?              │   │
│  │                               │   │
│  │ Assistant: X is...            │   │
│  │ [Source: Book 1, Ch. 3]      │   │
│  │                               │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Type your question...] [Send]    │
└─────────────────────────────────────┘
```

### RAG Query Flow:
```python
async def chat_with_books(
    user_id: UUID,
    message: str,
    book_ids: List[UUID] = None  # None = all user's books
):
    """
    Chat with user's books using RAG
    """
    # 1. Get user's accessible books
    if book_ids:
        books = book_ids
    else:
        books = await get_user_books(user_id)
    
    # 2. Embed query
    query_embedding = await generate_embedding(message)
    
    # 3. Search across selected books
    chunks = await db.fetch_all("""
        SELECT 
            cc.id,
            cc.text,
            cc.parent_id,
            pc.chapter_title,
            pc.section_title,
            b.title as book_title,
            1 - (cc.embedding <=> $1::vector) as similarity
        FROM child_chunks cc
        JOIN parent_chunks pc ON cc.parent_id = pc.id
        JOIN books b ON cc.book_id = b.id
        JOIN user_book_access uba ON b.id = uba.book_id
        WHERE 
            uba.user_id = $2
            AND uba.is_visible = true
            AND b.id = ANY($3::uuid[])
        ORDER BY cc.embedding <=> $1::vector
        LIMIT 5
    """, query_embedding, user_id, books)
    
    # 4. Generate response with GPT
    context = "\n\n".join([f"[{c.book_title}, {c.chapter_title}]: {c.text}" 
                           for c in chunks])
    
    response = await openai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Answer based on the provided context..."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {message}"}
        ]
    )
    
    # 5. Save chat message
    await save_chat_message(
        user_id=user_id,
        book_id=book_ids[0] if len(book_ids) == 1 else None,
        role="user",
        content=message
    )
    
    await save_chat_message(
        user_id=user_id,
        book_id=book_ids[0] if len(book_ids) == 1 else None,
        role="assistant",
        content=response.choices[0].message.content,
        retrieved_chunks=[c.id for c in chunks],
        sources=[f"{c.book_title}, {c.chapter_title}" for c in chunks]
    )
    
    return {
        "response": response.choices[0].message.content,
        "sources": [f"{c.book_title}, {c.chapter_title}" for c in chunks]
    }
```

---

## Suggested Improvements

### 1. **Content-Based Deduplication** ⭐
```python
# Also check text_hash (content similarity)
# Even if file is different, if content is same → share access
text_hash = hashlib.sha256(extracted_text.encode()).hexdigest()
```

### 2. **Book Sharing Between Users**
```python
# Allow users to share books with other users
POST /api/user/books/{book_id}/share
Body: {"user_email": "user@example.com"}
```

### 3. **Usage Analytics Dashboard**
```python
# Admin can see:
# - Total books uploaded
# - Total pages processed
# - Most active users
# - Popular books
```

### 4. **Book Collections/Tags**
```python
# Users can organize books into collections
CREATE TABLE book_collections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id),
  name TEXT,
  book_ids UUID[]
);
```

### 5. **Export Chat History**
```python
# Users can export their chat conversations
GET /api/user/chat/export?format=pdf
```

### 6. **Book Preview Before Upload**
```python
# Show book metadata before processing
POST /api/user/books/preview
# Returns: title, author, page count (without processing)
```

### 7. **Batch Upload**
```python
# Upload multiple books at once
POST /api/user/books/batch-upload
Body: FormData (files[])
```

### 8. **Book Search**
```python
# Search within user's books
GET /api/user/books/search?q=keyword
```

---

## Security Considerations

### 1. **Row-Level Security (RLS)**
```sql
-- Users can only see their own books
CREATE POLICY "Users can view own books"
ON user_book_access
FOR SELECT
USING (auth.uid() = user_id AND is_visible = true);

-- Users can only upload to themselves
CREATE POLICY "Users can create own access"
ON user_book_access
FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

### 2. **File Access Control**
```python
# Supabase Storage policies
# Users can only access files they have access to
```

### 3. **Rate Limiting**
```python
# Prevent abuse
@limiter.limit("10/minute")
async def upload_book(...):
    ...
```

---

## Implementation Priority

### Phase 1: Core Features
1. ✅ User signup/approval system
2. ✅ Book upload with deduplication
3. ✅ Basic chat interface
4. ✅ Usage limits

### Phase 2: Enhancements
1. ✅ Multi-book chat
2. ✅ Book collections
3. ✅ Usage analytics
4. ✅ Export features

---

## Summary

Your design is solid! Key features:
- ✅ Tiered user system with admin controls
- ✅ Usage limits per user
- ✅ Book deduplication (file-based)
- ✅ Soft delete (books persist)
- ✅ Knowledge center chat

**Suggested additions**:
- Content-based deduplication (text_hash)
- Book sharing between users
- Collections/tags
- Usage analytics

Ready to implement! 🚀
