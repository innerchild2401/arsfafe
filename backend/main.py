"""
FastAPI Backend for RAG System
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import os
import traceback
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="RAG System API",
    description="Automated RAG system for PDF/EPUB books",
    version="1.0.0"
)

# CORS Configuration
# Load CORS origins from environment or use defaults
cors_origins_str = os.getenv("CORS_ORIGINS", "")

# Default origins that should always be allowed
default_origins = [
    "http://localhost:3000",
    "https://arsfafer.vercel.app",
]

# Parse CORS origins from comma-separated string
cors_origins = []
if cors_origins_str:
    cors_origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]

# Always add default origins
cors_origins.extend(default_origins)

# Remove duplicates while preserving order
cors_origins = list(dict.fromkeys(cors_origins))

print(f"🔒 CORS allowed origins: {cors_origins}")  # Debug log

# Add CORS middleware - must be added before routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Global exception handlers
# Note: CORS middleware should handle headers, but we ensure errors are properly formatted
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions"""
    print(f"❌ Unhandled exception: {exc}")
    print(traceback.format_exc())
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "error": str(exc)}
    )

@app.get("/")
async def root():
    return {"message": "RAG System API", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/routes")
async def list_routes():
    """List all registered routes for debugging"""
    routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": getattr(route, 'name', 'unknown')
            })
    return {"routes": routes}

# Import routers
try:
    from app.routers import books, auth, admin, chat
    
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(books.router, prefix="/api/books", tags=["books"])
    app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
    app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
    
    print("✅ All routers registered successfully")
    # Print all registered routes for debugging
    print("📋 Registered routes:")
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            print(f"  {list(route.methods)} {route.path}")
except Exception as e:
    print(f"❌ Failed to load routers: {e}")
    import traceback
    traceback.print_exc()
    raise

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
