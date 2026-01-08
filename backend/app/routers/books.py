"""
Book upload and management endpoints
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional
from datetime import datetime

from app.database import get_supabase_client, get_supabase_admin_client
from app.dependencies import get_current_user, check_usage_limits
from app.utils.file_utils import (
    calculate_file_hash,
    calculate_text_hash,
    get_file_extension,
    is_valid_file_type,
    format_file_size
)
from app.services.pdf_extractor import extract_text_from_pdf, classify_pdf
from app.services.epub_extractor import extract_text_from_epub
from app.services.structure_extractor import extract_structure
from app.services.embedding_service import generate_embeddings_batch
from app.services.topic_labeler import generate_topic_labels
from app.services.storage_service import upload_file_to_storage

router = APIRouter()

@router.get("/test")
async def test_books_router():
    """Test endpoint to verify router is working"""
    return {"message": "Books router is working", "status": "ok"}

@router.post("/upload")
async def upload_book(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    author: Optional[str] = None,
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a book (PDF or EPUB)
    
    Features:
    - File deduplication (same file = shared access)
    - Traffic light classifier for PDFs
    - Automatic text extraction
    - Background processing
    """
    try:
        print(f"📤 Upload request from user {current_user.get('id')} for file: {file.filename}")
        
        # Check usage limits
        check_usage_limits(current_user, "books")
        
        # Validate file type
        if not file.filename or not is_valid_file_type(file.filename):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only PDF and EPUB files are supported."
            )
        
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        file_type = get_file_extension(file.filename)
        
        print(f"📄 File info: {file.filename}, size: {file_size} bytes, type: {file_type}")
        
        if file_size == 0:
            raise HTTPException(
                status_code=400,
                detail="File is empty"
            )
        
        # Calculate file hash for deduplication
        file_hash = calculate_file_hash(file_content)
        
        # Use admin client for all database and storage operations to bypass RLS
        # This ensures the backend can perform all operations regardless of RLS policies
        supabase = get_supabase_admin_client()
        
        # Check if book already exists
        existing_book = supabase.table("books").select("*").eq("file_hash", file_hash).execute()
        
        if existing_book.data:
            # Book exists - check status and grant access
            book = existing_book.data[0]
            book_id = book["id"]
            book_status = book.get("status", "uploaded")
            user_id = current_user["id"]
            retry_mode = False  # Flag for retry mode - will be set to True if error status and owner retries
            
            # Check if user already has access
            access_check = supabase.table("user_book_access").select("*").eq("user_id", user_id).eq("book_id", book_id).execute()
            
            if not access_check.data:
                # Grant access to existing book
                supabase.table("user_book_access").insert({
                    "user_id": user_id,
                    "book_id": book_id,
                    "is_owner": False,
                    "is_visible": True
                }).execute()
                message = "Book already exists. Access granted."
            else:
                # User already has access
                message = "Book already exists and you already have access."
            
            # Log status for debugging
            print(f"✅ Duplicate book detected: {book_id}, status: {book_status}, user has access: {bool(access_check.data)}")
            
            # If book is already processed successfully, return immediately (no GPT calls)
            if book_status == "ready":
                print(f"✅ Book {book_id} is already processed (status: ready). Skipping processing.")
                return JSONResponse({
                    "book_id": book_id,
                    "status": "existing",
                    "book_status": "ready",
                    "message": message + " Book is ready for use."
                })
            
            # If book is still processing, return but don't reprocess
            if book_status == "processing":
                print(f"⏳ Book {book_id} is still processing. Access granted, but processing continues.")
                return JSONResponse({
                    "book_id": book_id,
                    "status": "existing",
                    "book_status": "processing",
                    "message": message + " Book is still being processed."
                })
            
            # If book had an error, allow retry by continuing with processing
            # We'll check after text extraction if we should retry or just grant access
            if book_status == "error":
                # Check if this user is the original owner
                original_owner = supabase.table("user_book_access").select("user_id, is_owner").eq("book_id", book_id).eq("is_owner", True).execute()
                is_owner = original_owner.data and original_owner.data[0]["user_id"] == user_id
                
                # If not owner, just grant access and return
                if not is_owner:
                    print(f"⚠️ Book {book_id} previously failed processing (status: error). Access granted, but not retrying (not owner).")
                    return JSONResponse({
                        "book_id": book_id,
                        "status": "existing",
                        "book_status": "error",
                        "message": message + " Book previously failed processing. Original owner can retry by uploading again."
                    })
                
                # Owner is retrying - continue with processing below
                print(f"🔄 Book {book_id} previously failed processing. Owner is retrying - continuing with processing...")
                
                # Delete existing chunks if any (clean slate for retry)
                try:
                    supabase.table("child_chunks").delete().eq("book_id", book_id).execute()
                    supabase.table("parent_chunks").delete().eq("book_id", book_id).execute()
                    print(f"🧹 Cleaned up existing chunks for retry")
                except Exception as e:
                    print(f"⚠️ Could not clean up chunks: {str(e)}")
                
                # Update status to processing
                supabase.table("books").update({
                    "status": "processing",
                    "processing_error": None
                }).eq("id", book_id).execute()
                
                # Continue with text extraction and processing below (don't return here)
            
            # Default case (status: uploaded) - should not happen if processing completed
            return JSONResponse({
                "book_id": book_id,
                "status": "existing",
                "book_status": book_status,
                "message": message
            })
        
        # Upload to Supabase Storage (skip if retry mode)
        if not retry_mode:
            print("💾 Uploading file to storage...")
            try:
                # Pass admin client to storage service (or let it use default admin client)
                storage_path = upload_file_to_storage(
                    file_content=file_content,
                    filename=file.filename,
                    folder="books",
                    supabase=supabase  # Use admin client
                )
                print(f"✅ File uploaded to storage: {storage_path}")
            except Exception as e:
                print(f"❌ Storage upload failed: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload file to storage: {str(e)}"
                )
        else:
            # Retry mode: reuse existing storage path
            storage_path = book.get("file_path")
            print(f"🔄 Retry mode: reusing existing storage path: {storage_path}")
        
        # Extract text based on file type
        print(f"📖 Extracting text from {file_type} file...")
        try:
            if file_type == "pdf":
                # Traffic light classifier
                pdf_class = classify_pdf(file_content)
                
                if pdf_class == "simple":
                    # Use PyMuPDF
                    extracted_text, is_native, pdf_metadata = extract_text_from_pdf(file_content)
                else:
                    # Complex PDF - use DeepSeek-OCR (commented out for now)
                    # TODO: Implement DeepSeek-OCR integration
                    # For now, fallback to PyMuPDF
                    extracted_text, is_native, pdf_metadata = extract_text_from_pdf(file_content)
                    # extracted_text = await deepseek_ocr_extract(file_content)
            
            elif file_type == "epub":
                extracted_text, epub_metadata = extract_text_from_epub(file_content)
                pdf_metadata = {
                    "total_pages": epub_metadata.get("total_chapters", 0),
                    "title": epub_metadata.get("title"),
                    "author": epub_metadata.get("author")
                }
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type: {file_type}"
                )
            
            if not extracted_text or len(extracted_text.strip()) == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Could not extract text from file. File may be corrupted or empty."
                )
            
            print(f"✅ Text extracted: {len(extracted_text)} characters")
        except HTTPException:
            raise
        except Exception as e:
            print(f"❌ Text extraction failed: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to extract text from file: {str(e)}"
            )
        
        # Calculate text hash for content-based deduplication
        text_hash = calculate_text_hash(extracted_text)
        
        # Check if we're in retry mode (book exists with error status)
        if retry_mode:
            # Update existing book record instead of creating new one
            book_data = {
                "extracted_text": extracted_text[:10000],  # Store first 10K chars for preview
                "text_hash": text_hash,
                "status": "processing",
                "total_pages": pdf_metadata.get("total_pages", 0),
                "processing_error": None
            }
            # Update title/author if provided or extracted
            if title or pdf_metadata.get("title"):
                book_data["title"] = title or pdf_metadata.get("title")
            if author or pdf_metadata.get("author"):
                book_data["author"] = author or pdf_metadata.get("author")
            
            supabase.table("books").update(book_data).eq("id", book_id).execute()
            print(f"✅ Updated existing book {book_id} for retry")
        else:
            # Create new book record
            book_data = {
                "original_filename": file.filename,
                "file_type": file_type,
                "file_size": file_size,
                "file_hash": file_hash,
                "file_path": storage_path,
                "title": title or pdf_metadata.get("title"),
                "author": author or pdf_metadata.get("author"),
                "extracted_text": extracted_text[:10000],  # Store first 10K chars for preview
                "text_hash": text_hash,
                "status": "processing",
                "total_pages": pdf_metadata.get("total_pages", 0)
            }
            
            book_result = supabase.table("books").insert(book_data).execute()
            book_id = book_result.data[0]["id"]
            user_id = current_user["id"]
            
            # Grant access to user (as owner)
            supabase.table("user_book_access").insert({
                "user_id": user_id,
                "book_id": book_id,
                "is_owner": True,
                "is_visible": True
            }).execute()
        
        # Process book in background
        if background_tasks:
            background_tasks.add_task(
                process_book,
                book_id=book_id,
                extracted_text=extracted_text,
                file_type=file_type,
                title=book_data["title"],
                author=book_data["author"]
            )
        
        return JSONResponse({
            "book_id": book_id,
            "status": "uploaded",
            "message": "Book uploaded successfully. Processing in background.",
            "file_type": file_type,
            "file_size": format_file_size(file_size)
        })
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )

