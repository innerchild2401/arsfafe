"""
FastAPI Backend for RAG System
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="RAG System API",
    description="Automated RAG system for PDF/EPUB books",
    version="1.0.0"
)

# CORS Configuration
# CORS Configuration - load settings after basic setup to allow health check
try:
    from app.config import settings
    cors_origins_str = os.getenv("CORS_ORIGINS", settings.cors_origins)
except Exception:
    # Fallback if config fails (e.g., missing env vars)
    cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:3000")

# Parse CORS origins from comma-separated string and strip whitespace
cors_origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]

# Ensure localhost is included for development
if "http://localhost:3000" not in cors_origins:
    cors_origins.append("http://localhost:3000")

# Ensure Vercel domain is included
if "https://arsfafer.vercel.app" not in cors_origins:
    cors_origins.append("https://arsfafer.vercel.app")

# Remove duplicates while preserving order
cors_origins = list(dict.fromkeys(cors_origins))

print(f"CORS allowed origins: {cors_origins}")  # Debug log

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "RAG System API", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

# Import routers
from app.routers import books, auth, admin, chat

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(books.router, prefix="/api/books", tags=["books"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
