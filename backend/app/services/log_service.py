"""
Logging service for book processing
Stores logs in database for real-time frontend display
"""
from app.database import get_supabase_admin_client
from typing import Literal

LogLevel = Literal['info', 'success', 'error', 'warning']

def log_processing(book_id: str, message: str, level: LogLevel = 'info'):
    """
    Log a processing message for a book.
    
    Args:
        book_id: Book UUID
        message: Log message
        level: Log level (info, success, error, warning)
    """
    try:
        supabase = get_supabase_admin_client()
        supabase.table("processing_logs").insert({
            "book_id": book_id,
            "log_message": message,
            "log_level": level
        }).execute()
    except Exception as e:
        # Don't fail processing if logging fails
        print(f"⚠️ Failed to log message: {str(e)}")
        # Still print to console as fallback
        print(f"[{level.upper()}] {message}")

def log_info(book_id: str, message: str):
    """Log an info message."""
    log_processing(book_id, message, 'info')

def log_success(book_id: str, message: str):
    """Log a success message."""
    log_processing(book_id, message, 'success')

def log_error(book_id: str, message: str):
    """Log an error message."""
    log_processing(book_id, message, 'error')

def log_warning(book_id: str, message: str):
    """Log a warning message."""
    log_processing(book_id, message, 'warning')
