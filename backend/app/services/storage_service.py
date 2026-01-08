"""
Supabase Storage service for file uploads
"""
from supabase import Client
from app.database import get_supabase_client
from typing import Optional
import uuid

def upload_file_to_storage(
    file_content: bytes,
    filename: str,
    folder: str = "books",
    supabase: Optional[Client] = None
) -> str:
    """
    Upload file to Supabase Storage
    
    Args:
        file_content: File content as bytes
        filename: Original filename
        folder: Storage folder (default: "books")
        supabase: Optional Supabase client (will create if not provided)
    
    Returns:
        Storage path of uploaded file
    """
    if not supabase:
        supabase = get_supabase_client()
    
    # Generate unique filename
    file_ext = filename.split('.')[-1] if '.' in filename else ''
    unique_filename = f"{uuid.uuid4()}.{file_ext}" if file_ext else str(uuid.uuid4())
    storage_path = f"{folder}/{unique_filename}"
    
    try:
        # Determine content type
        content_type_map = {
            "pdf": "application/pdf",
            "epub": "application/epub+zip"
        }
        content_type = content_type_map.get(file_ext.lower(), "application/octet-stream")
        
        # Upload to Supabase Storage
        result = supabase.storage.from_("books").upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": content_type, "upsert": "false"}
        )
        
        print(f"✅ Storage upload result: {result}")
        return storage_path
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Storage upload error: {error_msg}")
        # Check if it's a bucket/policy issue
        if "bucket" in error_msg.lower() or "policy" in error_msg.lower():
            raise Exception(f"Storage bucket 'books' may not exist or you may not have permission. Please create the bucket in Supabase Storage. Error: {error_msg}")
        raise Exception(f"Failed to upload file to storage: {error_msg}")

def get_file_from_storage(
    storage_path: str,
    supabase: Optional[Client] = None
) -> bytes:
    """
    Download file from Supabase Storage
    
    Args:
        storage_path: Path in storage (e.g., "books/filename.pdf")
        supabase: Optional Supabase client
    
    Returns:
        File content as bytes
    """
    if not supabase:
        supabase = get_supabase_client()
    
    try:
        # Extract folder and filename
        parts = storage_path.split('/')
        folder = parts[0] if len(parts) > 1 else "books"
        filename = parts[-1]
        
        # Download from Supabase Storage
        file_data = supabase.storage.from_(folder).download(filename)
        
        return file_data
        
    except Exception as e:
        raise Exception(f"Failed to download file from storage: {str(e)}")

def delete_file_from_storage(
    storage_path: str,
    supabase: Optional[Client] = None
):
    """
    Delete file from Supabase Storage
    
    Args:
        storage_path: Path in storage
        supabase: Optional Supabase client
    """
    if not supabase:
        supabase = get_supabase_client()
    
    try:
        # Extract folder and filename
        parts = storage_path.split('/')
        folder = parts[0] if len(parts) > 1 else "books"
        filename = parts[-1]
        
        # Delete from Supabase Storage
        supabase.storage.from_(folder).remove([filename])
        
    except Exception as e:
        raise Exception(f"Failed to delete file from storage: {str(e)}")
