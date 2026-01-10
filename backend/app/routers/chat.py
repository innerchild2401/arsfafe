"""
Chat endpoints for knowledge center
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_supabase_client, get_supabase_admin_client
from app.dependencies import get_current_user, check_usage_limits
from app.services.embedding_service import generate_embedding

router = APIRouter()

class ChatMessage(BaseModel):
    message: str
    book_id: Optional[str] = None  # None = chat across all books

class ChatResponse(BaseModel):
    response: str
    sources: List[str]
    tokens_used: Optional[int] = None

@router.post("", response_model=ChatResponse)
async def chat(
    chat_message: ChatMessage,
    current_user: dict = Depends(get_current_user)
):
    """
    Chat with user's books using RAG
    
    Features:
    - Semantic search across user's books
    - Context-aware responses
    - Source citations
    """
    # Check usage limits
    check_usage_limits(current_user, "chat")
    
    # Use admin client for writes to bypass RLS
    # For reads, we can use regular client (RLS ensures users only see their own data)
    supabase = get_supabase_admin_client()
    user_id = current_user["id"]
    
    # Get user's accessible books
    if chat_message.book_id:
        # Single book chat
        book_ids = [chat_message.book_id]
    else:
        # Multi-book chat (all user's books)
        access_result = supabase.table("user_book_access").select("book_id").eq("user_id", user_id).eq("is_visible", True).execute()
        book_ids = [access["book_id"] for access in access_result.data]
    
    if not book_ids:
        raise HTTPException(
            status_code=400,
            detail="No books available. Please upload a book first."
        )
    
    # Check if user is asking about the assistant's name
    user_message_lower = chat_message.message.lower()
    name_questions = ["what is your name", "who are you", "what's your name", "what are you called", "tell me your name"]
    is_name_question = any(question in user_message_lower for question in name_questions)
    
    # If asking about name, respond directly without searching books
    if is_name_question:
        assistant_message = "Hello! I'm Zorxido, your AI assistant for exploring your books. I'm here to help you understand and navigate through the content you've uploaded. How can I assist you today?"
        
        # Save messages
        supabase.table("chat_messages").insert({
            "user_id": user_id,
            "book_id": chat_message.book_id,
            "role": "user",
            "content": chat_message.message,
            "tokens_used": None,
            "model_used": None
        }).execute()
        
        supabase.table("chat_messages").insert({
            "user_id": user_id,
            "book_id": chat_message.book_id,
            "role": "assistant",
            "content": assistant_message,
            "retrieved_chunks": [],
            "sources": [],
            "tokens_used": None,
            "model_used": "direct_response"
        }).execute()
        
        return ChatResponse(
            response=assistant_message,
            sources=[],
            tokens_used=None
        )
    
    # Generate query embedding
    query_embedding = generate_embedding(chat_message.message)
    
    # Detect if this is a general/summarization query (lower threshold needed)
    user_message_lower = chat_message.message.lower()
    is_general_query = any(keyword in user_message_lower for keyword in [
        "summarize", "summarise", "summary", "overview", "what is this book about",
        "tell me about", "describe", "explain", "what does", "what is"
    ])
    
    # Adjust threshold based on query type
    match_threshold = 0.5 if is_general_query else 0.7  # Lower threshold for general queries
    match_count = 10 if is_general_query else 5  # More chunks for summarization
    
    # Search for relevant chunks using vector search
    chunks = []
    try:
        chunks_result = supabase.rpc(
            "match_child_chunks",
            {
                "query_embedding": query_embedding,
                "match_threshold": match_threshold,
                "match_count": match_count,
                "book_ids": book_ids
            }
        ).execute()
        
        chunks = chunks_result.data if chunks_result.data else []
        print(f"🔍 Vector search found {len(chunks)} chunks with threshold {match_threshold}")
        
        # If no chunks found with threshold, try with lower threshold as fallback
        if not chunks and match_threshold > 0.3:
            print(f"⚠️ No chunks found with threshold {match_threshold}, trying lower threshold 0.3...")
            chunks_result = supabase.rpc(
                "match_child_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": 0.3,  # Very low threshold - get any chunks
                    "match_count": match_count,
                    "book_ids": book_ids
                }
            ).execute()
            
            chunks = chunks_result.data if chunks_result.data else []
            print(f"🔍 Fallback search found {len(chunks)} chunks with threshold 0.3")
        
    except Exception as e:
        # Fallback: get chunks without vector search (any chunks from the book)
        print(f"❌ Vector search failed: {str(e)}")
        print(f"⚠️ Falling back to simple chunk retrieval...")
        chunks = []
        for book_id in book_ids:
            chunks_query = supabase.table("child_chunks").select(
                "id, text, parent_id, book_id, paragraph_index, page_number, parent_chunks(chapter_title, section_title), books(title)"
            ).eq("book_id", book_id).not_.is_("embedding", "null").limit(10).execute()
            
            if chunks_query.data:
                # Format chunks to match expected structure
                formatted_chunks = []
                for chunk in chunks_query.data:
                    parent = chunk.get("parent_chunks") or {}
                    book = chunk.get("books") or {}
                    formatted_chunks.append({
                        "id": chunk["id"],
                        "text": chunk["text"],
                        "parent_id": chunk["parent_id"],
                        "book_id": chunk["book_id"],
                        "paragraph_index": chunk.get("paragraph_index"),
                        "page_number": chunk.get("page_number"),
                        "chapter_title": parent.get("chapter_title", ""),
                        "section_title": parent.get("section_title", ""),
                        "book_title": book.get("title", "Unknown Book"),
                        "similarity": 0.5  # Default similarity for fallback
                    })
                chunks.extend(formatted_chunks)
        
        chunks = chunks[:match_count] if chunks else []
        print(f"🔍 Fallback retrieved {len(chunks)} chunks")
    
    if not chunks:
        # Last resort: get any chunks from the books (even without embeddings)
        print(f"⚠️ No chunks with embeddings found, trying to get any chunks...")
        for book_id in book_ids:
            chunks_query = supabase.table("child_chunks").select(
                "id, text, parent_id, book_id, paragraph_index, page_number, parent_chunks(chapter_title, section_title), books(title)"
            ).eq("book_id", book_id).limit(10).execute()
            
            if chunks_query.data:
                formatted_chunks = []
                for chunk in chunks_query.data:
                    parent = chunk.get("parent_chunks") or {}
                    book = chunk.get("books") or {}
                    formatted_chunks.append({
                        "id": chunk["id"],
                        "text": chunk["text"],
                        "parent_id": chunk["parent_id"],
                        "book_id": chunk["book_id"],
                        "paragraph_index": chunk.get("paragraph_index"),
                        "page_number": chunk.get("page_number"),
                        "chapter_title": parent.get("chapter_title", ""),
                        "section_title": parent.get("section_title", ""),
                        "book_title": book.get("title", "Unknown Book"),
                        "similarity": 0.5
                    })
                chunks.extend(formatted_chunks)
        
        chunks = chunks[:match_count] if chunks else []
        print(f"🔍 Last resort retrieved {len(chunks)} chunks")
    
    if not chunks:
        # If still no chunks, check if book exists and has chunks
        print(f"❌ No chunks found at all. Checking if books have chunks...")
        for book_id in book_ids:
            chunk_count = supabase.table("child_chunks").select("id", count="exact").eq("book_id", book_id).execute()
            print(f"   Book {book_id} has {chunk_count.count if hasattr(chunk_count, 'count') else len(chunk_count.data)} chunks")
            
            # Check if chunks have embeddings
            embedded_count = supabase.table("child_chunks").select("id", count="exact").eq("book_id", book_id).not_.is_("embedding", "null").execute()
            print(f"   Book {book_id} has {embedded_count.count if hasattr(embedded_count, 'count') else len(embedded_count.data)} chunks with embeddings")
        
        # If no chunks found, still try to answer general questions
        assistant_message = "I couldn't find any processed content in your uploaded books. The book may still be processing, or there may be an issue with the chunks. Please check the book status or try re-uploading the book."
        
        # Save messages
        supabase.table("chat_messages").insert({
            "user_id": user_id,
            "book_id": chat_message.book_id,
            "role": "user",
            "content": chat_message.message,
            "tokens_used": None,
            "model_used": None
        }).execute()
        
        supabase.table("chat_messages").insert({
            "user_id": user_id,
            "book_id": chat_message.book_id,
            "role": "assistant",
            "content": assistant_message,
            "retrieved_chunks": [],
            "sources": [],
            "tokens_used": None,
            "model_used": "no_context_response"
        }).execute()
        
        return ChatResponse(
            response=assistant_message,
            sources=[],
            tokens_used=None
        )
    
    # Build context from chunks
    context_parts = []
    sources = []
    source_set = set()  # Track unique sources for deduplication
    
    for idx, chunk in enumerate(chunks):
        # Handle both RPC result format and direct query format
        book_title = chunk.get("book_title") or chunk.get("books", {}).get("title") or "Unknown Book"
        chapter = chunk.get("chapter_title") or (chunk.get("parent_chunks") or {}).get("chapter_title") or ""
        section = chunk.get("section_title") or (chunk.get("parent_chunks") or {}).get("section_title") or ""
        
        # Build source string
        source_parts = [book_title]
        if chapter:
            source_parts.append(chapter)
        if section and section != chapter:
            source_parts.append(section)
        
        source = ", ".join(source_parts)
        source_key = f"{book_title}|{chapter}|{section}"
        
        # Add chunk to context with citation reference
        ref_num = idx + 1
        context_parts.append(f"[Ref: {ref_num}] {chunk['text']}")
        
        # Track source (deduplicated)
        if source_key not in source_set:
            sources.append(source)
            source_set.add(source_key)
    
    context = "\n\n".join(context_parts)
    
    # Build source list for response (indexed for citations)
    sources_list = list(set(sources))  # Final deduplication
    
    # Generate response with GPT
    from openai import OpenAI
    from app.config import settings
    
    client = OpenAI(api_key=settings.openai_api_key)
    
    # System prompt with name
    system_prompt = """You are Zorxido, a helpful AI assistant that answers questions based on the provided context from books. 
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are designed to help users understand and explore their uploaded books.
- Always cite your sources using [Ref: N] format where N is the reference number from the context.
- Use the context provided to answer questions. If the user asks to "summarise" or "summarize" a book, provide a comprehensive summary based on all the context provided.
- If the context doesn't contain enough information to fully answer a question, answer based on what is available and mention that your answer is based on the provided context.
- Stay focused on the content from the user's books. If asked about topics not in the books, politely redirect to what you can help with based on their uploaded content.
- For general questions like "summarise this book", use all the provided context to create a comprehensive summary."""
    
    response = client.chat.completions.create(
        model=settings.chat_model,
        messages=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": f"Context from books:\n\n{context}\n\nQuestion: {chat_message.message}"
            }
        ],
        temperature=0.7
    )
    
    assistant_message = response.choices[0].message.content
    tokens_used = response.usage.total_tokens if response.usage else None
    
    # Save chat messages
    retrieved_chunk_ids = [chunk["id"] for chunk in chunks]
    
    # Save user message
    supabase.table("chat_messages").insert({
        "user_id": user_id,
        "book_id": chat_message.book_id,
        "role": "user",
        "content": chat_message.message,
        "tokens_used": None,
        "model_used": None
    }).execute()
    
    # Save assistant message
    supabase.table("chat_messages").insert({
        "user_id": user_id,
        "book_id": chat_message.book_id,
        "role": "assistant",
        "content": assistant_message,
        "retrieved_chunks": retrieved_chunk_ids,
        "sources": sources,
        "tokens_used": tokens_used,
        "model_used": settings.chat_model
    }).execute()
    
    # Update usage tracking
    supabase.table("user_profiles").update({
        "chat_messages_this_month": current_user.get("chat_messages_this_month", 0) + 1
    }).eq("id", user_id).execute()
    
    return ChatResponse(
        response=assistant_message,
        sources=sources_list,  # Use deduplicated sources list
        tokens_used=tokens_used
    )

@router.get("/history")
async def get_chat_history(
    book_id: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get chat history"""
    # Use admin client to bypass RLS (backend operation)
    supabase = get_supabase_admin_client()
    user_id = current_user["id"]
    
    query = supabase.table("chat_messages").select("*").eq("user_id", user_id)
    
    if book_id:
        query = query.eq("book_id", book_id)
    
    result = query.order("created_at", desc=True).limit(limit).execute()
    
    return {"messages": result.data}
