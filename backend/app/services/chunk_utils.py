"""
Utility functions for chunk operations
Includes persistent chunk ID generation and parent context retrieval
"""
import hashlib
from typing import Dict, List, Optional

def generate_chunk_id(chunk_uuid: str) -> str:
    """
    Generate a short, persistent chunk ID from UUID
    Format: #chk_xxxx (8 hex characters from hash)
    
    Args:
        chunk_uuid: Full UUID of the chunk
    
    Returns:
        Short chunk ID like "#chk_a1b2c3d4"
    """
    # Hash the UUID to get consistent 8-character ID
    hash_obj = hashlib.md5(chunk_uuid.encode())
    short_id = hash_obj.hexdigest()[:8]
    return f"#chk_{short_id}"

def get_parent_context_for_chunks(chunks: List[Dict], supabase) -> List[Dict]:
    """
    Enhance chunks with parent chunk context
    Searches child chunks but returns parent chunk text for better context
    
    Strategy: Fetch all unique parents first, then enhance each child chunk with its parent's full text
    
    Args:
        chunks: List of child chunks (from search)
        supabase: Supabase client
    
    Returns:
        List of chunks with context_text (parent full text) and reference_text (child text)
    """
    enhanced_chunks = []
    
    # First pass: Collect all unique parent IDs
    parent_ids = set()
    parent_cache = {}  # Cache fetched parents
    
    for chunk in chunks:
        parent_id = chunk.get("parent_id")
        if parent_id and parent_id not in parent_ids:
            parent_ids.add(parent_id)
    
    # Batch fetch all unique parents
    if parent_ids:
        try:
            parents_result = supabase.table("parent_chunks").select(
                "id, full_text, chapter_title, section_title"
            ).in_("id", list(parent_ids)).execute()
            
            # Cache parents by ID
            for parent in parents_result.data or []:
                parent_cache[parent["id"]] = parent
        except Exception as e:
            print(f"⚠️ Failed to batch fetch parent chunks: {str(e)}")
            parent_cache = {}
    
    # Second pass: Enhance each child chunk with parent context
    for chunk in chunks:
        enhanced_chunk = chunk.copy()
        parent_id = chunk.get("parent_id")
        
        # If we already have parent_text from hybrid search, use it
        if chunk.get("parent_text"):
            enhanced_chunk["context_text"] = chunk.get("parent_text", chunk.get("text"))
            enhanced_chunk["reference_text"] = chunk.get("text")  # Keep original for citations
            enhanced_chunks.append(enhanced_chunk)
            continue
        
        # Use cached parent if available
        if parent_id and parent_id in parent_cache:
            parent = parent_cache[parent_id]
            # Use parent's full text for context (better flow for LLM)
            enhanced_chunk["context_text"] = parent.get("full_text", chunk.get("text"))
            enhanced_chunk["reference_text"] = chunk.get("text")  # Keep child text for reference
            enhanced_chunk["chapter_title"] = parent.get("chapter_title", chunk.get("chapter_title", ""))
            enhanced_chunk["section_title"] = parent.get("section_title", chunk.get("section_title", ""))
            enhanced_chunks.append(enhanced_chunk)
        else:
            # No parent available, use child chunk as-is
            enhanced_chunk["context_text"] = chunk.get("text")
            enhanced_chunk["reference_text"] = chunk.get("text")
            enhanced_chunks.append(enhanced_chunk)
    
    return enhanced_chunks
