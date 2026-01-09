"""
Structure extraction service using GPT-4o-mini
Converts plain text to hierarchical JSON structure
"""
from openai import OpenAI
from app.config import settings
import json
from typing import Dict, Any

client = OpenAI(api_key=settings.openai_api_key)

# JSON Schema for document structure
DOCUMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "document": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "author": {"type": "string"},
                "chapters": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "chapter_title": {"type": "string"},
                            "sections": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "section_title": {"type": "string"},
                                        "paragraphs": {
                                            "type": "array",
                                            "items": {"type": "string"}
                                        }
                                    },
                                    "required": ["paragraphs"]
                                }
                            }
                        },
                        "required": ["sections"]
                    }
                }
            },
            "required": ["chapters"]
        }
    },
    "required": ["document"]
}

def prechunk_text(text: str, chunk_size: int = 40000, overlap: int = 1000) -> list:
    """
    Pre-chunk text into manageable blocks using safe boundaries.
    
    Args:
        text: Full text to chunk
        chunk_size: Target chunk size in characters (default: 40K)
        overlap: Overlap between chunks in characters (default: 1K)
    
    Returns:
        List of (start_pos, end_pos, chunk_text) tuples
    """
    chunks = []
    current_pos = 0
    text_length = len(text)
    
    while current_pos < text_length:
        # Calculate end position for this chunk
        end_pos = min(current_pos + chunk_size, text_length)
        
        # If not at the end, find the nearest safe boundary (double newline)
        if end_pos < text_length:
            # Look for double newline within the last 10% of the chunk
            search_start = max(current_pos + int(chunk_size * 0.9), current_pos)
            search_end = end_pos
            
            # Find last double newline before end_pos
            last_double_newline = text.rfind('\n\n', search_start, search_end)
            
            if last_double_newline > current_pos:
                # Found a safe boundary
                end_pos = last_double_newline + 2  # Include the \n\n
            else:
                # No double newline found, look for single newline
                last_newline = text.rfind('\n', search_start, search_end)
                if last_newline > current_pos:
                    end_pos = last_newline + 1  # Include the \n
        
        # Extract chunk
        chunk_text = text[current_pos:end_pos]
        chunks.append((current_pos, end_pos, chunk_text))
        
        # Move to next chunk position (with overlap)
        if end_pos >= text_length:
            break
        current_pos = max(current_pos + 1, end_pos - overlap)
    
    return chunks

