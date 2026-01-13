"""
Chat endpoints for knowledge center
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Tuple
from datetime import datetime
from openai import OpenAI
import json
import asyncio

from app.database import get_supabase_client, get_supabase_admin_client
from app.dependencies import get_current_user, check_usage_limits
from app.services.embedding_service import generate_embedding
from app.services.corrections_service import get_relevant_corrections, build_corrections_context
from app.services.chunk_utils import generate_chunk_id, get_parent_context_for_chunks
from app.config import settings

router = APIRouter()

def get_conversation_history(supabase, user_id: str, book_id: Optional[str], limit: int = 6) -> List[dict]:
    """
    Get last N messages from conversation history (last 3 turn pairs = 6 messages)
    Returns messages ordered by created_at DESC (most recent first)
    """
    query = supabase.table("chat_messages").select("*").eq("user_id", user_id)
    
    if book_id:
        query = query.eq("book_id", book_id)
    
    result = query.order("created_at", desc=True).limit(limit).execute()
    messages = result.data if result.data else []
    
    # Reverse to get chronological order (oldest first)
    messages.reverse()
    return messages

def build_conversation_context(messages: List[dict]) -> str:
    """
    Build conversation context string from message pairs
    Format: User: ... / Assistant: ...
    """
    if not messages:
        return ""
    
    context_parts = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            context_parts.append(f"User: {content}")
        elif role == "assistant":
            context_parts.append(f"Assistant: {content}")
    
    return "\n\n".join(context_parts)

async def rewrite_query_with_context(user_message: str, conversation_history: List[dict], client: OpenAI) -> str:
    """
    Rewrite user query to de-reference pronouns and contextual references
    Uses gpt-4o-mini for fast, cheap query rewriting
    
    Example:
    Input: "What happens if we miss that date?" + History
    Output: "Consequences of missing the $5M bond maturity date in October."
    """
    if not conversation_history:
        return user_message  # No history, no rewrite needed
    
    history_text = build_conversation_context(conversation_history)
    
    rewrite_prompt = f"""You are a query rewriting assistant. Your job is to rewrite user questions by resolving pronouns and contextual references based on conversation history.

Conversation History:
{history_text}

Current User Question: {user_message}

Rewrite the question by:
1. Replacing pronouns (this, that, it, them) with specific entities mentioned in history
2. Expanding abbreviations to full terms
3. Clarifying ambiguous references
4. Making the question self-contained and searchable

Return ONLY the rewritten question, nothing else. Do not add explanations or metadata."""

    try:
        response = client.chat.completions.create(
            model=settings.chat_model,  # Use gpt-4o-mini for speed
            messages=[
                {"role": "system", "content": "You are a query rewriting assistant. Rewrite questions to be self-contained and searchable."},
                {"role": "user", "content": rewrite_prompt}
            ],
            temperature=0.3,  # Low temperature for consistent rewriting
            max_tokens=200
        )
        
        rewritten = response.choices[0].message.content.strip()
        # Only use rewritten if it's meaningfully different and longer (indicates expansion)
        if len(rewritten) > len(user_message) * 0.8:  # At least 80% of original length
            print(f"🔄 Query rewrite: '{user_message}' -> '{rewritten}'")
            return rewritten
        else:
            print(f"⚠️ Query rewrite too short, using original: '{rewritten}' -> '{user_message}'")
            return user_message
    except Exception as e:
        print(f"⚠️ Query rewrite failed, using original: {str(e)}")
        return user_message

class ChatMessage(BaseModel):
    message: str
    book_id: Optional[str] = None  # Deprecated: use book_ids instead
    book_ids: Optional[List[str]] = None  # Array of book IDs, None = chat across all books

class ChatResponse(BaseModel):
    response: str
    sources: List[str]
    retrieved_chunks: Optional[List[str]] = None  # List of chunk UUIDs for citation mapping
    chunk_map: Optional[dict] = None  # Map of persistent IDs (#chk_xxx) to chunk UUIDs
    tokens_used: Optional[int] = None
    artifact: Optional[dict] = None  # Structured artifact for Path D (checklist/notebook/script)

class CorrectionRequest(BaseModel):
    original_message: str
    original_response: str
    original_chunks: List[str]  # List of chunk UUIDs
    incorrect_text: str
    correct_text: str
    user_feedback: Optional[str] = None
    book_id: Optional[str] = None
    chunk_id: Optional[str] = None

class ArtifactRefinementRequest(BaseModel):
    message_id: str  # ID of the message containing the artifact
    refinement_type: str  # 'variable' or 'step'
    variable_key: Optional[str] = None  # For variable refinement
    variable_value: Optional[str] = None  # For variable refinement
    step_id: Optional[str] = None  # For step refinement
    refinement_instruction: Optional[str] = None  # For step refinement

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
    if chat_message.book_ids and len(chat_message.book_ids) > 0:
        # Multi-select: use specified book IDs
        book_ids = chat_message.book_ids
    elif chat_message.book_id:
        # Legacy: single book_id (for backward compatibility)
        book_ids = [chat_message.book_id]
    else:
        # No selection: chat across all user's books
        access_result = supabase.table("user_book_access").select("book_id").eq("user_id", user_id).eq("is_visible", True).execute()
        book_ids = [access["book_id"] for access in access_result.data]
    
    if not book_ids:
        raise HTTPException(
            status_code=400,
            detail="No books available. Please upload a book first."
        )
    
    # For database storage: use first book_id if single selection, null if multi
    message_book_id = book_ids[0] if len(book_ids) == 1 else None
    
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
            "chunk_map": {},  # No chunks for direct response
            "tokens_used": None,
            "model_used": "direct_response"
        }).execute()
        
        return ChatResponse(
            response=assistant_message,
            sources=[],
            retrieved_chunks=[],
            tokens_used=None
        )
    
    # FOUR-PATH BRAIN STRATEGY
    # Path A (Specific Query): Hybrid Search (Vector + Keyword) for detailed questions
    # Path B (Global Query): Pre-computed summaries for general questions
    # Path C (Deep Reasoner): Reasoning model for complex analysis
    # Path D (Action Planner): Structured artifacts (schedules, scripts, notebooks) for implementation
    
    # CONVERSATION MEMORY: Fetch last 3 turn pairs (6 messages) for context
    conversation_history = get_conversation_history(supabase, user_id, message_book_id, limit=6)
    conversation_context = build_conversation_context(conversation_history)
    
    # QUERY REWRITE: De-reference pronouns and contextual references before search
    client = OpenAI(api_key=settings.openai_api_key)
    search_query = await rewrite_query_with_context(chat_message.message, conversation_history, client)
    
    user_message_lower = chat_message.message.lower()
    
    # Detect deep reasoning intent (Analyze, Compare, Why, Connect)
    reasoning_intent_keywords = [
        "analyze", "analyse", "analysis", "compare", "comparison", "contrast",
        "why", "how does", "how is", "how are", "what causes", "what leads to",
        "connect", "connection", "relationship", "relate", "correlate",
        "explain why", "what is the relationship", "what is the connection",
        "difference between", "similarities between", "distinguish"
    ]
    
    is_reasoning_query = any(keyword in user_message_lower for keyword in reasoning_intent_keywords)
    
    # Detect action planner intent (Path D: Plan, Schedule, How to, Solve, Simulate, Script)
    action_planner_keywords = [
        "plan", "schedule", "how to", "how do", "solve", "simulate", "simulation",
        "script", "routine", "checklist", "steps", "step-by-step", "guide me",
        "create a", "make a", "build a", "design a", "implement", "methodology",
        "framework", "process", "procedure", "workflow"
    ]
    
    # Check if there's an existing artifact in conversation history (follow-up detection)
    has_existing_artifact = any(
        msg.get("artifact") for msg in conversation_history 
        if msg.get("role") == "assistant" and msg.get("artifact")
    )
    
    # Follow-up question keywords (questions about existing artifacts, not new artifact requests)
    follow_up_keywords = [
        "help with", "how do i", "what about", "what is", "explain", "tell me about",
        "day", "step", "percentage", "determine", "calculate", "figure out",
        "i need help", "i don't understand", "can you explain", "what does",
        "how does", "how is", "how are", "when should", "where do"
    ]
    
    is_follow_up_about_artifact = (
        has_existing_artifact and 
        any(keyword in user_message_lower for keyword in follow_up_keywords)
    )
    
    # Suppress Path D for follow-up questions about existing artifacts
    is_action_planner_query = (
        any(keyword in user_message_lower for keyword in action_planner_keywords) and 
        not is_reasoning_query and 
        not is_follow_up_about_artifact  # Don't trigger Path D for follow-ups
    )
    
    # Detect global intent (summarize, overview, "what is this book about")
    global_intent_keywords = [
        "summarize", "summarise", "summary", "overview", "what is this book about",
        "what is the book about", "tell me about this book", "describe this book",
        "what does this book cover", "what is the book about", "book summary"
    ]
    
    is_global_query = any(keyword in user_message_lower for keyword in global_intent_keywords) and not is_reasoning_query and not is_action_planner_query
    
    # PATH B: Global Query - Use pre-computed summaries (only works for single book)
    if is_global_query and len(book_ids) == 1:
        print(f"🧠 PATH B (Global Query): Using pre-computed summary for book {book_ids[0]}")
        
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
            
            # Inject conversation history for context (if available)
            history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
            
            system_prompt = f"""You are Zorxido, a helpful AI assistant. The user asked for a high-level summary.
DO NOT search for specific details.
I have provided you with a Pre-Computed Executive Summary of the document below.
Use this summary to answer the user's request in a structured format.

