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
    
    Args:
        chunks: List of child chunks (from search)
        supabase: Supabase client
    
    Returns:
        List of chunks with parent_text included (uses parent if available, else child)
    """
    enhanced_chunks = []
    seen_parent_ids = set()  # Deduplicate parent chunks
    
    for chunk in chunks:
        parent_id = chunk.get("parent_id")
        chunk_id = chunk.get("id")
        
        # If we already have parent_text from hybrid search, use it
        if chunk.get("parent_text"):
            enhanced_chunk = chunk.copy()
            # Use parent text for context, but keep child text for reference
            enhanced_chunk["context_text"] = chunk.get("parent_text", chunk.get("text"))
            enhanced_chunk["reference_text"] = chunk.get("text")  # Keep original for citations
            enhanced_chunks.append(enhanced_chunk)
            continue
        
        # Fetch parent chunk if not already seen
        if parent_id and parent_id not in seen_parent_ids:
            try:
                parent_result = supabase.table("parent_chunks").select(
                    "id, full_text, chapter_title, section_title"
                ).eq("id", parent_id).single().execute()
                
                if parent_result.data:
                    parent = parent_result.data
                    seen_parent_ids.add(parent_id)
                    
                    # Use parent text for context
                    enhanced_chunk = chunk.copy()
                    enhanced_chunk["context_text"] = parent.get("full_text", chunk.get("text"))
                    enhanced_chunk["reference_text"] = chunk.get("text")  # Keep original for citations
                    enhanced_chunk["chapter_title"] = parent.get("chapter_title", chunk.get("chapter_title", ""))
                    enhanced_chunk["section_title"] = parent.get("section_title", chunk.get("section_title", ""))
                    enhanced_chunks.append(enhanced_chunk)
                else:
                    # Fallback to child chunk if parent not found
                    enhanced_chunk = chunk.copy()
                    enhanced_chunk["context_text"] = chunk.get("text")
                    enhanced_chunk["reference_text"] = chunk.get("text")
                    enhanced_chunks.append(enhanced_chunk)
            except Exception as e:
                print(f"⚠️ Failed to fetch parent chunk {parent_id}: {str(e)}")
                # Fallback to child chunk
                enhanced_chunk = chunk.copy()
                enhanced_chunk["context_text"] = chunk.get("text")
                enhanced_chunk["reference_text"] = chunk.get("text")
                enhanced_chunks.append(enhanced_chunk)
        else:
            # No parent or already seen, use child chunk as-is
            enhanced_chunk = chunk.copy()
            enhanced_chunk["context_text"] = chunk.get("text")
            enhanced_chunk["reference_text"] = chunk.get("text")
            enhanced_chunks.append(enhanced_chunk)
    
    return enhanced_chunks