async def process_book(
    book_id: str,
    extracted_text: str,
    file_type: str,
    title: Optional[str] = None,
    author: Optional[str] = None
):
    """
    Background task to process book:
    1. Extract structure
    2. Create parent-child chunks
    3. Generate embeddings
    4. Store in database
    """
    try:
        # Use admin client for background processing to bypass RLS
        supabase = get_supabase_admin_client()
        
        # Update status
        supabase.table("books").update({
            "status": "processing"
        }).eq("id", book_id).execute()
        
        # Step 1: Extract structure
        structured_json = extract_structure(extracted_text, title, author)
        
        # Step 2: Create chunks and generate embeddings
        parent_chunks = []
        child_chunks = []
        
        for chapter in structured_json["document"]["chapters"]:
            chapter_title = chapter.get("chapter_title", "Untitled Chapter")
            
            for section in chapter.get("sections", []):
                section_title = section.get("section_title", "")
                paragraphs = section.get("paragraphs", [])
                
                # Create parent chunk (full section)
                parent_text = "\n\n".join(paragraphs)
                
                # Generate topic labels
                topic_labels = generate_topic_labels(parent_text)
                
                # Insert parent chunk
                parent_data = {
                    "book_id": book_id,
                    "chapter_title": chapter_title,
                    "section_title": section_title,
                    "full_text": parent_text,
                    "topic_labels": topic_labels
                }
                
                parent_result = supabase.table("parent_chunks").insert(parent_data).execute()
                parent_id = parent_result.data[0]["id"]
                parent_chunks.append({"id": parent_id, "text": parent_text})
                
                # Create child chunks (individual paragraphs)
                child_texts = [para for para in paragraphs if para.strip()]
                
                if child_texts:
                    # Generate embeddings in batch
                    embeddings = generate_embeddings_batch(child_texts)
                    
                    # Insert child chunks
                    for idx, (text, embedding) in enumerate(zip(child_texts, embeddings)):
                        child_data = {
                            "parent_id": parent_id,
                            "book_id": book_id,
                            "text": text,
                            "embedding": embedding,
                            "paragraph_index": idx
                        }
                        
                        supabase.table("child_chunks").insert(child_data).execute()
                        child_chunks.append({"id": child_data.get("id"), "text": text})
        
        # Update book status
        total_chunks = len(parent_chunks) + len(child_chunks)
        
        supabase.table("books").update({
            "status": "ready",
            "total_chunks": total_chunks,
            "processed_at": datetime.utcnow().isoformat()
        }).eq("id", book_id).execute()
        
        print(f"Book {book_id} processed successfully: {total_chunks} chunks created")
        
    except Exception as e:
        # Update book status to error
        # Use admin client to bypass RLS
        error_supabase = get_supabase_admin_client()
        error_supabase.table("books").update({
            "status": "error",
            "processing_error": str(e)
        }).eq("id", book_id).execute()
        
        print(f"Error processing book {book_id}: {str(e)}")
        raise