{history_prefix}Document Title: {book.get('title', 'Unknown')}
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
                "chunk_map": {},  # No chunks for summary path
                "tokens_used": tokens_used,
                "model_used": "global_summary_path"
            }).execute()
            
            return ChatResponse(
                response=assistant_message,
                sources=[f"{book.get('title', 'Unknown')} (Executive Summary)"],
                retrieved_chunks=[],
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
                
                # Inject conversation history for context
                history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
                
                system_prompt = f"""You are Zorxido. The user asked for a summary of this book.
I don't have the full text pre-processed, but here is the Table of Contents and the list of topics covered in every section.
Based on this, infer and present a summary of what this book covers.

{history_prefix}Book Title: {book.get('title', 'Unknown')}
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
                    "chunk_map": {},  # No chunks for ToC path
                    "tokens_used": tokens_used,
                    "model_used": "toc_hack_path"
                }).execute()
                
                return ChatResponse(
                    response=assistant_message,
                    sources=[f"{book.get('title', 'Unknown')} (Table of Contents)"],
                    retrieved_chunks=[],
                    tokens_used=tokens_used
                )
            else:
                # No chunks at all - fall through to specific query path
                print(f"⚠️ No chunks found for ToC hack, falling back to specific query path...")
                is_global_query = False  # Fall back to Path A or Path C
    
    # PATH D: Action Planner - Generate Structured Artifacts (Schedules, Scripts, Notebooks)
    if is_action_planner_query:
        print(f"🧠 PATH D (Action Planner): Generating structured artifact for implementation")
        
        # Enhance search query with methodology-specific terms to prioritize prescriptive content
        # Add terms that indicate instructions, steps, procedures (not just descriptions)
        methodology_terms = ["steps", "procedure", "method", "process", "instructions", "how to", "guide", "framework", "routine", "schedule"]
        enhanced_query = f"{search_query} {' '.join(methodology_terms)}"
        
        # Search for methodology/framework/script chunks (Phase 2: Use action metadata prioritization)
        # Use enhanced query for embedding, but original query for keyword search (to avoid dilution)
        query_embedding = generate_embedding(enhanced_query)
        match_threshold = 0.6
        match_count = 10  # Get more chunks for methodology extraction
        
        chunks = []
        try:
            # Try action metadata search first (prioritizes chunks with framework/script/derivation tags)
            try:
                chunks_result = supabase.rpc(
                    "match_child_chunks_with_action_metadata",
                    {
                        "query_embedding": query_embedding,
                        "query_text": search_query,
                        "match_threshold": match_threshold,
                        "match_count": match_count,
                        "book_ids": book_ids,
                        "keyword_weight": 0.5,
                        "vector_weight": 0.5,
                        "action_metadata_tags": None  # NULL = prioritize any action_metadata, not just specific tags
                    }
                ).execute()
                chunks = chunks_result.data if chunks_result.data else []
                print(f"🔍 Path D: Action metadata search found {len(chunks)} chunks (prioritized by methodology tags)")
            except Exception as action_metadata_error:
                print(f"⚠️ Path D: Action metadata search not available, falling back to hybrid search: {str(action_metadata_error)}")
                # Fallback to hybrid search
                try:
                    chunks_result = supabase.rpc(
                        "match_child_chunks_hybrid",
                        {
                            "query_embedding": query_embedding,
                            "query_text": search_query,
                            "match_threshold": match_threshold,
                            "match_count": match_count,
                            "book_ids": book_ids,
                            "keyword_weight": 0.5,
                            "vector_weight": 0.5
                        }
                    ).execute()
                    chunks = chunks_result.data if chunks_result.data else []
                    print(f"🔍 Path D: Hybrid search found {len(chunks)} chunks")
                except Exception as hybrid_error:
                    print(f"⚠️ Path D: Hybrid search not available, using vector search: {str(hybrid_error)}")
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
                    print(f"🔍 Path D: Vector search found {len(chunks)} chunks")
        except Exception as e:
            print(f"❌ Path D: Search failed: {str(e)}")
            chunks = []
        
        if chunks:
            # Enhance chunks with parent context
            chunks = get_parent_context_for_chunks(supabase, chunks)
            
            # Build context with citations
            context_parts = []
            chunk_map_reverse = {}
            retrieved_chunk_ids = []
            
            for i, chunk in enumerate(chunks[:10]):  # Limit to top 10
                chunk_id = chunk.get("id")
                chunk_text = chunk.get("text", "")
                persistent_id = generate_chunk_id(chunk_id)
                chunk_map_reverse[persistent_id] = chunk_id
                retrieved_chunk_ids.append(chunk_id)
                
                parent = chunk.get("parent_context")
                if parent:
                    chapter_title = parent.get("chapter_title") or "Unknown Chapter"
                    section_title = parent.get("section_title") or ""
                    context_parts.append(f"[{persistent_id}] {chapter_title}" + (f" / {section_title}" if section_title else ""))
                    context_parts.append(chunk_text)
                else:
                    context_parts.append(f"[{persistent_id}] {chunk_text}")
            
            context_text = "\n\n".join(context_parts)
            
            # Get relevant corrections
            corrections = get_relevant_corrections(user_id, chat_message.message, chat_message.book_id, limit=3)
            corrections_context = build_corrections_context(corrections) if corrections else ""
            
            # Build artifact generation prompt
            client = OpenAI(api_key=settings.openai_api_key)
            
            history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
            
            artifact_prompt = f"""You are an Implementation Architect. Your job is to extract methodologies, frameworks, scripts, or step-by-step procedures from the provided book content and generate a structured, actionable artifact.

CRITICAL OUTPUT REQUIREMENT: You MUST return ONLY valid JSON. No markdown formatting, no code blocks (```json or ```), no explanations, no text outside the JSON object. The response must be directly parseable as JSON by json.loads().

{history_prefix}User Request: {chat_message.message}

Relevant Content from Book:
{context_text}

{corrections_context}

FOCUS ON PRESCRIPTIVE CONTENT (Not Descriptive):
Prioritize chunks that contain ACTIONABLE instructions:
- Step-by-step procedures (numbered lists, "Step 1... Step 2...", "First... Then... Finally...")
- Conditional logic ("if X, then Y", "when A occurs, do B", "in case of C, follow D")
- Action verbs and imperatives ("do", "perform", "execute", "follow", "apply", "implement")
- Methodologies, frameworks, or systematic procedures
- NOT just descriptions, explanations, or background information (those are descriptive, not prescriptive)

Your task:
1. Identify the methodology, framework, script, or procedure described in the content
2. Extract the step-by-step instructions, schedules, or computational steps (focus on PRESCRIPTIVE content)
3. Determine the artifact type:
   - "checklist": For routines, schedules, step-by-step guides (e.g., sleep training, workout routines)
   - "notebook": For mathematical derivations, simulations, computational problems (e.g., physics problems, engineering calculations)
   - "script": For conversational scripts, dialogue templates, or interaction patterns

4. Generate a JSON artifact with this EXACT structure (return ONLY the JSON object, no markdown, no code fences):
{{
  "artifact_type": "checklist" | "notebook" | "script",
  "title": "Short descriptive title",
  "content": {{
    "steps": [{{"id": "step_1", "time": "7:00 PM", "action": "Bedtime routine", "description": "Detailed instruction", "checked": false}}] OR
    "cells": [{{"type": "markdown", "content": "Theory explanation"}}, {{"type": "code", "language": "python", "content": "code here"}}, {{"type": "output", "content": "result"}}] OR
    "scenes": [{{"id": "scene_1", "context": "Setting", "speaker": "Parent", "text": "What to say", "action": "What to do"}}]
  }},
  "citations": ["#chk_xxxx", "#chk_yyyy"],
  "variables": {{"age": "2 years", "duration": "5 minutes"}}
}}

CRITICAL REMINDERS:
- Return ONLY the JSON object, nothing else. No markdown, no code blocks, no explanations.
- Use the persistent chunk IDs (#chk_xxxx) from the content for citations
- Make the artifact actionable and specific to the user's request
- For checklists: Include times, durations, or sequences
- For notebooks: Include mathematical notation, code, or computational steps
- For scripts: Include dialogue and actions
- Focus on PRESCRIPTIVE content (instructions, steps, procedures) not DESCRIPTIVE content (explanations, background)"""

            # Use reasoning model (GPT-4o) for artifact generation
            # CRITICAL: response_format={"type": "json_object"} forces JSON output (no markdown)
            response = client.chat.completions.create(
                model=settings.reasoning_model,  # Use GPT-4o for structured generation
                messages=[
                    {"role": "system", "content": "You are an Implementation Architect. Generate structured JSON artifacts from book content. You MUST return ONLY valid JSON, no markdown, no code blocks, no explanations."},
                    {"role": "user", "content": artifact_prompt}
                ],
                temperature=0.3,  # Lower temperature for more structured output
                response_format={"type": "json_object"}  # CRITICAL: Forces JSON output, prevents markdown
            )
            
            artifact_json_str = response.choices[0].message.content.strip()
            tokens_used = response.usage.total_tokens if response.usage else None
            
            # Remove any markdown code fences if they somehow appear (defensive)
            if artifact_json_str.startswith("```"):
                # Remove ```json or ``` markers
                lines = artifact_json_str.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].strip() == "```":
                    lines = lines[:-1]
                artifact_json_str = "\n".join(lines).strip()
            
            # Parse and validate JSON
            try:
                artifact_data = json.loads(artifact_json_str)
                
                # Validate artifact structure
                if not isinstance(artifact_data, dict):
                    raise ValueError("Artifact must be a JSON object")
                if "artifact_type" not in artifact_data:
                    raise ValueError("Artifact must have 'artifact_type' field")
                if "content" not in artifact_data:
                    raise ValueError("Artifact must have 'content' field")
                    
            except (json.JSONDecodeError, ValueError) as e:
                print(f"❌ Path D: Failed to parse/validate artifact JSON: {str(e)}")
                print(f"   Raw response: {artifact_json_str[:200]}...")
                # Fall back to Path A
                is_action_planner_query = False
            else:
                # Build sources list
                sources_list = list(set([f"#{chunk_id}" for chunk_id in chunk_map_reverse.keys()]))
                
                # Save messages with artifact
                supabase.table("chat_messages").insert({
                    "user_id": user_id,
                    "book_id": chat_message.book_id,
                    "role": "user",
                    "content": chat_message.message,
                    "tokens_used": None,
                    "model_used": None
                }).execute()
                
                # Store artifact in message metadata (we'll add an artifact column or use JSONB)
                assistant_message = f"I've created a {artifact_data.get('artifact_type', 'plan')} for you. View it in the Composer pane."
                
                supabase.table("chat_messages").insert({
                    "user_id": user_id,
                    "book_id": chat_message.book_id,
                    "role": "assistant",
                    "content": assistant_message,
                    "retrieved_chunks": retrieved_chunk_ids,
                    "sources": sources_list,
                    "chunk_map": chunk_map_reverse,
                    "tokens_used": tokens_used,
                    "model_used": "action_planner_path",
                    "artifact": artifact_data  # Store artifact JSONB
                }).execute()
                
                # Return response with artifact
                return ChatResponse(
                    response=assistant_message,
                    sources=sources_list,
                    retrieved_chunks=retrieved_chunk_ids,
                    tokens_used=tokens_used,
                    artifact=artifact_data  # Add artifact to response
                )
        else:
            print(f"⚠️ Path D: No chunks found, falling back to Path A...")
            is_action_planner_query = False
    
    # PATH C: Deep Reasoner - Use Reasoning Model for Complex Analysis
    # (Triggers before Path A for Analyze/Compare/Why/Connect queries)
    # MAP-REDUCE: For multi-book queries with reasoning intent, use parallel searches per book
    if is_reasoning_query:
        print(f"🧠 PATH C (Deep Reasoner): Using reasoning model for complex analysis")
        
        # Check for relevant corrections first
        corrections = get_relevant_corrections(user_id, chat_message.message, chat_message.book_id, limit=3)
        corrections_context = build_corrections_context(corrections) if corrections else ""
        
        # MAP-REDUCE: If multi-book and reasoning intent (Compare/Analyze), use map-reduce
        book_chunks_map = None  # Will be set if multi-book compare query
        if not chat_message.book_id and len(book_ids) > 1:
            # Detect compare/analyze intent for multi-book synthesis
            compare_keywords = ["compare", "comparison", "contrast", "difference between", "similarities between"]
            is_compare_query = any(keyword in user_message_lower for keyword in compare_keywords)
            
            if is_compare_query:
                print(f"🔄 MAP-REDUCE: Multi-book compare query detected, using sequential searches per book...")
                
                # MAP: Sequential searches per book (Supabase is sync, can't use async.gather)
                book_chunks_map = {}
                query_embedding = generate_embedding(search_query)
                
                for book_id in book_ids:
                    try:
                        chunks_result = supabase.rpc(
                            "match_child_chunks_hybrid",
                            {
                                "query_embedding": query_embedding,
                                "query_text": search_query,
                                "match_threshold": 0.6,
                                "match_count": 5,  # Top 5 per book
                                "book_ids": [book_id],
                                "keyword_weight": 0.5,
                                "vector_weight": 0.5
                            }
                        ).execute()
                        if chunks_result.data:
                            book_chunks_map[book_id] = chunks_result.data
                            print(f"🔍 Book {book_id[:8]}: Found {len(chunks_result.data)} chunks")
                    except Exception as e:
                        print(f"⚠️ Hybrid search failed for book {book_id}, trying vector search: {str(e)}")
                        try:
                            # Fallback to vector search
                            chunks_result = supabase.rpc(
                                "match_child_chunks",
                                {
                                    "query_embedding": query_embedding,
                                    "match_threshold": 0.6,
                                    "match_count": 5,
                                    "book_ids": [book_id]
                                }
                            ).execute()
                            if chunks_result.data:
                                book_chunks_map[book_id] = chunks_result.data
                        except Exception as e2:
                            print(f"⚠️ Vector search also failed for book {book_id}: {str(e2)}")
                
                # REDUCE: Combine all book chunks for synthesis
                chunks = []
                for book_id, book_chunks in book_chunks_map.items():
                    chunks.extend(book_chunks)
                
                print(f"🔄 MAP-REDUCE: Retrieved {len(chunks)} chunks from {len(book_chunks_map)} books")
            else:
                # Multi-book but not compare - use regular multi-book search
                query_embedding = generate_embedding(search_query)
                match_threshold = 0.6
                match_count = 15
                
                try:
                    chunks_result = supabase.rpc(
                        "match_child_chunks_hybrid",
                        {
                            "query_embedding": query_embedding,
                            "query_text": search_query,
                            "match_threshold": match_threshold,
                            "match_count": match_count,
                            "book_ids": book_ids,
                            "keyword_weight": 0.5,
                            "vector_weight": 0.5
                        }
                    ).execute()
                    chunks = chunks_result.data if chunks_result.data else []
                except Exception as hybrid_error:
                    print(f"⚠️ Path C: Hybrid search not available, using vector search: {str(hybrid_error)}")
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
        else:
            # Single book: regular search
            # Use rewritten query for search (de-referenced pronouns)
            # Generate query embedding for hybrid search using rewritten query
            query_embedding = generate_embedding(search_query)  # Use rewritten query, not raw message
            
            # Use higher threshold and more chunks for reasoning queries (need broader context)
            match_threshold = 0.6
            match_count = 15  # More chunks for deep analysis
            
            # Search for relevant chunks using hybrid search
            chunks = []
            try:
                try:
                    chunks_result = supabase.rpc(
                        "match_child_chunks_hybrid",
                        {
                            "query_embedding": query_embedding,
                            "query_text": search_query,  # Use rewritten query for keyword search
                            "match_threshold": match_threshold,
                            "match_count": match_count,
                            "book_ids": book_ids,
                            "keyword_weight": 0.5,
                            "vector_weight": 0.5
                        }
                    ).execute()
                    chunks = chunks_result.data if chunks_result.data else []
                    print(f"🔍 Path C: Hybrid search found {len(chunks)} chunks")
                except Exception as hybrid_error:
                    print(f"⚠️ Path C: Hybrid search not available, using vector search: {str(hybrid_error)}")
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
                    print(f"🔍 Path C: Vector search found {len(chunks)} chunks")
            except Exception as e:
                print(f"❌ Path C: Search failed: {str(e)}")
                chunks = []
        
        if not chunks:
            # Fall through to Path A if no chunks found
            print(f"⚠️ Path C: No chunks found, falling back to Path A...")
            is_reasoning_query = False
        else:
            # Enhance chunks with parent context (Phase 2: Parent-Child Retrieval)
            chunks = get_parent_context_for_chunks(chunks, supabase)
            
            # Build context with parent chunk text and persistent citations (Phase 3)
            context_parts = []
            chunk_map_reverse = {}  # Map persistent IDs to chunk UUIDs (for frontend lookup)
            sources = []
            source_set = set()
            
            for chunk in chunks:
                chunk_id = chunk.get("id")
                chunk_uuid = str(chunk_id) if chunk_id else ""
                persistent_id = generate_chunk_id(chunk_uuid) if chunk_uuid else f"#chk_unknown_{len(chunk_map_reverse)}"
                chunk_map_reverse[persistent_id] = chunk_uuid  # Reverse mapping for frontend
                
                # Use parent context text if available, else use child text
                context_text = chunk.get("context_text") or chunk.get("parent_text") or chunk.get("text", "")
                
                book_title = chunk.get("book_title") or "Unknown Book"
                chapter = chunk.get("chapter_title") or ""
                section = chunk.get("section_title") or ""
                
                source_parts = [book_title]
                if chapter:
                    source_parts.append(chapter)
                if section and section != chapter:
                    source_parts.append(section)
                
                source = ", ".join(source_parts)
                source_key = f"{book_title}|{chapter}|{section}"
                
                # Add chunk to context with persistent citation
                context_parts.append(f"{persistent_id} {context_text}")
                
                if source_key not in source_set:
                    sources.append(source)
                    source_set.add(source_key)
            
            context = "\n\n".join(context_parts)
            sources_list = list(set(sources))
            
            # MAP-REDUCE: Multi-book synthesis instructions
            # Check for multi-book compare query (book_chunks_map is only set in multi-book compare path)
            multi_book_suffix = ""
            if book_chunks_map is not None and len(book_chunks_map) > 1:
                book_titles = []
                for book_id in book_chunks_map.keys():
                    book_result = supabase.table("books").select("title").eq("id", book_id).execute()
                    if book_result.data:
                        book_titles.append(book_result.data[0].get("title", f"Book {book_id[:8]}"))
                
                multi_book_suffix = f"""

MULTI-BOOK SYNTHESIS (MAP-REDUCE):
You have retrieved chunks from {len(book_chunks_map)} different books: {', '.join(book_titles[:3])}{'...' if len(book_titles) > 3 else ''}
- Explicitly contrast information across books
- Create clear comparisons between different sources  
- Use table format if comparing structured data (e.g., "Book A: X | Book B: Y")
- Identify commonalities and differences between sources
- Cite which book each piece of information comes from using #chk_xxx citations"""
            
            # Inject conversation history for context (last 3 turn pairs)
            history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
            
            investigator_prompt = f"""You are Zorxido, an expert AI investigator that analyzes information from books with deep reasoning and critical thinking.

{history_prefix}{corrections_context}

CORE INSTRUCTIONS:
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are an INVESTIGATOR, not just a summarizer. You think critically, analyze relationships, and detect conflicts.
- ALWAYS cite your sources using the persistent citation format (e.g., #chk_a1b2c3d4) that appears before each chunk.

DEEP REASONING MODE:
- Don't just summarize the chunks. Explicitly look for:
  * Contradictions or conflicting information between different chunks
  * Underlying themes or patterns across chunks
  * Causal relationships (what leads to what)
  * Comparisons and contrasts between concepts
  * Connections and correlations between ideas

CONFLICT DETECTION (CRITICAL):
- If the retrieved chunks offer multiple potential answers (e.g., two different dates, conflicting explanations, contradictory statements), DO NOT guess.
- Explicitly list the conflict: "I found conflicting information: In #chk_xxx it says X, but in #chk_yyy it says Y."
- Ask the user to clarify which source/document version they trust, or if they want you to investigate further.

ACTIVE ANALYSIS:
- Compare information across chunks: "When comparing #chk_xxx and #chk_yyy, we see..."
- Identify relationships: "There appears to be a connection between..."
- Explain causality: "Based on #chk_xxx, this leads to... because..."
- Highlight patterns: "A recurring theme across multiple chunks is..."

ACCURACY AND HONESTY:
- If the context doesn't contain enough information to fully answer, say so explicitly.
- Base your analysis only on the provided chunks. Don't hallucinate.
- Stay focused on the content from the user's books.
- If asked about topics not in the books, politely redirect to what you can help with.

FORMAT:
- Use structured reasoning: explain your thought process step by step.
- Cite sources inline as you make claims: "According to #chk_xxx, the revenue grew..."
- If you detect conflicts, use a clear "CONFLICT DETECTED" section.{multi_book_suffix}"""
            
            client = OpenAI(api_key=settings.openai_api_key)
            
            # Build user message with conversation context note
            user_content = f"Context from books:\n\n{context}\n\nQuestion: {chat_message.message}"
            if conversation_context:
                user_content += f"\n\nNote: This question may reference previous conversation. Use the conversation history above for context."
            
            response = client.chat.completions.create(
                model=settings.reasoning_model,  # Use GPT-4o for deep reasoning
                messages=[
                    {
                        "role": "system",
                        "content": investigator_prompt
                    },
                    {
                        "role": "user",
                        "content": user_content
                    }
                ],
                temperature=0.5  # Balanced for reasoning (not too creative, not too deterministic)
            )
            
            assistant_message = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else None
            
            # Save messages
            retrieved_chunk_ids = [chunk.get("id") for chunk in chunks if chunk.get("id")]
            
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
                "retrieved_chunks": retrieved_chunk_ids,
                "sources": sources_list,
                "chunk_map": chunk_map_reverse,  # Store persistent ID -> UUID mapping
                "tokens_used": tokens_used,
                "model_used": f"deep_reasoner_{settings.reasoning_model}"
            }).execute()
            
            # Update usage tracking
            supabase.table("user_profiles").update({
                "chat_messages_this_month": current_user.get("chat_messages_this_month", 0) + 1
            }).eq("id", user_id).execute()
            
            return ChatResponse(
                response=assistant_message,
                sources=sources_list,
                retrieved_chunks=retrieved_chunk_ids,  # Include chunk IDs for citation mapping
                chunk_map=chunk_map_reverse,  # Include persistent ID -> UUID mapping
                tokens_used=tokens_used
            )
    
    # PATH A: Specific Query - Use Hybrid Search
    # (Only runs if Path B and Path C didn't return)
    if (not is_global_query or not chat_message.book_id or len(book_ids) > 1) and not is_reasoning_query:
        print(f"🧠 PATH A (Specific Query): Using hybrid search")
        
        # Use rewritten query for search (de-referenced pronouns)
        # Generate query embedding using rewritten query
        query_embedding = generate_embedding(search_query)  # Use rewritten query, not raw message
        
        # Adjust threshold based on query type
        match_threshold = 0.5 if is_global_query else 0.7
        match_count = 10 if is_global_query else 5
        
        # Search for relevant chunks using hybrid search (vector + keyword)
        chunks = []
        try:
            # Try hybrid search first (if available)
            try:
                chunks_result = supabase.rpc(
                    "match_child_chunks_hybrid",
                    {
                        "query_embedding": query_embedding,
                        "query_text": search_query,  # Use rewritten query for keyword search
                        "match_threshold": match_threshold,
                        "match_count": match_count,
                        "book_ids": book_ids,
                        "keyword_weight": 0.5,
                        "vector_weight": 0.5
                    }
                ).execute()
                chunks = chunks_result.data if chunks_result.data else []
                print(f"🔍 Hybrid search found {len(chunks)} chunks with threshold {match_threshold}")
            except Exception as hybrid_error:
                # Fallback to pure vector search if hybrid not available
                print(f"⚠️ Hybrid search not available, using vector search: {str(hybrid_error)}")
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
                try:
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
                except Exception as fallback_error:
                    print(f"⚠️ Fallback search also failed: {str(fallback_error)}")
        
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
        
        # After all search attempts, check if we have chunks
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
        
        # After all search attempts, check if we have chunks (outside try-except)
        if not chunks:
            # If still no chunks, check if book exists and has chunks
            print(f"❌ No chunks found at all. Checking if books have chunks...")
            for book_id in book_ids:
                chunk_count = supabase.table("child_chunks").select("id", count="exact").eq("book_id", book_id).execute()
                print(f"   Book {book_id} has {chunk_count.count if hasattr(chunk_count, 'count') else len(chunk_count.data)} chunks")
                
                # Check if chunks have embeddings
                embedded_count = supabase.table("child_chunks").select("id", count="exact").eq("book_id", book_id).not_.is_("embedding", "null").execute()
                print(f"   Book {book_id} has {embedded_count.count if hasattr(embedded_count, 'count') else len(embedded_count.data)} chunks with embeddings")
            
            # If no chunks found, return error message
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
                "chunk_map": {},  # No chunks for no context response
                "tokens_used": None,
                "model_used": "no_context_response"
            }).execute()
            
            return ChatResponse(
                response=assistant_message,
                sources=[],
                retrieved_chunks=[],
                tokens_used=None
            )
        
        # At this point, we have chunks - proceed with context building and response generation
        if chunks:
            # Phase 4: Check for relevant corrections before answering (Active Loop)
            corrections = get_relevant_corrections(user_id, chat_message.message, chat_message.book_id, limit=3)
            corrections_context = build_corrections_context(corrections) if corrections else ""
            
            # Phase 2: Enhance chunks with parent context (Parent-Child Retrieval)
            chunks = get_parent_context_for_chunks(chunks, supabase)
            
            # Phase 3: Build context with parent chunk text and persistent citations (#chk_xxx)
            context_parts = []
            chunk_map_reverse = {}  # Map persistent IDs to chunk UUIDs (for frontend lookup)
            sources = []
            source_set = set()  # Track unique sources for deduplication
            
            for chunk in chunks:
                chunk_id = chunk.get("id")
                chunk_uuid = str(chunk_id) if chunk_id else ""
                
                # Generate persistent chunk ID (Phase 3: Persistent Citations)
                persistent_id = generate_chunk_id(chunk_uuid) if chunk_uuid else f"#chk_unknown_{len(chunk_map_reverse)}"
                chunk_map_reverse[persistent_id] = chunk_uuid  # Reverse mapping for frontend
                
                # Use parent context text if available, else use child text (Phase 2: Parent Context)
                context_text = chunk.get("context_text") or chunk.get("parent_text") or chunk.get("text", "")
                
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
                
                # Add chunk to context with persistent citation (Phase 3: #chk_xxx instead of [Ref: N])
                context_parts.append(f"{persistent_id} {context_text}")
                
                # Track source (deduplicated)
                if source_key not in source_set:
                    sources.append(source)
                    source_set.add(source_key)
            
            context = "\n\n".join(context_parts)
            
            # Build source list for response (deduplicated)
            sources_list = list(set(sources))
            
            # Generate response with GPT
            client = OpenAI(api_key=settings.openai_api_key)
            
            # Phase 1: Investigator System Prompt (Active Conflict Detection)
            # Inject conversation history for context (last 3 turn pairs)
            history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
            
            investigator_prompt = f"""You are Zorxido, an expert AI assistant and investigator that answers questions based on the provided context from books with critical thinking and attention to detail.

{history_prefix}{corrections_context}

CORE INSTRUCTIONS:
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are designed to help users understand and explore their uploaded books.
- ALWAYS cite your sources using the persistent citation format (e.g., #chk_a1b2c3d4) that appears before each chunk in the context.

INVESTIGATOR MODE:
- You are an ACTIVE INVESTIGATOR, not just a passive summarizer.
- Don't just summarize the chunks. Look for:
  * Contradictions or conflicting information between different chunks
  * Underlying themes or patterns across chunks
  * Connections and relationships between ideas
  * Multiple perspectives on the same topic

CONFLICT DETECTION (CRITICAL):
- If the retrieved chunks offer multiple potential answers (e.g., two different dates for an event, conflicting explanations, contradictory statements), DO NOT guess.
- Explicitly list the conflict: "I found conflicting information: In #chk_xxx it says X, but in #chk_yyy it says Y."
- Ask the user to clarify which document version they trust, or if they want you to investigate further.
- This builds massive trust - users will think "Wow, it spotted a conflict I missed."

ACCURACY AND HONESTY:
- Use the context provided to answer questions. If the user asks to "summarise" or "summarize" a book, provide a comprehensive summary based on all the context provided.
- If the context doesn't contain enough information to fully answer a question, explicitly state what information is missing and answer based on what is available.
- Mention that your answer is based on the provided context.
- Stay focused on the content from the user's books. If asked about topics not in the books, politely redirect to what you can help with based on their uploaded content.

CITATION FORMAT:
- Always cite sources inline as you make claims: "According to #chk_xxx, the revenue grew..."
- For general questions like "summarise this book", use all the provided context to create a comprehensive summary with proper citations throughout.

FORMAT:
- Use structured reasoning when appropriate: explain your thought process step by step.
- If you detect conflicts, use a clear "CONFLICT DETECTED" section before proceeding.
- Be thorough but concise."""
            
            # Build user message with conversation context note
            user_content = f"Context from books:\n\n{context}\n\nQuestion: {chat_message.message}"
            if conversation_context:
                user_content += f"\n\nNote: This question may reference previous conversation. Use the conversation history above for context."
            
            response = client.chat.completions.create(
                model=settings.chat_model,  # Use gpt-4o-mini for Path A (faster, cheaper)
                messages=[
                    {
                        "role": "system",
                        "content": investigator_prompt  # Use Investigator prompt for Path A too
                    },
                    {
                        "role": "user",
                        "content": user_content
                    }
                ],
                temperature=0.7  # Balanced for general queries
            )
            
            assistant_message = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else None
            
            # Save chat messages
            retrieved_chunk_ids = [chunk.get("id") for chunk in chunks if chunk.get("id")]
            
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
                "sources": sources_list,  # Use deduplicated sources
                "chunk_map": chunk_map_reverse,  # Store persistent ID -> UUID mapping
                "tokens_used": tokens_used,
                "model_used": f"investigator_{settings.chat_model}"
            }).execute()
            
            # Update usage tracking
            supabase.table("user_profiles").update({
                "chat_messages_this_month": current_user.get("chat_messages_this_month", 0) + 1
            }).eq("id", user_id).execute()
            
            return ChatResponse(
                response=assistant_message,
                sources=sources_list,  # Use deduplicated sources list
                retrieved_chunks=retrieved_chunk_ids,  # Include chunk IDs for citation mapping
                chunk_map=chunk_map_reverse,  # Include persistent ID -> UUID mapping
                tokens_used=tokens_used
            )

