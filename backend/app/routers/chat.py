"""
Chat endpoints for knowledge center
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from openai import OpenAI

from app.database import get_supabase_client, get_supabase_admin_client
from app.dependencies import get_current_user, check_usage_limits
from app.services.embedding_service import generate_embedding
from app.config import settings

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
    
    # TWO-PATH BRAIN STRATEGY
    # Path A (Specific Query): Vector Search for detailed questions
    # Path B (Global Query): Pre-computed summaries for general questions
    
    user_message_lower = chat_message.message.lower()
    
    # Detect global intent (summarize, overview, "what is this book about")
    global_intent_keywords = [
        "summarize", "summarise", "summary", "overview", "what is this book about",
        "what is the book about", "tell me about this book", "describe this book",
        "what does this book cover", "what is the book about", "book summary"
    ]
    
    is_global_query = any(keyword in user_message_lower for keyword in global_intent_keywords)
    
    # PATH B: Global Query - Use pre-computed summaries
    if is_global_query and chat_message.book_id and len(book_ids) == 1:
        print(f"🧠 PATH B (Global Query): Using pre-computed summary for book {chat_message.book_id}")
        
        # Get book with global_summary
        book_result = supabase.table("books").select("id, title, author, global_summary").eq("id", chat_message.book_id).execute()
        
        if not book_result.data:
            raise HTTPException(status_code=404, detail="Book not found")
        
        book = book_result.data[0]
        global_summary = book.get("global_summary")
        
        # If global_summary exists, use it
        if global_summary and global_summary.strip():
            print(f"✅ Found pre-computed global_summary ({len(global_summary)} chars)")
            
            # Use the pre-computed summary directly
            client = OpenAI(api_key=settings.openai_api_key)
            
            system_prompt = f"""You are Zorxido, a helpful AI assistant. The user asked for a high-level summary.
DO NOT search for specific details.
I have provided you with a Pre-Computed Executive Summary of the document below.
Use this summary to answer the user's request in a structured format.

Document Title: {book.get('title', 'Unknown')}
Author: {book.get('author', 'Unknown')}

Executive Summary:
{global_summary}

Instruction: Present this summary in a clear, structured format. If the user asked to "summarize" or asked "what is this book about", provide a comprehensive overview covering: Introduction (overview of the book's purpose), Key Themes (main arguments and concepts), and Conclusion (overall message and takeaways)."""
            
            response = client.chat.completions.create(
                model=settings.chat_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": chat_message.message}
                ],
                temperature=0.4
            )
            
            assistant_message = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else None
            
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
                "sources": [f"{book.get('title', 'Unknown')} (Executive Summary)"],
                "tokens_used": tokens_used,
                "model_used": "global_summary_path"
            }).execute()
            
            return ChatResponse(
                response=assistant_message,
                sources=[f"{book.get('title', 'Unknown')} (Executive Summary)"],
                tokens_used=tokens_used
            )
        
        # Fallback: Table of Contents Hack (for existing books without global_summary)
        else:
            print(f"⚠️ No global_summary found, using Table of Contents Hack...")
            
            # Get all chapter titles and topic labels for this book
            parent_chunks_result = supabase.table("parent_chunks").select(
                "chapter_title, section_title, topic_labels"
            ).eq("book_id", chat_message.book_id).execute()
            
            chapters_info = []
            all_topics = set()
            
            for pc in parent_chunks_result.data or []:
                chapter_title = pc.get("chapter_title") or "Untitled Chapter"
                section_title = pc.get("section_title") or ""
                topics = pc.get("topic_labels") or []
                
                chapters_info.append({
                    "chapter": chapter_title,
                    "section": section_title,
                    "topics": topics
                })
                
                if topics:
                    all_topics.update(topics)
            
            if chapters_info:
                # Build ToC prompt
                toc_text = "\n".join([
                    f"- {info['chapter']}" + (f" / {info['section']}" if info['section'] else "")
                    + (f" (Topics: {', '.join(info['topics'][:3])})" if info['topics'] else "")
                    for info in chapters_info[:30]  # Limit to first 30
                ])
                
                topics_list = ", ".join(list(all_topics)[:50])  # Limit to 50 topics
                
                client = OpenAI(api_key=settings.openai_api_key)
                
                system_prompt = f"""You are Zorxido. The user asked for a summary of this book.
I don't have the full text pre-processed, but here is the Table of Contents and the list of topics covered in every section.
Based on this, infer and present a summary of what this book covers.

Book Title: {book.get('title', 'Unknown')}
Author: {book.get('author', 'Unknown')}

Table of Contents:
{toc_text}

Topics Covered: {topics_list}

Instruction: Based on the table of contents and topics, provide a structured summary covering:
1. Introduction: What this book is about (inferred from title and chapters)
2. Key Themes: Main topics and concepts covered (from the topics list)
3. Conclusion: Overall message and scope of the book (inferred from chapter structure)

Present this in a clear, informative format."""
                
                response = client.chat.completions.create(
                    model=settings.chat_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": chat_message.message}
                    ],
                    temperature=0.4
                )
                
                assistant_message = response.choices[0].message.content
                tokens_used = response.usage.total_tokens if response.usage else None
                
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
                    "sources": [f"{book.get('title', 'Unknown')} (Table of Contents)"],
                    "tokens_used": tokens_used,
                    "model_used": "toc_hack_path"
                }).execute()
                
                return ChatResponse(
                    response=assistant_message,
                    sources=[f"{book.get('title', 'Unknown')} (Table of Contents)"],
                    tokens_used=tokens_used
                )
            else:
                # No chunks at all - fall through to specific query path
                print(f"⚠️ No chunks found for ToC hack, falling back to specific query path...")
                is_global_query = False  # Fall back to Path A
    
    # PATH A: Specific Query - Use Vector Search
    # (Only runs if Path B didn't return or it's not a global query)
    if not is_global_query or not chat_message.book_id or len(book_ids) > 1:
        print(f"🧠 PATH A (Specific Query): Using vector search")
        
        # Generate query embedding
        query_embedding = generate_embedding(chat_message.message)
        
        # Adjust threshold based on query type
        match_threshold = 0.5 if is_global_query else 0.7
        match_count = 10 if is_global_query else 5
        
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
