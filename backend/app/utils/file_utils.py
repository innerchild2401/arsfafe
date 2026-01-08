"""
File utility functions
"""
import hashlib
from pathlib import Path
from typing import Tuple

def calculate_file_hash(file_content: bytes) -> str:
    """Calculate SHA-256 hash of file content"""
    return hashlib.sha256(file_content).hexdigest()

def calculate_text_hash(text: str) -> str:
    """Calculate SHA-256 hash of text content"""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def get_file_extension(filename: str) -> str:
    """Get file extension in lowercase"""
    return Path(filename).suffix.lower().lstrip('.')

def is_valid_file_type(filename: str) -> bool:
    """Check if file type is supported (PDF or EPUB)"""
    ext = get_file_extension(filename)
    return ext in ['pdf', 'epub']

def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"