@router.post("/corrections")
async def save_correction(
    correction: CorrectionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Save a user correction (Phase 4: Active Loop)
    Allows users to provide feedback when AI responses are incorrect
    """
    from app.services.corrections_service import save_correction as save_correction_service
    
    user_id = current_user["id"]
    
    try:
        correction_id = save_correction_service(
            user_id=user_id,
            original_message=correction.original_message,
            original_response=correction.original_response,
            original_chunks=correction.original_chunks,
            incorrect_text=correction.incorrect_text,
            correct_text=correction.correct_text,
            user_feedback=correction.user_feedback,
            book_id=correction.book_id,
            chunk_id=correction.chunk_id
        )
        
        return {"message": "Correction saved successfully", "correction_id": correction_id}
    except Exception as e:
        print(f"❌ Failed to save correction: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save correction: {str(e)}")

@router.post("/refine-artifact")
async def refine_artifact(
    refinement: ArtifactRefinementRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Phase 2: Refine artifact (variables or steps)
    Handles both contextual variable updates and selection-based step refinement
    """
    from app.services.corrections_service import get_relevant_corrections, build_corrections_context
    
    supabase = get_supabase_admin_client()
    user_id = current_user["id"]
    
    try:
        # Retrieve the original message with artifact
        message_result = supabase.table("chat_messages").select("*").eq("id", refinement.message_id).eq("user_id", user_id).single().execute()
        
        if not message_result.data:
            raise HTTPException(status_code=404, detail="Message not found")
        
        original_message = message_result.data
        original_artifact = original_message.get("artifact")
        
        if not original_artifact:
            raise HTTPException(status_code=400, detail="Message does not contain an artifact")
        
        book_id = original_message.get("book_id")
        
        # Get user's accessible books
        if book_id:
            book_ids = [book_id]
        else:
            access_result = supabase.table("user_book_access").select("book_id").eq("user_id", user_id).eq("is_visible", True).execute()
            book_ids = [access["book_id"] for access in access_result.data]
        
        if not book_ids:
            raise HTTPException(status_code=400, detail="No books available")
        
        # Get conversation history for context
        conversation_history = get_conversation_history(supabase, user_id, book_id, limit=20)
        conversation_context = build_conversation_context(conversation_history)
        
        # Find the original user message that triggered this artifact
        original_user_message = ""
        for msg in reversed(conversation_history):  # Search from most recent
            if msg.get("role") == "user" and msg.get("id") != refinement.message_id:
                original_user_message = msg.get("content", "")
                break
        
        # If not found in history, try to get from message before this one
        if not original_user_message:
            # Get the user message that came before this assistant message
            prev_message_result = supabase.table("chat_messages").select("*").eq("user_id", user_id).eq("book_id", book_id).lt("created_at", original_message.get("created_at")).order("created_at", desc=True).limit(1).execute()
            if prev_message_result.data:
                prev_msg = prev_message_result.data[0]
                if prev_msg.get("role") == "user":
                    original_user_message = prev_msg.get("content", "")
        
        client = OpenAI(api_key=settings.openai_api_key)
        
        # Handle variable refinement
        if refinement.refinement_type == "variable" and refinement.variable_key and refinement.variable_value:
            # Update variables in artifact
            updated_variables = original_artifact.get("variables", {}).copy()
            updated_variables[refinement.variable_key] = refinement.variable_value
            
            # Regenerate artifact with new variables
            # Get original citations to retrieve chunks
            original_citations = original_artifact.get("citations", [])
            
            # Extract chunk IDs from citations
            chunk_ids = []
            chunk_map_reverse = original_message.get("chunk_map", {}) or {}
            for citation in original_citations:
                chunk_id = chunk_map_reverse.get(citation)
                if chunk_id:
                    chunk_ids.append(chunk_id)
            
            # Retrieve chunks
            chunks = []
            if chunk_ids:
                chunks_result = supabase.table("child_chunks").select("id, text, parent_id, book_id").in_("id", chunk_ids).execute()
                chunks = chunks_result.data if chunks_result.data else []
            
            if not chunks:
                raise HTTPException(status_code=400, detail="Could not retrieve original chunks")
            
            # Enhance chunks with parent context
            chunks = get_parent_context_for_chunks(chunks, supabase)
            
            # Build context
            context_parts = []
            retrieved_chunk_ids = []
            
            for chunk in chunks:
                chunk_id = chunk.get("id")
                chunk_text = chunk.get("context_text") or chunk.get("text", "")
                persistent_id = generate_chunk_id(chunk_id)
                retrieved_chunk_ids.append(chunk_id)
                
                chapter_title = chunk.get("chapter_title") or "Unknown Chapter"
                section_title = chunk.get("section_title") or ""
                context_parts.append(f"[{persistent_id}] {chapter_title}" + (f" / {section_title}" if section_title else ""))
                context_parts.append(chunk_text)
            
            context_text = "\n\n".join(context_parts)
            
            # Get corrections
            corrections = get_relevant_corrections(user_id, original_user_message, book_id, limit=3)
            corrections_context = build_corrections_context(corrections) if corrections else ""
            
            # Build regeneration prompt with updated variables
            history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
            
            variables_str = ", ".join([f"{k}: {v}" for k, v in updated_variables.items()])
            
            artifact_prompt = f"""You are an Implementation Architect. Regenerate the artifact with updated variables.

{history_prefix}Original Request: {original_user_message}

Updated Variables: {variables_str}

Relevant Content from Book:
{context_text}

{corrections_context}

Regenerate the JSON artifact with the updated variables. Keep the same artifact_type and structure, but update the content based on the new variable values.

Return ONLY valid JSON with this structure:
{{
  "artifact_type": "{original_artifact.get('artifact_type')}",
  "title": "...",
  "content": {{...}},
  "citations": {json.dumps(original_citations)},
  "variables": {json.dumps(updated_variables)}
}}"""
            
            # Regenerate artifact
            response = client.chat.completions.create(
                model=settings.reasoning_model,
                messages=[
                    {"role": "system", "content": "You are an Implementation Architect. Regenerate structured JSON artifacts with updated variables."},
                    {"role": "user", "content": artifact_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            artifact_json_str = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else None
            
            try:
                updated_artifact = json.loads(artifact_json_str)
            except json.JSONDecodeError as e:
                raise HTTPException(status_code=500, detail=f"Failed to parse regenerated artifact: {str(e)}")
            
            # Update artifact in database
            supabase.table("chat_messages").update({
                "artifact": updated_artifact
            }).eq("id", refinement.message_id).execute()
            
            return {
                "message": "Artifact regenerated successfully",
                "artifact": updated_artifact,
                "tokens_used": tokens_used
            }
        
        # Handle step refinement
        elif refinement.refinement_type == "step" and refinement.step_id and refinement.refinement_instruction:
            # Refine specific step
            # Get original artifact structure
            artifact_type = original_artifact.get("artifact_type")
            artifact_content = original_artifact.get("content", {})
            
            # Find the step to refine
            if artifact_type == "checklist":
                steps = artifact_content.get("steps", [])
                step_to_refine = next((s for s in steps if s.get("id") == refinement.step_id), None)
                
                if not step_to_refine:
                    raise HTTPException(status_code=404, detail="Step not found in artifact")
                
                # Get original citations for context
                original_citations = original_artifact.get("citations", [])
                
                # Extract chunk IDs from citations
                chunk_ids = []
                chunk_map_reverse = original_message.get("chunk_map", {})
                for citation in original_citations:
                    chunk_id = chunk_map_reverse.get(citation)
                    if chunk_id:
                        chunk_ids.append(chunk_id)
                
                # Retrieve chunks
                chunks = []
                if chunk_ids:
                    chunks_result = supabase.table("child_chunks").select("id, text, parent_id, book_id").in_("id", chunk_ids).execute()
                    chunks = chunks_result.data if chunks_result.data else []
                
                if not chunks:
                    raise HTTPException(status_code=400, detail="Could not retrieve original chunks")
                
                # Enhance chunks with parent context
                chunks = get_parent_context_for_chunks(chunks, supabase)
                
                # Build context
                context_parts = []
                for chunk in chunks:
                    chunk_id = chunk.get("id")
                    chunk_text = chunk.get("context_text") or chunk.get("text", "")
                    persistent_id = generate_chunk_id(chunk_id)
                    
                    chapter_title = chunk.get("chapter_title") or "Unknown Chapter"
                    section_title = chunk.get("section_title") or ""
                    context_parts.append(f"[{persistent_id}] {chapter_title}" + (f" / {section_title}" if section_title else ""))
                    context_parts.append(chunk_text)
                
                context_text = "\n\n".join(context_parts)
                
                # Build refinement prompt
                # Find original user message (same logic as variable refinement)
                step_refinement_user_message = ""
                for msg in reversed(conversation_history):
                    if msg.get("role") == "user" and msg.get("id") != refinement.message_id:
                        step_refinement_user_message = msg.get("content", "")
                        break
                
                if not step_refinement_user_message:
                    prev_message_result = supabase.table("chat_messages").select("*").eq("user_id", user_id).eq("book_id", book_id).lt("created_at", original_message.get("created_at")).order("created_at", desc=True).limit(1).execute()
                    if prev_message_result.data:
                        prev_msg = prev_message_result.data[0]
                        if prev_msg.get("role") == "user":
                            step_refinement_user_message = prev_msg.get("content", "")
                
                corrections = get_relevant_corrections(user_id, step_refinement_user_message, book_id, limit=3)
                corrections_context = build_corrections_context(corrections) if corrections else ""
                
                history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
                
                artifact_prompt = f"""You are an Implementation Architect. Refine a specific step in an existing artifact.

{history_prefix}Original Request: {step_refinement_user_message}

Current Step to Refine:
{json.dumps(step_to_refine, indent=2)}

Refinement Instruction: {refinement.refinement_instruction}

Relevant Content from Book:
{context_text}

{corrections_context}

Refine ONLY the specified step based on the instruction. Keep all other steps unchanged.

Return ONLY valid JSON with the refined step:
{{
  "id": "{refinement.step_id}",
  "time": "...",
  "action": "...",
  "description": "...",
  "checked": false
}}"""
                
                # Refine step
                response = client.chat.completions.create(
                    model=settings.reasoning_model,
                    messages=[
                        {"role": "system", "content": "You are an Implementation Architect. Refine specific steps in artifacts based on user instructions."},
                        {"role": "user", "content": artifact_prompt}
                    ],
                    temperature=0.3,
                    response_format={"type": "json_object"}
                )
                
                refined_step_json = response.choices[0].message.content
                tokens_used = response.usage.total_tokens if response.usage else None
                
                try:
                    refined_step = json.loads(refined_step_json)
                except json.JSONDecodeError as e:
                    raise HTTPException(status_code=500, detail=f"Failed to parse refined step: {str(e)}")
                
                # Update step in artifact
                updated_steps = steps.copy()
                step_index = next((i for i, s in enumerate(updated_steps) if s.get("id") == refinement.step_id), None)
                
                if step_index is not None:
                    updated_steps[step_index] = {**updated_steps[step_index], **refined_step}
                
                updated_artifact = original_artifact.copy()
                updated_artifact["content"] = {"steps": updated_steps}
                
                # Update artifact in database
                supabase.table("chat_messages").update({
                    "artifact": updated_artifact
                }).eq("id", refinement.message_id).execute()
                
                return {
                    "message": "Step refined successfully",
                    "artifact": updated_artifact,
                    "refined_step_id": refinement.step_id,
                    "tokens_used": tokens_used
                }
            else:
                raise HTTPException(status_code=400, detail=f"Step refinement not supported for artifact type: {artifact_type}")
        
        else:
            raise HTTPException(status_code=400, detail="Invalid refinement request")
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Failed to refine artifact: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to refine artifact: {str(e)}")

def stream_chat_response(
    chat_message: ChatMessage,
    current_user: dict,
    supabase,
    user_id: str,
    book_ids: List[str],
    conversation_history: List[dict],
    conversation_context: str,
    search_query: str,
    user_message_lower: str,
    is_reasoning_query: bool,
    is_global_query: bool,
    is_action_planner_query: bool,
    is_name_question: bool
):
    """
    Stream chat response with thinking steps and token-by-token streaming
    This is a helper function for the streaming endpoint
    """
    import re
    
    client = OpenAI(api_key=settings.openai_api_key)
    
    # Phase 1: Thinking Steps (Search Phase)
    yield json.dumps({"type": "thinking", "step": "Analyzing query intent..."}) + "\n"
    
    # Handle name questions
    if is_name_question:
        yield json.dumps({"type": "thinking", "step": "Direct response (name question)"}) + "\n"
        assistant_message = "Hello! I'm Zorxido, your AI assistant for exploring your books. I'm here to help you understand and navigate through the content you've uploaded. How can I assist you today?"
        
        # Save messages
        supabase.table("chat_messages").insert({
            "user_id": user_id,
            "book_id": message_book_id,
            "role": "user",
            "content": chat_message.message,
            "tokens_used": None,
            "model_used": None
        }).execute()
        
        supabase.table("chat_messages").insert({
            "user_id": user_id,
            "book_id": message_book_id,
            "role": "assistant",
            "content": assistant_message,
            "retrieved_chunks": [],
            "sources": [],
            "chunk_map": {},
            "tokens_used": None,
            "model_used": "direct_response"
        }).execute()
        
        yield json.dumps({"type": "token", "content": assistant_message}) + "\n"
        yield json.dumps({"type": "done", "sources": [], "retrieved_chunks": [], "chunk_map": {}, "tokens_used": None}) + "\n"
        return
    
    # Path B: Global Query (Summaries)
    if is_global_query and chat_message.book_id and len(book_ids) == 1:
        yield json.dumps({"type": "thinking", "step": "PATH B: Using pre-computed summary..."}) + "\n"
        
        print(f"✅ Path B triggered for book_id: {chat_message.book_id}")
        book_result = supabase.table("books").select("id, title, author, global_summary").eq("id", chat_message.book_id).execute()
        
        if not book_result.data:
            print(f"❌ Book not found: {chat_message.book_id}")
            yield json.dumps({"type": "error", "message": "Book not found"}) + "\n"
            return
        
        book = book_result.data[0]
        global_summary = book.get("global_summary")
        
        print(f"📋 Book: {book.get('title', 'Unknown')}")
        print(f"📋 global_summary exists: {global_summary is not None}")
        print(f"📋 global_summary length: {len(global_summary) if global_summary else 0}")
        
        if global_summary and global_summary.strip():
            history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
            
            system_prompt = f"""You are Zorxido, a helpful AI assistant. The user asked for a high-level summary.
DO NOT search for specific details.
I have provided you with a Pre-Computed Executive Summary of the document below.
Use this summary to answer the user's request in a structured format.

{history_prefix}Document Title: {book.get('title', 'Unknown')}
Author: {book.get('author', 'Unknown')}

Executive Summary:
{global_summary}

Instruction: Present this summary in a clear, structured format. If the user asked to "summarize" or asked "what is this book about", provide a comprehensive overview covering: Introduction (overview of the book's purpose), Key Themes (main arguments and concepts), and Conclusion (overall message and takeaways)."""
            
            yield json.dumps({"type": "thinking", "step": "Formatting summary with GPT-4o-mini..."}) + "\n"
            
            response = client.chat.completions.create(
                model=settings.chat_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": chat_message.message}
                ],
                temperature=0.4,
                stream=True
            )
            
            full_response = ""
            for chunk in response:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    yield json.dumps({"type": "token", "content": content}) + "\n"
            
            tokens_used = None  # Streaming doesn't provide usage until done
            
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
                "content": full_response,
                "retrieved_chunks": [],
                "sources": [f"{book.get('title', 'Unknown')} (Executive Summary)"],
                "chunk_map": {},
                "tokens_used": tokens_used,
                "model_used": "global_summary_path_streaming"
            }).execute()
            
            yield json.dumps({"type": "done", "sources": [f"{book.get('title', 'Unknown')} (Executive Summary)"], "retrieved_chunks": [], "chunk_map": {}, "tokens_used": tokens_used}) + "\n"
            return
        else:
            # No pre-computed summary available - fall back to chunk search
            print(f"⚠️ Path B: No global_summary found for book {chat_message.book_id}, falling back to chunk search")
            yield json.dumps({"type": "thinking", "step": "No pre-computed summary found. Searching book content..."}) + "\n"
            # Continue to Path A (chunk search) below
    
    # Path D: Action Planner (Streaming version)
    if is_action_planner_query:
        yield json.dumps({"type": "thinking", "step": "PATH D: Action Planner - Generating structured artifact..."}) + "\n"
        
        # Search for methodology/framework chunks (Phase 2: Use action metadata prioritization)
        query_embedding = generate_embedding(search_query)
        match_threshold = 0.6
        match_count = 10
        
        chunks = []
        try:
            yield json.dumps({"type": "thinking", "step": "Searching for methodologies and frameworks (prioritizing tagged content)..."}) + "\n"
            try:
                chunks_result = supabase.rpc(
                    "match_child_chunks_with_action_metadata",
                    {
                        "query_embedding": query_embedding,
                        "query_text": search_query,
                        "match_threshold": match_threshold,
                        "match_count": match_count,
                        "book_ids": book_ids,
                        "keyword_weight": 0.5,
                        "vector_weight": 0.5,
                        "action_metadata_tags": None  # NULL = prioritize any action_metadata, not just specific tags
                    }
                ).execute()
                chunks = chunks_result.data if chunks_result.data else []
                yield json.dumps({"type": "thinking", "step": f"Found {len(chunks)} relevant methodology chunks (prioritized by action metadata tags)"}) + "\n"
            except Exception as action_metadata_error:
                yield json.dumps({"type": "thinking", "step": "Action metadata search not available, using hybrid search..."}) + "\n"
                # Fallback to hybrid search
                try:
                    chunks_result = supabase.rpc(
                        "match_child_chunks_hybrid",
                        {
                            "query_embedding": query_embedding,
                            "query_text": search_query,
                            "match_threshold": match_threshold,
                            "match_count": match_count,
                            "book_ids": book_ids,
                            "keyword_weight": 0.5,
                            "vector_weight": 0.5
                        }
                    ).execute()
                    chunks = chunks_result.data if chunks_result.data else []
                    yield json.dumps({"type": "thinking", "step": f"Found {len(chunks)} relevant methodology chunks"}) + "\n"
                except Exception as hybrid_error:
                    yield json.dumps({"type": "thinking", "step": "Using vector search..."}) + "\n"
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
        except Exception as e:
            yield json.dumps({"type": "error", "message": f"Search failed: {str(e)}"}) + "\n"
            return
        
        if chunks:
            yield json.dumps({"type": "thinking", "step": "Extracting methodology and building artifact..."}) + "\n"
            
            # Enhance chunks with parent context
            chunks = get_parent_context_for_chunks(chunks, supabase)
            
            # Build context
            context_parts = []
            chunk_map_reverse = {}
            retrieved_chunk_ids = []
            
            for i, chunk in enumerate(chunks[:10]):
                chunk_id = chunk.get("id")
                chunk_text = chunk.get("context_text") or chunk.get("text", "")
                persistent_id = generate_chunk_id(chunk_id) if chunk_id else f"#chk_unknown_{len(chunk_map_reverse)}"
                chunk_map_reverse[persistent_id] = chunk_id
                retrieved_chunk_ids.append(chunk_id)
                
                chapter_title = chunk.get("chapter_title") or "Unknown Chapter"
                section_title = chunk.get("section_title") or ""
                context_parts.append(f"[{persistent_id}] {chapter_title}" + (f" / {section_title}" if section_title else ""))
                context_parts.append(chunk_text)
            
            context_text = "\n\n".join(context_parts)
            
            # Get corrections
            corrections = get_relevant_corrections(user_id, chat_message.message, chat_message.book_id, limit=3)
            corrections_context = build_corrections_context(corrections) if corrections else ""
            
            # Build artifact prompt
            history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
            
            artifact_prompt = f"""You are an Implementation Architect. Extract methodologies, frameworks, scripts, or step-by-step procedures from the provided book content and generate a structured, actionable artifact.

CRITICAL: You MUST return ONLY valid JSON. No markdown formatting, no code blocks, no explanations, no text outside the JSON object. The response must be parseable as JSON.

{history_prefix}User Request: {chat_message.message}

Relevant Content from Book:
{context_text}

{corrections_context}

FOCUS ON PRESCRIPTIVE CONTENT: Look for chunks that contain:
- Step-by-step instructions (numbered lists, "first... then... finally")
- Conditional logic ("if X, then Y", "when A happens, do B")
- Action verbs ("do", "perform", "execute", "follow", "apply")
- Methodologies, frameworks, or procedures
- NOT just descriptions or explanations (those are descriptive, not prescriptive)

Generate a JSON artifact with this EXACT structure (no markdown, no code fences, just raw JSON):
{{
  "artifact_type": "checklist" | "notebook" | "script",
  "title": "Short descriptive title",
  "content": {{
    "steps": [{{"id": "step_1", "time": "7:00 PM", "action": "...", "description": "...", "checked": false}}] OR
    "cells": [{{"type": "markdown|code|output", "content": "..."}}] OR
    "scenes": [{{"id": "scene_1", "context": "...", "speaker": "...", "text": "...", "action": "..."}}]
  }},
  "citations": ["#chk_xxxx"],
  "variables": {{}}
}}

REMEMBER: Return ONLY the JSON object, nothing else. No markdown, no explanations, no code blocks."""
            
            yield json.dumps({"type": "thinking", "step": "Generating structured artifact with GPT-4o..."}) + "\n"
            
            # Use reasoning model for artifact generation
            # CRITICAL: response_format={"type": "json_object"} forces JSON output (no markdown)
            response = client.chat.completions.create(
                model=settings.reasoning_model,
                messages=[
                    {"role": "system", "content": "You are an Implementation Architect. Generate structured JSON artifacts from book content. You MUST return ONLY valid JSON, no markdown, no code blocks, no explanations."},
                    {"role": "user", "content": artifact_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}  # CRITICAL: Forces JSON output, prevents markdown
            )
            
            artifact_json_str = response.choices[0].message.content.strip()
            tokens_used = response.usage.total_tokens if response.usage else None
            
            # Remove any markdown code fences if they somehow appear (defensive)
            if artifact_json_str.startswith("```"):
                # Remove ```json or ``` markers
                lines = artifact_json_str.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].strip() == "```":
                    lines = lines[:-1]
                artifact_json_str = "\n".join(lines).strip()
            
            try:
                artifact_data = json.loads(artifact_json_str)
                
                # Validate artifact structure
                if not isinstance(artifact_data, dict):
                    raise ValueError("Artifact must be a JSON object")
                if "artifact_type" not in artifact_data:
                    raise ValueError("Artifact must have 'artifact_type' field")
                if "content" not in artifact_data:
                    raise ValueError("Artifact must have 'content' field")
                    
            except (json.JSONDecodeError, ValueError) as e:
                print(f"❌ Path D: Failed to parse/validate artifact JSON: {str(e)}")
                print(f"   Raw response: {artifact_json_str[:200]}...")
                yield json.dumps({"type": "error", "message": f"Failed to generate valid artifact: {str(e)}"}) + "\n"
                # Fall back to Path A
                is_action_planner_query = False
            else:
                # Build sources
                sources_list = list(set([f"#{chunk_id}" for chunk_id in chunk_map_reverse.keys()]))
                
                # Save messages
                supabase.table("chat_messages").insert({
                    "user_id": user_id,
                    "book_id": chat_message.book_id,
                    "role": "user",
                    "content": chat_message.message,
                    "tokens_used": None,
                    "model_used": None
                }).execute()
                
                assistant_message = f"I've created a {artifact_data.get('artifact_type', 'plan')} for you. View it in the Composer pane."
                
                supabase.table("chat_messages").insert({
                    "user_id": user_id,
                    "book_id": chat_message.book_id,
                    "role": "assistant",
                    "content": assistant_message,
                    "retrieved_chunks": retrieved_chunk_ids,
                    "sources": sources_list,
                    "chunk_map": chunk_map_reverse,
                    "tokens_used": tokens_used,
                    "model_used": "action_planner_path_streaming",
                    "artifact": artifact_data  # Store artifact JSONB
                }).execute()
                
                # Stream the message and artifact
                yield json.dumps({"type": "token", "content": assistant_message}) + "\n"
                yield json.dumps({"type": "artifact", "artifact": artifact_data}) + "\n"
                yield json.dumps({"type": "sources", "sources": sources_list, "retrieved_chunks": retrieved_chunk_ids, "chunk_map": chunk_map_reverse}) + "\n"
                yield json.dumps({"type": "done", "sources": sources_list, "retrieved_chunks": retrieved_chunk_ids, "chunk_map": chunk_map_reverse, "tokens_used": tokens_used}) + "\n"
                return
        else:
            yield json.dumps({"type": "thinking", "step": "No methodology chunks found, falling back to Path A..."}) + "\n"
            is_action_planner_query = False
    
    # Path C: Deep Reasoner (Streaming version)
    if is_reasoning_query:
        yield json.dumps({"type": "thinking", "step": "PATH C: Deep Reasoner - Analyzing complex query..."}) + "\n"
        
        corrections = get_relevant_corrections(user_id, chat_message.message, chat_message.book_id, limit=3)
        corrections_context = build_corrections_context(corrections) if corrections else ""
        
        book_chunks_map = None
        if not chat_message.book_id and len(book_ids) > 1:
            compare_keywords = ["compare", "comparison", "contrast", "difference between", "similarities between"]
            is_compare_query = any(keyword in user_message_lower for keyword in compare_keywords)
            
            if is_compare_query:
                yield json.dumps({"type": "thinking", "step": "MAP-REDUCE: Multi-book compare query - searching per book..."}) + "\n"
                
                book_chunks_map = {}
                query_embedding = generate_embedding(search_query)
                
                for i, book_id in enumerate(book_ids):
                    yield json.dumps({"type": "thinking", "step": f"Searching book {i+1}/{len(book_ids)}..."}) + "\n"
                    try:
                        chunks_result = supabase.rpc(
                            "match_child_chunks_hybrid",
                            {
                                "query_embedding": query_embedding,
                                "query_text": search_query,
                                "match_threshold": 0.6,
                                "match_count": 5,
                                "book_ids": [book_id],
                                "keyword_weight": 0.5,
                                "vector_weight": 0.5
                            }
                        ).execute()
                        if chunks_result.data:
                            book_chunks_map[book_id] = chunks_result.data
                    except Exception as e:
                        print(f"⚠️ Search failed for book {book_id}: {str(e)}")
                
                chunks = []
                for book_id, book_chunks in book_chunks_map.items():
                    chunks.extend(book_chunks)
                
                yield json.dumps({"type": "thinking", "step": f"Retrieved {len(chunks)} chunks from {len(book_chunks_map)} books"}) + "\n"
            else:
                yield json.dumps({"type": "thinking", "step": "Searching across all books..."}) + "\n"
                query_embedding = generate_embedding(search_query)
                match_threshold = 0.6
                match_count = 15
                
                try:
                    chunks_result = supabase.rpc(
                        "match_child_chunks_hybrid",
                        {
                            "query_embedding": query_embedding,
                            "query_text": search_query,
                            "match_threshold": match_threshold,
                            "match_count": match_count,
                            "book_ids": book_ids,
                            "keyword_weight": 0.5,
                            "vector_weight": 0.5
                        }
                    ).execute()
                    chunks = chunks_result.data if chunks_result.data else []
                except Exception as e:
                    chunks = []
        else:
            yield json.dumps({"type": "thinking", "step": "Generating query embedding..."}) + "\n"
            query_embedding = generate_embedding(search_query)
            
            yield json.dumps({"type": "thinking", "step": "Searching hybrid index (vector + keyword)..."}) + "\n"
            match_threshold = 0.6
            match_count = 15
            
            try:
                chunks_result = supabase.rpc(
                    "match_child_chunks_hybrid",
                    {
                        "query_embedding": query_embedding,
                        "query_text": search_query,
                        "match_threshold": match_threshold,
                        "match_count": match_count,
                        "book_ids": book_ids,
                        "keyword_weight": 0.5,
                        "vector_weight": 0.5
                    }
                ).execute()
                chunks = chunks_result.data if chunks_result.data else []
                yield json.dumps({"type": "thinking", "step": f"Retrieved {len(chunks)} relevant chunks"}) + "\n"
            except Exception as e:
                chunks = []
        
        if not chunks:
            yield json.dumps({"type": "error", "message": "No relevant chunks found"}) + "\n"
            return
        
        yield json.dumps({"type": "thinking", "step": "Enhancing chunks with parent context..."}) + "\n"
        chunks = get_parent_context_for_chunks(chunks, supabase)
        
        yield json.dumps({"type": "thinking", "step": "Building context with citations..."}) + "\n"
        context_parts = []
        chunk_map_reverse = {}
        sources = []
        source_set = set()
        
        for chunk in chunks:
            chunk_id = chunk.get("id")
            chunk_uuid = str(chunk_id) if chunk_id else ""
            persistent_id = generate_chunk_id(chunk_uuid) if chunk_uuid else f"#chk_unknown_{len(chunk_map_reverse)}"
            chunk_map_reverse[persistent_id] = chunk_uuid
            
            context_text = chunk.get("context_text") or chunk.get("parent_text") or chunk.get("text", "")
            book_title = chunk.get("book_title") or "Unknown Book"
            chapter = chunk.get("chapter_title") or ""
            section = chunk.get("section_title") or ""
            
            source_parts = [book_title]
            if chapter:
                source_parts.append(chapter)
            if section and section != chapter:
                source_parts.append(section)
            
            source = ", ".join(source_parts)
            source_key = f"{book_title}|{chapter}|{section}"
            context_parts.append(f"{persistent_id} {context_text}")
            
            if source_key not in source_set:
                sources.append(source)
                source_set.add(source_key)
        
        context = "\n\n".join(context_parts)
        sources_list = list(set(sources))
        
        multi_book_suffix = ""
        if book_chunks_map is not None and len(book_chunks_map) > 1:
            book_titles = []
            for book_id in book_chunks_map.keys():
                book_result = supabase.table("books").select("title").eq("id", book_id).execute()
                if book_result.data:
                    book_titles.append(book_result.data[0].get("title", f"Book {book_id[:8]}"))
            
            multi_book_suffix = f"""

MULTI-BOOK SYNTHESIS (MAP-REDUCE):
You have retrieved chunks from {len(book_chunks_map)} different books: {', '.join(book_titles[:3])}{'...' if len(book_titles) > 3 else ''}
- Explicitly contrast information across books
- Create clear comparisons between different sources  
- Use table format if comparing structured data (e.g., "Book A: X | Book B: Y")
- Identify commonalities and differences between sources
- Cite which book each piece of information comes from using #chk_xxx citations"""
        
        history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
        
        investigator_prompt = f"""You are Zorxido, an expert AI investigator that analyzes information from books with deep reasoning and critical thinking.

{history_prefix}{corrections_context}

CORE INSTRUCTIONS:
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are an INVESTIGATOR, not just a summarizer. You think critically, analyze relationships, and detect conflicts.
- ALWAYS cite your sources using the persistent citation format (e.g., #chk_a1b2c3d4) that appears before each chunk.

DEEP REASONING MODE:
- Don't just summarize the chunks. Explicitly look for:
  * Contradictions or conflicting information between different chunks
  * Underlying themes or patterns across chunks
  * Causal relationships (what leads to what)
  * Comparisons and contrasts between concepts
  * Connections and correlations between ideas

CONFLICT DETECTION (CRITICAL):
- If the retrieved chunks offer multiple potential answers (e.g., two different dates, conflicting explanations, contradictory statements), DO NOT guess.
- Explicitly list the conflict: "I found conflicting information: In #chk_xxx it says X, but in #chk_yyy it says Y."
- Ask the user to clarify which source/document version they trust, or if they want you to investigate further.

ACTIVE ANALYSIS:
- Compare information across chunks: "When comparing #chk_xxx and #chk_yyy, we see..."
- Identify relationships: "There appears to be a connection between..."
- Explain causality: "Based on #chk_xxx, this leads to... because..."
- Highlight patterns: "A recurring theme across multiple chunks is..."

ACCURACY AND HONESTY:
- If the context doesn't contain enough information to fully answer, say so explicitly.
- Base your analysis only on the provided chunks. Don't hallucinate.
- Stay focused on the content from the user's books.
- If asked about topics not in the books, politely redirect to what you can help with.

FORMAT:
- Use structured reasoning: explain your thought process step by step.
- Cite sources inline as you make claims: "According to #chk_xxx, the revenue grew..."
- If you detect conflicts, use a clear "CONFLICT DETECTED" section.{multi_book_suffix}"""
        
        user_content = f"Context from books:\n\n{context}\n\nQuestion: {chat_message.message}"
        if conversation_context:
            user_content += f"\n\nNote: This question may reference previous conversation. Use the conversation history above for context."
        
        yield json.dumps({"type": "thinking", "step": "Consulting Deep Reasoner (GPT-4o)..."}) + "\n"
        
        response = client.chat.completions.create(
            model=settings.reasoning_model,
            messages=[
                {"role": "system", "content": investigator_prompt},
                {"role": "user", "content": user_content}
            ],
            temperature=0.5,
            stream=True
        )
        
        full_response = ""
        citation_buffer = ""  # Buffer for partial citations
        
        yield json.dumps({"type": "thinking", "step": "Streaming response..."}) + "\n"
        
        for chunk in response:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_response += content
                citation_buffer += content
                
                # Check for complete citations in buffer
                citation_pattern = r'#chk_[a-f0-9]{8}'
                matches = list(re.finditer(citation_pattern, citation_buffer, re.IGNORECASE))
                
                for match in matches:
                    citation_text = match.group(0)
                    # Send citation event for immediate rendering
                    yield json.dumps({"type": "citation", "text": citation_text}) + "\n"
                
                # Keep only last 20 chars in buffer (enough for partial citation)
                if len(citation_buffer) > 20:
                    citation_buffer = citation_buffer[-20:]
                
                yield json.dumps({"type": "token", "content": content}) + "\n"
        
        tokens_used = None  # Streaming doesn't provide usage until done
        
        retrieved_chunk_ids = [chunk.get("id") for chunk in chunks if chunk.get("id")]
        
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
            "content": full_response,
            "retrieved_chunks": retrieved_chunk_ids,
            "sources": sources_list,
            "chunk_map": chunk_map_reverse,
            "tokens_used": tokens_used,
            "model_used": f"deep_reasoner_{settings.reasoning_model}_streaming"
        }).execute()
        
        yield json.dumps({"type": "done", "sources": sources_list, "retrieved_chunks": retrieved_chunk_ids, "chunk_map": chunk_map_reverse, "tokens_used": tokens_used}) + "\n"
        return
    
    # Path A: Hybrid Search (Streaming version - fallback)
    yield json.dumps({"type": "thinking", "step": "PATH A: Hybrid Search - searching..."}) + "\n"
    
    query_embedding = generate_embedding(search_query)
    match_threshold = 0.5 if is_global_query else 0.7
    match_count = 10 if is_global_query else 5
    
    yield json.dumps({"type": "thinking", "step": "Searching hybrid index (vector + keyword)..."}) + "\n"
    
    chunks = []
    try:
        chunks_result = supabase.rpc(
            "match_child_chunks_hybrid",
            {
                "query_embedding": query_embedding,
                "query_text": search_query,
                "match_threshold": match_threshold,
                "match_count": match_count,
                "book_ids": book_ids,
                "keyword_weight": 0.5,
                "vector_weight": 0.5
            }
        ).execute()
        chunks = chunks_result.data if chunks_result.data else []
        yield json.dumps({"type": "thinking", "step": f"Retrieved {len(chunks)} relevant chunks"}) + "\n"
    except Exception as e:
        chunks = []
    
    if not chunks:
        # Try to get any chunks from the book, even without embeddings
        yield json.dumps({"type": "thinking", "step": "No matching chunks found. Trying to retrieve any available content..."}) + "\n"
        try:
            for book_id in book_ids:
                chunks_result = supabase.table("child_chunks").select(
                    "id, text, parent_id, book_id, paragraph_index, page_number, parent_chunks(chapter_title, section_title), books(title)"
                ).eq("book_id", book_id).limit(10).execute()
                
                if chunks_result.data:
                    formatted_chunks = []
                    for chunk in chunks_result.data:
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
                    break  # Found chunks, no need to check other books
        except Exception as e:
            print(f"⚠️ Fallback chunk retrieval failed: {str(e)}")
        
        if not chunks:
            yield json.dumps({"type": "error", "message": "No content found in this book. The book may still be processing or may not have any readable content."}) + "\n"
            return
    
    yield json.dumps({"type": "thinking", "step": "Enhancing chunks with parent context..."}) + "\n"
    corrections = get_relevant_corrections(user_id, chat_message.message, chat_message.book_id, limit=3)
    corrections_context = build_corrections_context(corrections) if corrections else ""
    chunks = get_parent_context_for_chunks(chunks, supabase)
    
    yield json.dumps({"type": "thinking", "step": "Building context with citations..."}) + "\n"
    context_parts = []
    chunk_map_reverse = {}
    sources = []
    source_set = set()
    
    for chunk in chunks:
        chunk_id = chunk.get("id")
        chunk_uuid = str(chunk_id) if chunk_id else ""
        persistent_id = generate_chunk_id(chunk_uuid) if chunk_uuid else f"#chk_unknown_{len(chunk_map_reverse)}"
        chunk_map_reverse[persistent_id] = chunk_uuid
        
        context_text = chunk.get("context_text") or chunk.get("parent_text") or chunk.get("text", "")
        book_title = chunk.get("book_title") or chunk.get("books", {}).get("title") or "Unknown Book"
        chapter = chunk.get("chapter_title") or (chunk.get("parent_chunks") or {}).get("chapter_title") or ""
        section = chunk.get("section_title") or (chunk.get("parent_chunks") or {}).get("section_title") or ""
        
        source_parts = [book_title]
        if chapter:
            source_parts.append(chapter)
        if section and section != chapter:
            source_parts.append(section)
        
        source = ", ".join(source_parts)
        source_key = f"{book_title}|{chapter}|{section}"
        context_parts.append(f"{persistent_id} {context_text}")
        
        if source_key not in source_set:
            sources.append(source)
            source_set.add(source_key)
    
    context = "\n\n".join(context_parts)
    sources_list = list(set(sources))
    
    history_prefix = f"""Previous conversation context:
{conversation_context}

""" if conversation_context else ""
    
    investigator_prompt = f"""You are Zorxido, an expert AI assistant and investigator that answers questions based on the provided context from books with critical thinking and attention to detail.

{history_prefix}{corrections_context}

CORE INSTRUCTIONS:
- Your name is Zorxido. When asked about your name, always respond that you are Zorxido.
- You are designed to help users understand and explore their uploaded books.
- ALWAYS cite your sources using the persistent citation format (e.g., #chk_a1b2c3d4) that appears before each chunk in the context.

INVESTIGATOR MODE:
- You are an ACTIVE INVESTIGATOR, not just a passive summarizer.
- Don't just summarize the chunks. Look for:
  * Contradictions or conflicting information between different chunks
  * Underlying themes or patterns across chunks
  * Connections and relationships between ideas
  * Multiple perspectives on the same topic

CONFLICT DETECTION (CRITICAL):
- If the retrieved chunks offer multiple potential answers (e.g., two different dates for an event, conflicting explanations, contradictory statements), DO NOT guess.
- Explicitly list the conflict: "I found conflicting information: In #chk_xxx it says X, but in #chk_yyy it says Y."
- Ask the user to clarify which document version they trust, or if they want you to investigate further.
- This builds massive trust - users will think "Wow, it spotted a conflict I missed."

ACCURACY AND HONESTY:
- Use the context provided to answer questions. If the user asks to "summarise" or "summarize" a book, provide a comprehensive summary based on all the context provided.
- If the context doesn't contain enough information to fully answer a question, explicitly state what information is missing and answer based on what is available.
- Mention that your answer is based on the provided context.
- Stay focused on the content from the user's books. If asked about topics not in the books, politely redirect to what you can help with based on their uploaded content.

CITATION FORMAT:
- Always cite sources inline as you make claims: "According to #chk_xxx, the revenue grew..."
- For general questions like "summarise this book", use all the provided context to create a comprehensive summary with proper citations throughout.

FORMAT:
- Use structured reasoning when appropriate: explain your thought process step by step.
- If you detect conflicts, use a clear "CONFLICT DETECTED" section before proceeding.
- Be thorough but concise."""
    
    user_content = f"Context from books:\n\n{context}\n\nQuestion: {chat_message.message}"
    if conversation_context:
        user_content += f"\n\nNote: This question may reference previous conversation. Use the conversation history above for context."
    
    yield json.dumps({"type": "thinking", "step": "Generating response with GPT-4o-mini..."}) + "\n"
    
    response = client.chat.completions.create(
        model=settings.chat_model,
        messages=[
            {"role": "system", "content": investigator_prompt},
            {"role": "user", "content": user_content}
        ],
        temperature=0.7,
        stream=True
    )
    
    full_response = ""
    citation_buffer = ""
    
    yield json.dumps({"type": "thinking", "step": "Streaming response..."}) + "\n"
    
    for chunk in response:
        if chunk.choices[0].delta.content:
            content = chunk.choices[0].delta.content
            full_response += content
            citation_buffer += content
            
            # Check for complete citations in buffer
            citation_pattern = r'#chk_[a-f0-9]{8}'
            matches = list(re.finditer(citation_pattern, citation_buffer, re.IGNORECASE))
            
            for match in matches:
                citation_text = match.group(0)
                yield json.dumps({"type": "citation", "text": citation_text}) + "\n"
            
            # Keep only last 20 chars in buffer
            if len(citation_buffer) > 20:
                citation_buffer = citation_buffer[-20:]
            
            yield json.dumps({"type": "token", "content": content}) + "\n"
    
    tokens_used = None
    retrieved_chunk_ids = [chunk.get("id") for chunk in chunks if chunk.get("id")]
    
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
        "content": full_response,
        "retrieved_chunks": retrieved_chunk_ids,
        "sources": sources_list,
        "chunk_map": chunk_map_reverse,
        "tokens_used": tokens_used,
        "model_used": f"investigator_{settings.chat_model}_streaming"
    }).execute()
    
    yield json.dumps({"type": "done", "sources": sources_list, "retrieved_chunks": retrieved_chunk_ids, "chunk_map": chunk_map_reverse, "tokens_used": tokens_used}) + "\n"


