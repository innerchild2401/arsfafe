"""
PDF text extraction service
"""
import fitz  # PyMuPDF
from typing import Optional, Tuple
import io

def extract_text_from_pdf(file_content: bytes) -> Tuple[str, bool, dict]:
    """
    Extract text from PDF using PyMuPDF
    
    Returns:
        tuple: (extracted_text, is_native_pdf, metadata)
    """
    try:
        # Open PDF from bytes
        doc = fitz.open(stream=file_content, filetype="pdf")
        
        text_parts = []
        total_pages = len(doc)
        has_text = False
        has_images = False
        
        for page_num in range(total_pages):
            page = doc[page_num]
            
            # Try to extract text
            page_text = page.get_text()
            
            if page_text.strip():
                has_text = True
                text_parts.append(page_text)
            
            # Check for images
            image_list = page.get_images()
            if image_list:
                has_images = True
        
        doc.close()
        
        full_text = "\n\n".join(text_parts)
        
        # Determine if it's a native PDF (has substantial text)
        is_native = len(full_text.strip()) > 100 and not has_images
        
        metadata = {
            "total_pages": total_pages,
            "has_text": has_text,
            "has_images": has_images,
            "text_length": len(full_text),
            "is_native": is_native
        }
        
        return full_text, is_native, metadata
        
    except Exception as e:
        raise Exception(f"Error extracting text from PDF: {str(e)}")

def classify_pdf(file_content: bytes) -> str:
    """
    Traffic light classifier for PDFs
    
    Returns:
        'simple' - Use PyMuPDF (native PDF, text-only)
        'complex' - Use DeepSeek-OCR (scanned, has diagrams)
    """
    try:
        doc = fitz.open(stream=file_content, filetype="pdf")
        page = doc[0]  # Check first page
        
        # Extract text
        text = page.get_text()
        text_length = len(text.strip())
        
        # Check for images
        image_list = page.get_images()
        has_images = len(image_list) > 0
        
        doc.close()
        
        # Simple PDF: Has substantial text and no images
        if text_length > 100 and not has_images:
            return "simple"
        
        # Complex PDF: Scanned or has diagrams
        return "complex"
        
    except Exception as e:
        # If we can't determine, default to complex (safer)
        return "complex"
