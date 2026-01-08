"""
EPUB text extraction service
"""
import ebooklib
from ebooklib import epub
from typing import Tuple
import re
from html import unescape
import io

def extract_text_from_epub(file_content: bytes) -> Tuple[str, dict]:
    """
    Extract text from EPUB file
    
    Returns:
        tuple: (extracted_text, metadata)
    """
    try:
        # Open EPUB from bytes
        book = epub.read_epub(io.BytesIO(file_content))
        
        text_parts = []
        chapters = []
        
        # Extract metadata
        title = book.get_metadata('DC', 'title')
        author = book.get_metadata('DC', 'creator')
        
        # Extract text from all items
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                # Get HTML content
                content = item.get_content().decode('utf-8')
                
                # Extract text from HTML (simple approach)
                text = extract_text_from_html(content)
                
                if text.strip():
                    text_parts.append(text)
                    chapters.append({
                        "title": item.get_name(),
                        "text_length": len(text)
                    })
        
        full_text = "\n\n".join(text_parts)
        
        metadata = {
            "title": title[0][0] if title else None,
            "author": author[0][0] if author else None,
            "total_chapters": len(chapters),
            "text_length": len(full_text),
            "chapters": chapters
        }
        
        return full_text, metadata
        
    except Exception as e:
        raise Exception(f"Error extracting text from EPUB: {str(e)}")

def extract_text_from_html(html_content: str) -> str:
    """
    Simple HTML to text extraction
    """
    # Remove script and style elements
    html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
    html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
    
    # Replace common HTML elements with newlines
    html_content = re.sub(r'<h[1-6][^>]*>', '\n\n', html_content, flags=re.IGNORECASE)
    html_content = re.sub(r'<p[^>]*>', '\n', html_content, flags=re.IGNORECASE)
    html_content = re.sub(r'<br[^>]*>', '\n', html_content, flags=re.IGNORECASE)
    html_content = re.sub(r'<div[^>]*>', '\n', html_content, flags=re.IGNORECASE)
    
    # Remove all HTML tags
    text = re.sub(r'<[^>]+>', '', html_content)
    
    # Decode HTML entities
    text = unescape(text)
    
    # Clean up whitespace
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)  # Multiple newlines to double
    text = re.sub(r'[ \t]+', ' ', text)  # Multiple spaces to single
    
    return text.strip()