def extract_structure(text: str, title: str = None, author: str = None) -> Dict[str, Any]:
    """
    Extract hierarchical structure from text using GPT-4o-mini
    Uses rolling chunk processing for long books.
    
    Args:
        text: Plain text extracted from PDF/EPUB
        title: Optional book title
        author: Optional book author
    
    Returns:
        Structured JSON with Document -> Chapters -> Sections -> Paragraphs
    """
    system_prompt = """You are a document structure extraction expert. Analyze the provided text and extract its hierarchical structure.

Rules:
1. Identify chapters by looking for patterns like "Chapter X", numbered sections, ALL CAPS headings, or major topic breaks
2. Identify sections within chapters (subheadings, numbered subsections, or topic shifts)
3. Group paragraphs under their respective sections
4. Never split paragraphs by token count - only by semantic meaning
5. Preserve the natural document hierarchy
6. If a paragraph is very long, you may split it at natural sentence boundaries, but preserve context
7. CRITICAL: Only process complete paragraphs. If the text ends mid-sentence or mid-paragraph, do NOT include that incomplete fragment.
8. Return the last complete paragraph you processed so we know where you stopped.

CRITICAL: You MUST return a JSON object with this EXACT structure:
{
  "document": {
    "title": "Book Title",
    "author": "Author Name",
    "chapters": [
      {
        "chapter_title": "Chapter Title",
        "sections": [
          {
            "section_title": "Section Title",
            "paragraphs": ["paragraph text 1", "paragraph text 2", ...]
          }
        ]
      }
    ]
  },
  "last_processed_paragraph": "The last complete paragraph you processed ends here...",
  "processed_up_to_char": 0
}

The top-level key MUST be "document". Include "last_processed_paragraph" and "processed_up_to_char" to track progress."""

    # GPT-4o-mini has 128K token context window (~500K characters)
    # For long books, use rolling chunk processing
    chunk_size = 40000  # 40K characters per chunk
    overlap = 1000  # 1K character overlap
    
    if len(text) > chunk_size:
        # Use rolling chunk processing for long books
        print(f"📚 Book is long ({len(text)} chars). Processing in rolling chunks...")
        
        # Step 1: Pre-chunk the text into safe blocks
        chunks = prechunk_text(text, chunk_size, overlap)
        print(f"✅ Pre-chunked into {len(chunks)} blocks")
        
        # Step 2: Process each chunk sequentially with rolling cursor
        all_chapters = []
        accumulated_chapters = {}  # Track chapters across chunks
        
        for chunk_idx, (start_pos, end_pos, chunk_text) in enumerate(chunks):
            print(f"📖 Processing chunk {chunk_idx + 1}/{len(chunks)} (chars {start_pos}-{end_pos}, {len(chunk_text)} chars)...")
            
            user_prompt = f"""Extract the structure from this text block and convert it to the required JSON format.

{"Title: " + title if title else ""}
{"Author: " + author if author else ""}

IMPORTANT: This is chunk {chunk_idx + 1} of {len(chunks)}. The text may be incomplete (it's a portion of a larger book).

CRITICAL INSTRUCTIONS:
1. Only process COMPLETE paragraphs. If the text ends mid-sentence or mid-paragraph, DO NOT include that incomplete fragment.
2. Return the last complete paragraph you processed in "last_processed_paragraph" so we know where you stopped.
3. If this chunk starts mid-chapter, merge sections with the previous chunk's content if appropriate.
4. Return all chapters and sections you can identify in this chunk.

Text:
{chunk_text}"""
            
            try:
                response = client.chat.completions.create(
                    model=settings.structure_model,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.1
                )
                
                raw_response = response.choices[0].message.content
                chunk_json = json.loads(raw_response)
                
                # Extract last processed paragraph for rolling cursor
                last_paragraph = chunk_json.get("last_processed_paragraph", "")
                
                # Find where we actually stopped in the original text
                if last_paragraph and chunk_idx + 1 < len(chunks):
                    # Find this paragraph in the chunk text
                    para_pos = chunk_text.rfind(last_paragraph)
                    if para_pos >= 0:
                        actual_stop_pos = start_pos + para_pos + len(last_paragraph)
                        print(f"✅ Processed up to char {actual_stop_pos} (last paragraph: {last_paragraph[:50]}...)")
                
                # Extract chapters from this chunk
                if "document" in chunk_json:
                    chunk_doc = chunk_json["document"]
                    if "chapters" in chunk_doc:
                        # Merge chapters (handle continuation from previous chunk)
                        for chapter in chunk_doc["chapters"]:
                            chapter_title = chapter.get("chapter_title", "Untitled Chapter")
                            
                            # Check if this chapter already exists (continuing from previous chunk)
                            if chapter_title in accumulated_chapters:
                                # Merge sections
                                existing_sections = accumulated_chapters[chapter_title].get("sections", [])
                                new_sections = chapter.get("sections", [])
                                accumulated_chapters[chapter_title]["sections"].extend(new_sections)
                            else:
                                # New chapter
                                accumulated_chapters[chapter_title] = chapter
                    
                    print(f"✅ Chunk {chunk_idx + 1} processed: found {len(chunk_doc.get('chapters', []))} chapters")
                
            except Exception as e:
                print(f"❌ Error processing chunk {chunk_idx + 1}: {str(e)}")
                import traceback
                traceback.print_exc()
                # Continue with next chunk instead of failing completely
                continue
        
        # Convert accumulated chapters to list
        all_chapters = list(accumulated_chapters.values())
        
        # Return merged structure
        structured_json = {
            "document": {
                "title": title,
                "author": author,
                "chapters": all_chapters
            }
        }
        print(f"✅ Structure extracted successfully: {len(all_chapters)} total chapters from {len(chunks)} chunks")
        return structured_json
    
    # Short book - process directly
    processed_text = text

    try:
        print(f"🔍 Calling GPT-4o-mini for structure extraction (text length: {len(text)} chars)...")
        
        response = client.chat.completions.create(
            model=settings.structure_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1  # Low temperature for consistent structure
        )
        
        raw_response = response.choices[0].message.content
        print(f"📥 Raw GPT response (first 500 chars): {raw_response[:500]}")
        
        structured_json = json.loads(raw_response)
        
        # Validate structure
        if "document" not in structured_json:
            print(f"❌ Invalid structure received. Keys: {list(structured_json.keys())}")
            print(f"❌ Full response: {raw_response[:1000]}")
            
            # Try to fix common issues
            # Sometimes GPT returns the structure directly without "document" wrapper
            if "chapters" in structured_json:
                print("⚠️ Found 'chapters' at top level, wrapping in 'document' key...")
                structured_json = {"document": structured_json}
            elif "title" in structured_json or "author" in structured_json:
                print("⚠️ Found document fields at top level, wrapping in 'document' key...")
                structured_json = {"document": structured_json}
            else:
                raise ValueError(f"Invalid structure: missing 'document' key. Received keys: {list(structured_json.keys())}")
        
        # Validate document structure
        if not isinstance(structured_json["document"], dict):
            raise ValueError("Invalid structure: 'document' must be an object")
        
        if "chapters" not in structured_json["document"]:
            raise ValueError("Invalid structure: missing 'chapters' in document")
        
        if not isinstance(structured_json["document"]["chapters"], list):
            raise ValueError("Invalid structure: 'chapters' must be an array")
        
        print(f"✅ Structure extracted successfully: {len(structured_json['document']['chapters'])} chapters")
        return structured_json
        
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {str(e)}")
        print(f"❌ Raw response: {raw_response[:1000] if 'raw_response' in locals() else 'N/A'}")
        raise Exception(f"Failed to parse JSON response from GPT: {str(e)}")
    except Exception as e:
        print(f"❌ Structure extraction error: {str(e)}")
        raise Exception(f"Error extracting structure: {str(e)}")
