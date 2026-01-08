# Arsfafe - Automated RAG System

A production-ready RAG (Retrieval-Augmented Generation) system for processing PDF and EPUB books with intelligent chunking, topic labeling, and knowledge center chat.

## Tech Stack

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Shadcn UI**
- **Zustand** (State Management)
- **Supabase Auth**

### Backend
- **Python FastAPI**
- **Supabase** (PostgreSQL + pgvector)
- **OpenAI** (GPT-4o-mini, text-embedding-3-small)
- **PyMuPDF** (PDF processing)
- **ebooklib** (EPUB processing)
- **DeepSeek-OCR** (commented out, ready for complex PDFs)

## Features

- ✅ **Multi-format Support**: PDF and EPUB
- ✅ **Intelligent Chunking**: Topic-based, not token-based
- ✅ **Parent-Child Structure**: Context-rich parent chunks + search-optimized child chunks
- ✅ **Book Deduplication**: Same book = shared access, no reprocessing
- ✅ **User Management**: Admin approval, usage limits
- ✅ **Knowledge Center**: Chat with your books using RAG
- ✅ **Active Learning**: System learns from user corrections

## Quick Start

### 1. Database Setup

1. Run `SUPABASE_SETUP.sql` in Supabase SQL Editor
2. Sign up via Supabase Auth
3. Run `SET_ADMIN.sql` to make yourself admin

### 2. Backend Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
uvicorn main:app --reload
```

### 3. Frontend Setup

```bash
npm install
npm run dev
```

## Project Structure

```
arsfafe/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── routers/      # API endpoints
│   │   ├── services/     # Business logic
│   │   └── utils/        # Utilities
│   └── main.py
├── app/                  # Next.js frontend
│   ├── (auth)/          # Auth pages
│   ├── (dashboard)/     # User dashboard
│   ├── (admin)/         # Admin panel
│   └── api/             # Next.js API routes
├── supabase/
│   └── migrations/      # Database migrations
└── README.md
```

## Environment Variables

### Backend (.env)
```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key
```

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Documentation

- [Architecture Proposal](./ARCHITECTURE_PROPOSAL.md)
- [User System Design](./USER_SYSTEM_DESIGN.md)
- [Database Schema](./SUPABASE_SETUP.sql)

## License

MIT