@router.get("/")
async def list_books(
    current_user: dict = Depends(get_current_user),
    include_deleted: bool = False
):
    """List user's books"""
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    # Get user's accessible books
    query = supabase.table("user_book_access").select(
        "book_id, is_owner, is_visible, books(*)"
    ).eq("user_id", user_id)
    
    if not include_deleted:
        query = query.eq("is_visible", True)
    
    result = query.order("access_granted_at", desc=True).execute()
    
    # Format response
    books = []
    for access in result.data:
        book = access.get("books")
        if book:
            book["is_owner"] = access.get("is_owner", False)
            book["is_visible"] = access.get("is_visible", True)
            books.append(book)
    
    return {"books": books}

@router.get("/{book_id}/chunks")
async def get_book_chunks(
    book_id: str,
    current_user: dict = Depends(get_current_user),
    chunk_type: str = "all"  # "parent", "child", or "all"
):
    """
    Get chunks for a book
    
    Query params:
    - chunk_type: "parent", "child", or "all" (default: "all")
    """
    supabase = get_supabase_admin_client()
    
    # Check if user has access
    access_check = supabase.table("user_book_access").select("*").eq("user_id", current_user["id"]).eq("book_id", book_id).eq("is_visible", True).execute()
    
    if not access_check.data and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    chunks = {}
    
    # Get parent chunks
    if chunk_type in ["parent", "all"]:
        parent_result = supabase.table("parent_chunks").select(
            "id, chapter_title, section_title, full_text, topic_labels, chunk_index, created_at"
        ).eq("book_id", book_id).order("chunk_index").execute()
        chunks["parent_chunks"] = parent_result.data or []
    
    # Get child chunks
    if chunk_type in ["child", "all"]:
        child_result = supabase.table("child_chunks").select(
            "id, text, parent_id, paragraph_index, page_number, created_at, parent_chunks(chapter_title, section_title)"
        ).eq("book_id", book_id).order("paragraph_index").execute()
        chunks["child_chunks"] = child_result.data or []
    
    # Get chunk counts
    parent_count = supabase.table("parent_chunks").select("id", count="exact").eq("book_id", book_id).execute()
    child_count = supabase.table("child_chunks").select("id", count="exact").eq("book_id", book_id).execute()
    
    chunks["counts"] = {
        "parent_chunks": parent_count.count if hasattr(parent_count, 'count') else len(parent_count.data),
        "child_chunks": child_count.count if hasattr(child_count, 'count') else len(child_count.data)
    }
    
    return chunks

