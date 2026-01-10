"""
Corrections service for active learning loop
Queries user corrections before answering similar questions
"""
from app.database import get_supabase_admin_client
from app.services.embedding_service import generate_embedding
from typing import List, Optional, Dict

def get_relevant_corrections(
    user_id: str,
    query_text: str,
    book_id: Optional[str] = None,
    limit: int = 3
) -> List[Dict]:
    """
    Get relevant corrections for a query based on semantic similarity
    
    Args:
        user_id: User ID
        query_text: User's query text
        book_id: Optional book ID to filter corrections
        limit: Maximum number of corrections to return
    
    Returns:
        List of relevant corrections (most relevant first)
    """
    supabase = get_supabase_admin_client()
    
    # Generate query embedding
    try:
        query_embedding = generate_embedding(query_text)
    except Exception as e:
        print(f"⚠️ Failed to generate embedding for corrections query: {str(e)}")
        # Fallback: keyword search
        query_embedding = None
    
    # Build query
    query = supabase.table("chat_corrections").select("*").eq("user_id", user_id)
    
    if book_id:
        query = query.eq("book_id", book_id)
    
    # Get recent corrections (last 50)
    result = query.order("created_at", desc=True).limit(50).execute()
    
    if not result.data:
        return []
    
    corrections = result.data
    
    # If we have embeddings, rank by similarity to query
    if query_embedding:
        # TODO: Add embedding column to chat_corrections for semantic search
        # For now, simple keyword matching on original_message
        query_lower = query_text.lower()
        ranked_corrections = []
        
        for correction in corrections:
            original_message = (correction.get("original_message") or "").lower()
            incorrect_text = (correction.get("incorrect_text") or "").lower()
            correct_text = (correction.get("correct_text") or "").lower()
            
            # Simple keyword matching score
            score = 0
            if query_lower in original_message:
                score += 10
            if any(word in original_message for word in query_lower.split()):
                score += 5
            if query_lower in incorrect_text:
                score += 8
            if query_lower in correct_text:
                score += 3
            
            if score > 0:
                ranked_corrections.append((score, correction))
        
        # Sort by score descending
        ranked_corrections.sort(key=lambda x: x[0], reverse=True)
        return [corr for _, corr in ranked_corrections[:limit]]
    
    # Fallback: return most recent
    return corrections[:limit]

def save_correction(
    user_id: str,
    original_message: str,
    original_response: str,
    original_chunks: List[str],
    incorrect_text: str,
    correct_text: str,
    user_feedback: Optional[str] = None,
    book_id: Optional[str] = None,
    chunk_id: Optional[str] = None
) -> str:
    """
    Save a user correction
    
    Args:
        user_id: User ID
        original_message: Original user message
        original_response: Original AI response (the incorrect one)
        original_chunks: List of chunk IDs used in original response
        incorrect_text: The part of the response that was wrong
        correct_text: What the user says it should be
        user_feedback: Additional context from user
        book_id: Optional book ID
        chunk_id: Optional chunk ID that was incorrect
    
    Returns:
        Correction ID
    """
    supabase = get_supabase_admin_client()
    
    correction_data = {
        "user_id": user_id,
        "book_id": book_id,
        "chunk_id": chunk_id,
        "original_message": original_message,
        "original_response": original_response,
        "original_chunks": original_chunks,
        "incorrect_text": incorrect_text,
        "correct_text": correct_text,
        "user_feedback": user_feedback
    }
    
    result = supabase.table("chat_corrections").insert(correction_data).execute()
    
    if result.data:
        return result.data[0]["id"]
    else:
        raise Exception("Failed to save correction")

def build_corrections_context(corrections: List[Dict]) -> str:
    """
    Build a context string from corrections to inject into prompts
    
    Args:
        corrections: List of correction dictionaries
    
    Returns:
        Formatted context string with corrections
    """
    if not corrections:
        return ""
    
    context_parts = ["IMPORTANT CORRECTIONS FROM USER:"]
    
    for i, corr in enumerate(corrections, 1):
        context_parts.append(
            f"\n{i}. Original query: \"{corr.get('original_message', '')}\"\n"
            f"   What I said (WRONG): \"{corr.get('incorrect_text', '')}\"\n"
            f"   User correction: \"{corr.get('correct_text', '')}\"\n"
            f"   User feedback: \"{corr.get('user_feedback', 'None')}\""
        )
    
    context_parts.append(
        "\nINSTRUCTION: Do NOT repeat these mistakes. Use the user's corrections as guidance."
    )
    
    return "\n".join(context_parts)
