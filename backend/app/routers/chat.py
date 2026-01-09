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
    
    # Search for relevant chunks using vector search
    try:
        chunks_result = supabase.rpc(
            "match_child_chunks",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.7,
                "match_count": 5,
                "book_ids": book_ids
            }
        ).execute()
        
        chunks = chunks_result.data if chunks_result.data else []
        
    except Exception as e:
        # Fallback: simple text search if vector search fails
        print(f"Vector search failed, using fallback: {str(e)}")
        chunks = []
        for book_id in book_ids:
            chunks_query = supabase.table("child_chunks").select(
                "id, text, parent_id, parent_chunks(chapter_title, section_title), books(title)"
            ).eq("book_id", book_id).limit(5).execute()
            
            if chunks_query.data:
                chunks.extend(chunks_query.data)
        
        chunks = chunks[:5]
    
    if not chunks:
        # If no chunks found, still try to answer general questions
        assistant_message = "I couldn't find relevant information in your uploaded books to answer that question. Could you try rephrasing it, or ask about a specific topic that might be covered in your books?"
        
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
    
    for chunk in chunks:
        # Handle both RPC result format and direct query format
        book_title = chunk.get("book_title") or chunk.get("books", {}).get("title", "Unknown Book")
        chapter = chunk.get("chapter_title") or chunk.get("parent_chunks", {}).get("chapter_title", "")
        section = chunk.get("section_title") or chunk.get("parent_chunks", {}).get("section_title", "")
        
        source = f"{book_title}"
        if chapter:
            source += f", {chapter}"
        if section:
            source += f", {section}"
        
        context_parts.append(f"[{source}]: {chunk['text']}")
        sources.append(source)
    
    context = "\n\n".join(context_parts)
    
    # Generate response with GPT
    from openai import OpenAI
    from app.config import settings
    
    client = OpenAI(api_key=settings.openai_api_key)
    
    # System prompt with name
    system_prompt = """You are Zorxido, a helpful AI assistant that answers questions based on the provided context from books. 
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are designed to help users understand and explore their uploaded books.
- Always cite your sources from the provided context.
- If the context doesn't contain enough information to answer a question, politely say so and explain that you can only answer based on the books the user has uploaded.
- Stay focused on the content from the user's books. If asked about topics not in the books, politely redirect to what you can help with based on their uploaded content."""
    
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
        sources=list(set(sources)),  # Remove duplicates
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