@router.get("/{book_id}")
async def get_book(
    book_id: str,
    current_user: dict = Depends(get_current_user),
    include_status: bool = True
):
    """
    Get book details with processing status and chunk information
    
    Query params:
    - include_status: Include chunk counts and processing status (default: true)
    """
    # Use admin client to bypass RLS
    supabase = get_supabase_admin_client()
    
    # Get book details
    result = supabase.table("books").select("*").eq("id", book_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Book not found")
    
    book = result.data[0]
    
    # Check if user has access
    access_check = supabase.table("user_book_access").select("*").eq("user_id", current_user["id"]).eq("book_id", book_id).eq("is_visible", True).execute()
    
    if not access_check.data and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Include processing status if requested
    if include_status:
        # Get chunk counts
        parent_chunks = supabase.table("parent_chunks").select("id", count="exact").eq("book_id", book_id).execute()
        child_chunks = supabase.table("child_chunks").select("id", count="exact").eq("book_id", book_id).execute()
        
        parent_count = parent_chunks.count if hasattr(parent_chunks, 'count') else len(parent_chunks.data)
        child_count = child_chunks.count if hasattr(child_chunks, 'count') else len(child_chunks.data)
        
        # Check if chunks have embeddings
        chunks_with_embeddings = supabase.table("child_chunks").select("id", count="exact").eq("book_id", book_id).not_.is_("embedding", "null").execute()
        embedded_count = chunks_with_embeddings.count if hasattr(chunks_with_embeddings, 'count') else len(chunks_with_embeddings.data)
        
        book["processing_info"] = {
            "status": book.get("status", "unknown"),
            "parent_chunks_count": parent_count,
            "child_chunks_count": child_count,
            "embeddings_count": embedded_count,
            "is_ready": book.get("status") == "ready" and child_count > 0 and embedded_count > 0,
            "has_errors": book.get("status") == "error",
            "processing_error": book.get("processing_error"),
            "processed_at": book.get("processed_at"),
            "total_pages": book.get("total_pages", 0)
        }
    
    return {"book": book}

@router.delete("/{book_id}")
async def delete_book(
    book_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Soft delete book (user-specific)"""
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    # Soft delete by setting is_visible = false
    result = supabase.table("user_book_access").update({
        "is_visible": False,
        "deleted_at": datetime.utcnow().isoformat()
    }).eq("user_id", user_id).eq("book_id", book_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Book not found or access denied")
    
    return {"message": "Book deleted (soft delete - book remains in database)"}

@router.post("/{book_id}/restore")
async def restore_book(
    book_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Restore a soft-deleted book"""
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    result = supabase.table("user_book_access").update({
        "is_visible": True,
        "deleted_at": None
    }).eq("user_id", user_id).eq("book_id", book_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Book not found or access denied")
    
    return {"message": "Book restored"}