@router.post("/stream")
async def chat_stream(
    chat_message: ChatMessage,
    current_user: dict = Depends(get_current_user)
):
    """
    Streaming chat endpoint with thinking steps and token-by-token streaming
    
    Returns Server-Sent Events (SSE) stream with:
    - "thinking" events: Search steps ("Searching hybrid index...", "Consulting Deep Reasoner...")
    - "token" events: Individual tokens from OpenAI stream
    - "citation" events: Citations detected in stream (#chk_xxxx)
    - "done" event: Streaming complete with metadata (sources, chunk_map, tokens_used)
    """
    # Check usage limits
    check_usage_limits(current_user, "chat")
    
    supabase = get_supabase_admin_client()
    user_id = current_user["id"]
    
    # Get user's accessible books
    if chat_message.book_ids and len(chat_message.book_ids) > 0:
        # Multi-select: use specified book IDs
        book_ids = chat_message.book_ids
    elif chat_message.book_id:
        # Legacy: single book_id (for backward compatibility)
        book_ids = [chat_message.book_id]
    else:
        # No selection: chat across all user's books
        access_result = supabase.table("user_book_access").select("book_id").eq("user_id", user_id).eq("is_visible", True).execute()
        book_ids = [access["book_id"] for access in access_result.data]
    
    if not book_ids:
        async def error_stream():
            yield json.dumps({"type": "error", "message": "No books available. Please upload a book first."}) + "\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")
    
    # For database storage: use first book_id if single selection, null if multi
    message_book_id = book_ids[0] if len(book_ids) == 1 else None
    
    user_message_lower = chat_message.message.lower()
    name_questions = ["what is your name", "who are you", "what's your name", "what are you called", "tell me your name"]
    is_name_question = any(question in user_message_lower for question in name_questions)
    
    # Meta-questions about system capabilities (books available, access, etc.)
    meta_question_keywords = [
        "what books", "which books", "how many books", "list books", "books available",
        "books do you have", "books can you", "books can i", "books can access",
        "cearte carti", "care carti", "cate carti"  # Romanian translations
    ]
    is_meta_question = any(keyword in user_message_lower for keyword in meta_question_keywords)
    
    # Handle meta-questions about system capabilities (books list, access, etc.)
    if is_meta_question:
        async def meta_stream():
            try:
                yield json.dumps({"type": "thinking", "step": "Retrieving your accessible books..."}) + "\n"
                
                # Get user's books with titles
                books_result = supabase.table("user_book_access").select("books(id, title, author, status)").eq("user_id", user_id).eq("is_visible", True).execute()
                accessible_books = []
                if books_result.data:
                    for access in books_result.data:
                        book = access.get("books")
                        if book and isinstance(book, dict):
                            accessible_books.append({
                                "title": book.get("title", "Unknown"),
                                "author": book.get("author"),
                                "status": book.get("status", "unknown")
                            })
                
                if accessible_books:
                    book_count = len(accessible_books)
                    book_list = "\n".join([f"- {book['title']}" + (f" by {book['author']}" if book.get('author') else "") for book in accessible_books[:10]])
                    if book_count > 10:
                        book_list += f"\n... and {book_count - 10} more"
                    
                    response_text = f"I have access to {book_count} book{'s' if book_count != 1 else ''}:\n\n{book_list}"
                else:
                    response_text = "You don't have any books uploaded yet. Upload a book to get started!"
                
                # Stream the response token by token
                for word in response_text.split():
                    yield json.dumps({"type": "token", "content": word + " "}) + "\n"
                
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
                    "content": response_text,
                    "retrieved_chunks": [],
                    "sources": [],
                    "chunk_map": {},
                    "tokens_used": None,
                    "model_used": "meta_question"
                }).execute()
                
                yield json.dumps({"type": "done", "sources": [], "retrieved_chunks": [], "chunk_map": {}, "tokens_used": None}) + "\n"
            except Exception as e:
                print(f"❌ Meta question error: {str(e)}")
                import traceback
                traceback.print_exc()
                yield json.dumps({"type": "error", "message": f"Error retrieving books: {str(e)}"}) + "\n"
        
        return StreamingResponse(meta_stream(), media_type="text/event-stream")
    
    # CONVERSATION MEMORY: Fetch last 3 turn pairs
    conversation_history = get_conversation_history(supabase, user_id, chat_message.book_id, limit=6)
    conversation_context = build_conversation_context(conversation_history)
    
    # QUERY REWRITE: De-reference pronouns
    client = OpenAI(api_key=settings.openai_api_key)
    search_query = await rewrite_query_with_context(chat_message.message, conversation_history, client)
    
    # Intent detection
    reasoning_intent_keywords = [
        "analyze", "analyse", "analysis", "compare", "comparison", "contrast",
        "why", "how does", "how is", "how are", "what causes", "what leads to",
        "connect", "connection", "relationship", "relate", "correlate",
        "explain why", "what is the relationship", "what is the connection",
        "difference between", "similarities between", "distinguish"
    ]
    is_reasoning_query = any(keyword in user_message_lower for keyword in reasoning_intent_keywords)
    
    # Detect action planner intent (Path D)
    action_planner_keywords = [
        "plan", "schedule", "how to", "how do", "solve", "simulate", "simulation",
        "script", "routine", "checklist", "steps", "step-by-step", "guide me",
        "create a", "make a", "build a", "design a", "implement", "methodology",
        "framework", "process", "procedure", "workflow"
    ]
    
    # Check if there's an existing artifact in conversation history (follow-up detection)
    has_existing_artifact = any(
        msg.get("artifact") for msg in conversation_history 
        if msg.get("role") == "assistant" and msg.get("artifact")
    )
    
    # Follow-up question keywords (questions about existing artifacts, not new artifact requests)
    follow_up_keywords = [
        "help with", "how do i", "what about", "what is", "explain", "tell me about",
        "day", "step", "percentage", "determine", "calculate", "figure out",
        "i need help", "i don't understand", "can you explain", "what does",
        "how does", "how is", "how are", "when should", "where do"
    ]
    
    is_follow_up_about_artifact = (
        has_existing_artifact and 
        any(keyword in user_message_lower for keyword in follow_up_keywords)
    )
    
    # Suppress Path D for follow-up questions about existing artifacts
    is_action_planner_query = (
        any(keyword in user_message_lower for keyword in action_planner_keywords) and 
        not is_reasoning_query and 
        not is_follow_up_about_artifact  # Don't trigger Path D for follow-ups
    )
    
    if is_follow_up_about_artifact:
        print(f"🔍 Follow-up detected about existing artifact. Suppressing Path D, routing to Path A/B instead.")
    
    global_intent_keywords = [
        "summarize", "summarise", "summary", "overview", 
        "what is this book about", "what is the book about", "what was the book about",
        "what's this book about", "what's the book about", "what was this book about",
        "tell me about this book", "describe this book", "describe the book",
        "what does this book cover", "what does the book cover", "book summary",
        "what is it about", "what was it about", "what's it about"
    ]
    is_global_query = any(keyword in user_message_lower for keyword in global_intent_keywords) and not is_reasoning_query and not is_action_planner_query
    
    # Debug logging for Path B detection
    if any(kw in user_message_lower for kw in ["book about", "book summary", "summarize", "overview"]):
        print(f"🔍 Path B Detection Debug:")
        print(f"   Query: '{chat_message.message}'")
        print(f"   Lower: '{user_message_lower}'")
        print(f"   book_id: {chat_message.book_id}")
        print(f"   book_ids: {book_ids}")
        print(f"   len(book_ids): {len(book_ids)}")
        print(f"   is_global_query: {is_global_query}")
        print(f"   is_reasoning_query: {is_reasoning_query}")
        print(f"   is_action_planner_query: {is_action_planner_query}")
    
    def generate_stream():
        try:
            for event in stream_chat_response(
                chat_message=chat_message,
                current_user=current_user,
                supabase=supabase,
                user_id=user_id,
                book_ids=book_ids,
                conversation_history=conversation_history,
                conversation_context=conversation_context,
                search_query=search_query,
                user_message_lower=user_message_lower,
                is_reasoning_query=is_reasoning_query,
                is_global_query=is_global_query,
                is_action_planner_query=is_action_planner_query,
                is_name_question=is_name_question
            ):
                yield event
        except Exception as e:
            print(f"❌ Stream error: {str(e)}")
            import traceback
            traceback.print_exc()
            yield json.dumps({"type": "error", "message": f"Stream error: {str(e)}"}) + "\n"
    
    return StreamingResponse(generate_stream(), media_type="text/event-stream")

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
