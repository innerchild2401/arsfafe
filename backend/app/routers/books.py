"""
Book upload and management endpoints
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional
from datetime import datetime, timedelta

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
from app.services.log_service import log_info, log_success, log_error, log_warning
from app.services.summary_service import generate_chapter_summary, generate_book_summary

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
            
            # If book is still processing, check if it's stuck
            if book_status == "processing":
                # Check if chunks exist - if no chunks, assume it's stuck
                try:
                    chunks_check = supabase.table("child_chunks").select("id", count="exact").eq("book_id", book_id).execute()
                    has_chunks = chunks_check.count > 0 if hasattr(chunks_check, 'count') else len(chunks_check.data) > 0
                    
                    if has_chunks:
                        # Has chunks - actually processing, don't retry
                        print(f"⏳ Book {book_id} is still processing and has chunks. Access granted, but processing continues.")
                        return JSONResponse({
                            "book_id": book_id,
                            "status": "existing",
                            "book_status": "processing",
                            "message": message + " Book is still being processed."
                        })
                    
                    # No chunks - check how long it's been processing
                    book_updated_at = book.get("updated_at")
                    if book_updated_at:
                        try:
                            updated_time = datetime.fromisoformat(book_updated_at.replace('Z', '+00:00'))
                            if isinstance(updated_time, datetime):
                                time_since_update = datetime.utcnow() - updated_time.replace(tzinfo=None)
                                # If processing for more than 2 minutes with no chunks, assume stuck
                                if time_since_update > timedelta(minutes=2):
                                    print(f"⚠️ Book {book_id} has been processing for {time_since_update} with no chunks. Treating as stuck, allowing retry.")
                                    retry_mode = True
                                    supabase.table("books").update({
                                        "status": "error",
                                        "processing_error": f"Processing stuck - no chunks created after {time_since_update}"
                                    }).eq("id", book_id).execute()
                                    book_status = "error"
                                    # Continue to retry logic below
                                else:
                                    # Recently started, give it time
                                    print(f"⏳ Book {book_id} is processing (started {time_since_update} ago, no chunks yet). Access granted, processing continues.")
                                    return JSONResponse({
                                        "book_id": book_id,
                                        "status": "existing",
                                        "book_status": "processing",
                                        "message": message + " Book is still being processed."
                                    })
                        except Exception as e:
                            print(f"⚠️ Could not check processing timeout: {str(e)}. No chunks found, assuming stuck and allowing retry.")
                            retry_mode = True
                            supabase.table("books").update({
                                "status": "error",
                                "processing_error": "Processing stuck - no chunks and timestamp check failed"
                            }).eq("id", book_id).execute()
                            book_status = "error"
                    else:
                        # No timestamp and no chunks - definitely stuck
                        print(f"⚠️ Book {book_id} is processing but has no chunks and no timestamp. Treating as stuck, allowing retry.")
                        retry_mode = True
                        supabase.table("books").update({
                            "status": "error",
                            "processing_error": "Processing stuck - no chunks and no timestamp"
                        }).eq("id", book_id).execute()
                        book_status = "error"
                except Exception as e:
                    print(f"⚠️ Error checking processing status: {str(e)}. Assuming stuck, allowing retry.")
                    retry_mode = True
                    supabase.table("books").update({
                        "status": "error",
                        "processing_error": f"Processing check failed: {str(e)}"
                    }).eq("id", book_id).execute()
                    book_status = "error"
            
            # If book had an error, allow retry by continuing with processing
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
                
                # Owner is retrying - set retry_mode and continue with processing
                print(f"🔄 Book {book_id} previously failed processing. Owner is retrying - continuing with processing...")
                retry_mode = True  # Set retry mode flag
                
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
                
                # Store book reference for retry mode (we'll use file_path later)
                # Continue to text extraction and processing below - DON'T return here
                pass
            elif book_status == "uploaded":
                # Default case (status: uploaded) - should not happen if processing completed
                # But if it does, just return
                return JSONResponse({
                    "book_id": book_id,
                    "status": "existing",
                    "book_status": book_status,
                    "message": message
                })
        
        # Upload to Supabase Storage (skip if retry mode)
        print(f"🔄 retry_mode = {retry_mode}")
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
        
        # Process book - for now, run synchronously to debug
        # TODO: Switch back to background task once we confirm it works
        print(f"🔄 Starting processing for book {book_id} (synchronous for debugging)")
        print(f"📊 Extracted text length for processing: {len(extracted_text)} characters")
        
        # Run processing synchronously for now to see if it works
        # This will block the response, but it ensures processing happens
        try:
            import asyncio
            # Check if we're in an async context
            try:
                loop = asyncio.get_running_loop()
                # We're in an async context, so we need to run in a thread
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(
                        process_book,
                        book_id=book_id,
                        extracted_text=extracted_text,
                        file_type=file_type,
                        title=book_data.get("title"),
                        author=book_data.get("author")
                    )
                    # Don't wait for completion - let it run in background thread
                    print(f"✅ Processing started in background thread")
            except RuntimeError:
                # No async loop, can run directly
                process_book(
                    book_id=book_id,
                    extracted_text=extracted_text,
                    file_type=file_type,
                    title=book_data.get("title"),
                    author=book_data.get("author")
                )
                print(f"✅ Processing completed synchronously")
        except Exception as e:
            print(f"❌ Error starting processing: {str(e)}")
            import traceback
            traceback.print_exc()
            # Don't fail the upload - processing will be retried
        
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

def process_book(
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
        log_info(book_id, f"Starting processing ({len(extracted_text):,} characters)")
        print(f"🔄 Starting background processing for book {book_id}")
        print(f"📊 Extracted text length: {len(extracted_text)} characters")
        
        # Use admin client for background processing to bypass RLS
        supabase = get_supabase_admin_client()
        
        # Update status
        supabase.table("books").update({
            "status": "processing"
        }).eq("id", book_id).execute()
        log_success(book_id, "Status updated to processing")
        print(f"✅ Updated book status to 'processing'")
        
        # Step 1: Extract structure
        log_info(book_id, "Extracting structure with GPT-4o-mini...")
        print(f"🔍 Step 1: Extracting structure using GPT-4o-mini...")
        structured_json = extract_structure(extracted_text, title, author, book_id)
        log_success(book_id, "Structure extraction completed")
        print(f"✅ Structure extracted successfully")
        
        # Step 2: Create chunks and generate embeddings
        log_info(book_id, "Creating chunks and generating embeddings...")
        print(f"📦 Step 2: Creating chunks...")
        parent_chunks = []
        child_chunks = []
        chapter_summaries = []  # Collect chapter summaries for book-level summary
        
        num_chapters = len(structured_json["document"]["chapters"])
        log_info(book_id, f"Found {num_chapters} chapters")
        print(f"📚 Found {num_chapters} chapters")
        
        for chapter_idx, chapter in enumerate(structured_json["document"]["chapters"]):
            chapter_title = chapter.get("chapter_title", "Untitled Chapter")
            log_info(book_id, f"Processing chapter {chapter_idx + 1}/{num_chapters}: {chapter_title[:50]}")
            print(f"📖 Processing chapter {chapter_idx + 1}/{num_chapters}: {chapter_title}")
            
            # Collect all text and summaries for this chapter
            chapter_full_text_parts = []
            chapter_section_summaries = []
            
            for section in chapter.get("sections", []):
                section_title = section.get("section_title") or ""  # Handle None case
                paragraphs = section.get("paragraphs", [])
                
                # Filter and convert paragraphs to strings (handle any non-string types)
                paragraphs = [
                    str(p).strip() for p in paragraphs 
                    if p is not None and str(p).strip()
                ]
                
                # Skip sections with no paragraphs
                if not paragraphs:
                    continue
                
                # Create parent chunk (full section)
                parent_text = "\n\n".join(paragraphs)
                chapter_full_text_parts.append(parent_text)  # Collect for chapter summary
                
                # Generate topic labels and section summary
                section_display = section_title[:50] if section_title else "(Untitled Section)"
                log_info(book_id, f"Labeling section: {section_display}")
                print(f"🏷️  Generating topic labels for section: {section_display}...")
                topic_labels = generate_topic_labels(parent_text)
                log_success(book_id, f"Generated {len(topic_labels) if topic_labels else 0} topic labels")
                print(f"✅ Generated {len(topic_labels) if topic_labels else 0} topic labels")
                
                # Generate concise summary for this section (for parent_chunks.concise_summary)
                section_summary = None
                try:
                    section_summary = generate_chapter_summary(parent_text, f"{chapter_title} - {section_title}" if section_title else chapter_title)
                    chapter_section_summaries.append(section_summary)  # Collect for chapter summary
                    print(f"📝 Generated section summary ({len(section_summary)} chars)")
                except Exception as e:
                    print(f"⚠️ Failed to generate section summary: {str(e)}")
                    # Continue without summary - not critical
                
                # Insert parent chunk with summary
                parent_data = {
                    "book_id": book_id,
                    "chapter_title": chapter_title,
                    "section_title": section_title,
                    "full_text": parent_text,
                    "topic_labels": topic_labels,
                    "concise_summary": section_summary  # Store section summary
                }
                
                parent_result = supabase.table("parent_chunks").insert(parent_data).execute()
                parent_id = parent_result.data[0]["id"]
                parent_chunks.append({"id": parent_id, "text": parent_text})
                
                # Create child chunks (individual paragraphs) - already filtered and converted to strings above
                child_texts = [para for para in paragraphs if para]
                
                if child_texts:
                    # Generate embeddings in batch
                    log_info(book_id, f"Generating embeddings for {len(child_texts)} chunks...")
                    print(f"🧮 Generating embeddings for {len(child_texts)} child chunks...")
                    embeddings = generate_embeddings_batch(child_texts)
                    log_success(book_id, f"Generated {len(embeddings)} embeddings")
                    print(f"✅ Generated {len(embeddings)} embeddings")
                    
                    # Insert child chunks
                    log_info(book_id, f"Inserting {len(child_texts)} chunks into database...")
                    print(f"💾 Inserting {len(child_texts)} child chunks into database...")
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
            
            # Build chapter summary from section summaries
            if chapter_section_summaries:
                # Combine section summaries for chapter-level summary
                combined_chapter_text = "\n\n".join(chapter_section_summaries)
                chapter_summaries.append(f"{chapter_title}: {combined_chapter_text[:800]}")  # Limit length
            elif chapter_full_text_parts:
                # Fallback: generate summary from full chapter text
                chapter_full_text = "\n\n".join(chapter_full_text_parts)
                log_info(book_id, f"Generating summary for chapter: {chapter_title[:50]}")
                print(f"📝 Generating summary for chapter: {chapter_title}...")
                try:
                    chapter_summary = generate_chapter_summary(chapter_full_text, chapter_title)
                    chapter_summaries.append(chapter_summary)
                    log_success(book_id, f"Generated chapter summary ({len(chapter_summary)} chars)")
                    print(f"✅ Generated chapter summary")
                except Exception as e:
                    print(f"⚠️ Failed to generate chapter summary: {str(e)}")
                    # Continue without summary - not critical
                    chapter_summaries.append(f"{chapter_title}: {chapter_full_text[:300]}...")
        
        # Step 3: Generate book-level executive summary
        log_info(book_id, "Generating book-level executive summary...")
        print(f"📚 Step 3: Generating book-level executive summary...")
        global_summary = None
        if chapter_summaries:
            try:
                global_summary = generate_book_summary(chapter_summaries, title, author)
                log_success(book_id, f"Generated book summary ({len(global_summary)} chars)")
                print(f"✅ Generated book-level executive summary")
            except Exception as e:
                print(f"⚠️ Failed to generate book summary: {str(e)}")
                # Fallback: use first few chapter summaries
                global_summary = "\n\n".join(chapter_summaries[:5])
        
        # Update book status with summary
        total_chunks = len(parent_chunks) + len(child_chunks)
        
        update_data = {
            "status": "ready",
            "total_chunks": total_chunks,
            "processed_at": datetime.utcnow().isoformat()
        }
        
        if global_summary:
            update_data["global_summary"] = global_summary
        
        supabase.table("books").update(update_data).eq("id", book_id).execute()
        
        log_success(book_id, f"Processing completed: {total_chunks} chunks created, summary generated")
        print(f"Book {book_id} processed successfully: {total_chunks} chunks created, summary: {'yes' if global_summary else 'no'}")
        
    except Exception as e:
        # Update book status to error
        # Use admin client to bypass RLS
        import traceback
        error_message = str(e)
        error_traceback = traceback.format_exc()
        
        log_error(book_id, f"Processing failed: {error_message}")
        print(f"❌ ERROR processing book {book_id}: {error_message}")
        print(f"❌ Traceback:\n{error_traceback}")
        
        error_supabase = get_supabase_admin_client()
        error_supabase.table("books").update({
            "status": "error",
            "processing_error": f"{error_message}\n\nTraceback:\n{error_traceback[:5000]}"  # Limit error message size
        }).eq("id", book_id).execute()
        
        print(f"❌ Updated book status to 'error' with error message")
        # Don't re-raise - background tasks shouldn't crash the server

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

@router.post("/{book_id}/process")
async def trigger_processing(
    book_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Manually trigger processing for a book (for debugging/retry)
    """
    supabase = get_supabase_admin_client()
    
    # Check if user has access
    access_check = supabase.table("user_book_access").select("*").eq("user_id", current_user["id"]).eq("book_id", book_id).eq("is_visible", True).execute()
    
    if not access_check.data and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get book
    book_result = supabase.table("books").select("*").eq("id", book_id).execute()
    if not book_result.data:
        raise HTTPException(status_code=404, detail="Book not found")
    
    book = book_result.data[0]
    
    # Check if book has file path to download from storage
    file_path = book.get("file_path")
    if not file_path:
        raise HTTPException(status_code=400, detail="Book has no file stored. Please re-upload the book.")
    
    # Download file from storage and re-extract full text
    print(f"📥 Downloading file from storage: {file_path}")
    try:
        from app.services.storage_service import get_file_from_storage
        from app.services.pdf_extractor import extract_text_from_pdf, classify_pdf
        from app.services.epub_extractor import extract_text_from_epub
        
        file_content = get_file_from_storage(file_path, supabase)
        file_type = book.get("file_type", "pdf")
        
        # Re-extract full text from file
        print(f"📖 Re-extracting full text from {file_type} file...")
        if file_type == "pdf":
            pdf_class = classify_pdf(file_content)
            if pdf_class == "simple":
                extracted_text, is_native, pdf_metadata = extract_text_from_pdf(file_content)
            else:
                extracted_text, is_native, pdf_metadata = extract_text_from_pdf(file_content)
        elif file_type == "epub":
            extracted_text, epub_metadata = extract_text_from_epub(file_content)
            pdf_metadata = {
                "total_pages": epub_metadata.get("total_chapters", 0),
                "title": epub_metadata.get("title"),
                "author": epub_metadata.get("author")
            }
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_type}")
        
        if not extracted_text or len(extracted_text.strip()) == 0:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        
        print(f"✅ Re-extracted {len(extracted_text):,} characters")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Failed to download/extract file: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to download or extract file: {str(e)}")
    
    # Clean up existing chunks before retrying
    try:
        supabase.table("child_chunks").delete().eq("book_id", book_id).execute()
        supabase.table("parent_chunks").delete().eq("book_id", book_id).execute()
        print(f"🧹 Cleaned up existing chunks for retry")
    except Exception as e:
        print(f"⚠️ Could not clean up chunks: {str(e)}")
        # Continue anyway - might not have chunks yet
    
    # Update status to processing
    supabase.table("books").update({
        "status": "processing",
        "processing_error": None,
        "extracted_text": extracted_text[:10000]  # Update preview text with full extraction
    }).eq("id", book_id).execute()
    
    # Start processing with full extracted text
    print(f"🔄 Manually triggering processing for book {book_id} with full text")
    try:
        import asyncio
        try:
            loop = asyncio.get_running_loop()
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    process_book,
                    book_id=book_id,
                    extracted_text=extracted_text,  # Full extracted text
                    file_type=file_type,
                    title=book.get("title"),
                    author=book.get("author")
                )
                print(f"✅ Processing started in background thread")
        except RuntimeError:
            process_book(
                book_id=book_id,
                extracted_text=extracted_text,  # Full extracted text
                file_type=file_type,
                title=book.get("title"),
                author=book.get("author")
            )
            print(f"✅ Processing completed synchronously")
        
        return {"message": "Processing started - retrying with full text extraction", "book_id": book_id}
    except Exception as e:
        print(f"❌ Error starting processing: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to start processing: {str(e)}")

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

@router.get("/{book_id}/logs")
async def get_book_logs(
    book_id: str,
    current_user: dict = Depends(get_current_user),
    limit: int = 50
):
    """
    Get processing logs for a book (latest N logs)
    
    Query params:
    - limit: Number of logs to return (default: 50, max: 200)
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    # Check if user has access
    access_check = supabase.table("user_book_access").select("*").eq("user_id", user_id).eq("book_id", book_id).eq("is_visible", True).execute()
    
    if not access_check.data and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Limit max logs
    limit = min(limit, 200)
    
    # Get logs (most recent first)
    result = supabase.table("processing_logs").select(
        "id, log_message, log_level, created_at"
    ).eq("book_id", book_id).order("created_at", desc=True).limit(limit).execute()
    
    # Reverse to show oldest first (for UI)
    logs = list(reversed(result.data or []))
    
    return {"logs": logs, "count": len(logs)}
