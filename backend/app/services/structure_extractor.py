"""
Structure extraction service using GPT-4o-mini
Converts plain text to hierarchical JSON structure
Uses rolling chunk processing for long books with true cursor-based chunking
"""
from openai import OpenAI
from app.config import settings
import json
import re
from typing import Dict, Any, Tuple

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

def get_safe_chunk_boundary(text: str, start_pos: int, target_size: int, text_length: int) -> Tuple[int, str]:
    """
    Get a safe chunk boundary at or near target_size, splitting at paragraph boundaries.
    
    Args:
        text: Full text
        start_pos: Starting position for this chunk
        target_size: Target chunk size in characters (e.g., 40K)
        text_length: Total length of text
    
    Returns:
        Tuple of (end_position, chunk_text)
    """
    end_pos = min(start_pos + target_size, text_length)
    
    # If we're at the end, return everything
    if end_pos >= text_length:
        return (text_length, text[start_pos:text_length])
    
    # Try to find a safe boundary (double newline) within the last 10% of the chunk
    search_start = max(start_pos + int(target_size * 0.9), start_pos)
    search_end = end_pos
    
    # Find last double newline before end_pos
    last_double_newline = text.rfind('\n\n', search_start, search_end)
    
    if last_double_newline > start_pos:
        # Found a safe boundary
        end_pos = last_double_newline + 2  # Include the \n\n
    else:
        # No double newline found, look for single newline
        last_newline = text.rfind('\n', search_start, search_end)
        if last_newline > start_pos:
            end_pos = last_newline + 1  # Include the \n
    
    chunk_text = text[start_pos:end_pos]
    return (end_pos, chunk_text)

def repair_truncated_json(json_str: str) -> str:
    """
    Attempt to repair truncated JSON by closing open strings, arrays, and objects.
    
    Args:
        json_str: Potentially truncated JSON string
    
    Returns:
        Repaired JSON string (may still be invalid)
    """
    if not json_str or not json_str.strip():
        return json_str
    
    # Count open/close brackets and braces
    open_braces = json_str.count('{')
    close_braces = json_str.count('}')
    open_brackets = json_str.count('[')
    close_brackets = json_str.count(']')
    
    result = json_str
    
    # If we're in the middle of a string, try to close it
    # Find the last unclosed quote (but not escaped)
    in_string = False
    escape_next = False
    last_quote_pos = -1
    
    for i, char in enumerate(json_str):
        if escape_next:
            escape_next = False
            continue
        if char == '\\':
            escape_next = True
            continue
        if char == '"':
            in_string = not in_string
            if in_string:
                last_quote_pos = i
    
    # If we're in a string, close it
    if in_string:
        # Find where the string likely ends (before next comma, bracket, or brace)
        # Or just close it at the end
        result = json_str + '"'
    
    # Close arrays
    while open_brackets > close_brackets:
        result += ']'
        close_brackets += 1
    
    # Close objects
    while open_braces > close_braces:
        result += '}'
        close_braces += 1
    
    return result

def find_paragraph_position(text: str, paragraph: str, search_start: int = 0) -> int:
    """
    Find the end position of a paragraph in the original text.
    
    Args:
        text: Full text
        paragraph: Paragraph text to find
        search_start: Position to start searching from
    
    Returns:
        End position of the paragraph, or -1 if not found
    """
    if not paragraph:
        return -1
    
    # Try exact match first
    pos = text.find(paragraph, search_start)
    if pos >= 0:
        return pos + len(paragraph)
    
    # Try with last 200 characters (in case of whitespace differences)
    para_end = paragraph[-200:] if len(paragraph) > 200 else paragraph
    pos = text.find(para_end, search_start)
    if pos >= 0:
        # Found the end marker, calculate full paragraph end
        # Try to find where this paragraph actually ends
        potential_end = pos + len(para_end)
        # Look for next paragraph boundary
        next_boundary = text.find('\n\n', potential_end, potential_end + 100)
        if next_boundary > potential_end:
            return next_boundary
        return potential_end
    
    return -1

def extract_structure(text: str, title: str = None, author: str = None) -> Dict[str, Any]:
    """
    Extract hierarchical structure from text using GPT-4o-mini
    Uses true rolling chunk processing: each chunk starts where the previous one ended.
    
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

CRITICAL INSTRUCTIONS FOR CHUNK PROCESSING:
- Only process COMPLETE paragraphs. If the text ends mid-sentence or mid-paragraph, DO NOT include that incomplete fragment.
- Return the EXACT TEXT of the last complete paragraph you processed in "last_processed_paragraph" field.
- If the text ends with incomplete text (mid-sentence or mid-paragraph), set "stopped_early" to true and indicate this.
- The "last_processed_paragraph" is CRITICAL - it tells us exactly where to start the next chunk.

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
  "last_processed_paragraph": "The EXACT text of the last complete paragraph you processed, ending here...",
  "stopped_early": false,
  "next_chunk_start_hint": "First few words or sentence of what should come next (if stopped_early is true)"
}

The top-level key MUST be "document". Include "last_processed_paragraph", "stopped_early", and "next_chunk_start_hint" for chunk continuity."""

    # GPT-4o-mini has 128K token context window (~500K characters)
    # For long books, use rolling chunk processing with 40K char chunks
    chunk_size = 40000  # 40K characters per chunk (small to avoid hallucinations)
    
    text_length = len(text)
    
    if text_length > chunk_size:
        # Use true rolling chunk processing for long books
        print(f"📚 Book is long ({text_length} chars). Processing with rolling cursor (40K chunks)...")
        
        accumulated_chapters = {}  # Track chapters across chunks (keyed by chapter title)
        current_pos = 0  # True rolling cursor - start at beginning
        chunk_number = 0
        
        while current_pos < text_length:
            chunk_number += 1
            print(f"\n📖 Processing chunk {chunk_number} starting at char {current_pos}...")
            
            # Get a safe chunk boundary (splits at paragraph boundaries)
            end_pos, chunk_text = get_safe_chunk_boundary(text, current_pos, chunk_size, text_length)
            
            print(f"   Chunk size: {len(chunk_text)} chars (positions {current_pos}-{end_pos})")
            
            # Determine if this might be the last chunk
            is_last_chunk = end_pos >= text_length
            
            user_prompt = f"""Extract the structure from this text block and convert it to the required JSON format.

{"Title: " + title if title else ""}
{"Author: " + author if author else ""}

IMPORTANT: This is chunk {chunk_number} of a larger book. The text may be incomplete at the end.

CRITICAL INSTRUCTIONS:
1. Only process COMPLETE paragraphs. If the text ends mid-sentence or mid-paragraph, DO NOT include that incomplete fragment.
2. Return the EXACT TEXT of the last complete paragraph you processed in "last_processed_paragraph" field.
3. If the text ends with incomplete text (you stopped early because content was cut off), set "stopped_early" to true.
4. If "stopped_early" is true, provide "next_chunk_start_hint" with the first few words of what should come next.
5. If this chunk starts mid-chapter, merge sections with the previous chunk's content if appropriate.
6. Return all chapters and sections you can identify in this chunk.

{"THIS IS THE LAST CHUNK - process everything to the end." if is_last_chunk else "This is NOT the last chunk - stop at the last complete paragraph."}

Text:
{chunk_text}"""
            
            try:
                max_retries = 2
                retry_count = 0
                chunk_json = None
                raw_response = None
                
                while retry_count <= max_retries:
                    try:
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
                        
                        # Try to parse JSON
                        try:
                            chunk_json = json.loads(raw_response)
                            break  # Success!
                        except json.JSONDecodeError as json_err:
                            print(f"   ⚠️ JSON decode error (attempt {retry_count + 1}/{max_retries + 1}): {str(json_err)}")
                            
                            # Try to repair truncated JSON
                            if retry_count == 0:
                                print(f"   🔧 Attempting to repair truncated JSON...")
                                repaired_json = repair_truncated_json(raw_response)
                                try:
                                    chunk_json = json.loads(repaired_json)
                                    print(f"   ✅ Successfully repaired JSON")
                                    break
                                except json.JSONDecodeError:
                                    print(f"   ❌ Could not repair JSON, will retry with smaller chunk")
                            
                            # If repair failed or we've already tried, retry with smaller chunk
                            if retry_count < max_retries:
                                # Reduce chunk size by 20% and try again
                                print(f"   🔄 Retrying with smaller chunk (reducing by 20%)...")
                                smaller_end_pos = current_pos + int(len(chunk_text) * 0.8)
                                # Find safe boundary
                                smaller_end_pos, chunk_text = get_safe_chunk_boundary(text, current_pos, int(chunk_size * 0.8), text_length)
                                end_pos = smaller_end_pos
                                user_prompt = f"""Extract the structure from this text block and convert it to the required JSON format.

{"Title: " + title if title else ""}
{"Author: " + author if author else ""}

IMPORTANT: This is chunk {chunk_number} of a larger book. The text may be incomplete at the end.

CRITICAL INSTRUCTIONS:
1. Only process COMPLETE paragraphs. If the text ends mid-sentence or mid-paragraph, DO NOT include that incomplete fragment.
2. Return the EXACT TEXT of the last complete paragraph you processed in "last_processed_paragraph" field.
3. If the text ends with incomplete text (you stopped early because content was cut off), set "stopped_early" to true.
4. If "stopped_early" is true, provide "next_chunk_start_hint" with the first few words of what should come next.
5. If this chunk starts mid-chapter, merge sections with the previous chunk's content if appropriate.
6. Return all chapters and sections you can identify in this chunk.
7. CRITICAL: Ensure your JSON response is complete and valid. Do not truncate strings mid-word.

{"THIS IS THE LAST CHUNK - process everything to the end." if is_last_chunk else "This is NOT the last chunk - stop at the last complete paragraph."}

Text:
{chunk_text}"""
                                retry_count += 1
                                continue
                            else:
                                # Last attempt failed, log and raise
                                print(f"   ❌ JSON decode failed after {max_retries + 1} attempts")
                                print(f"   📄 Raw response (first 1000 chars): {raw_response[:1000]}")
                                print(f"   📄 Raw response (last 500 chars): {raw_response[-500:]}")
                                raise
                    
                    except Exception as api_err:
                        if retry_count < max_retries:
                            print(f"   ⚠️ API error (attempt {retry_count + 1}): {str(api_err)}")
                            retry_count += 1
                            continue
                        else:
                            raise
                
                if chunk_json is None:
                    raise Exception("Failed to get valid JSON response after retries")
                
                # Extract last processed paragraph for rolling cursor
                last_para = chunk_json.get("last_processed_paragraph", "")
                stopped_early = chunk_json.get("stopped_early", False)
                next_hint = chunk_json.get("next_chunk_start_hint", "")
                
                # Find where this paragraph ends in the original text
                next_pos = end_pos  # Default: use pre-chunked boundary
                
                if last_para:
                    print(f"   ✅ Last processed paragraph (first 80 chars): {last_para[:80]}...")
                    
                    # Find the paragraph in the original text to get exact position
                    para_end_pos = find_paragraph_position(text, last_para, current_pos)
                    
                    if para_end_pos > current_pos:
                        # Found it! Start next chunk after this paragraph
                        # Look for the start of the next paragraph
                        next_para_start = text.find('\n\n', para_end_pos, para_end_pos + 200)
                        if next_para_start > para_end_pos:
                            next_pos = next_para_start + 2  # Skip the \n\n
                        else:
                            next_pos = para_end_pos
                        
                        print(f"   ✅ Found paragraph end at char {para_end_pos}, next chunk starts at char {next_pos}")
                    else:
                        print(f"   ⚠️ Could not find exact paragraph position, using chunk boundary")
                else:
                    print(f"   ⚠️ No last_processed_paragraph returned, using chunk boundary")
                
                if stopped_early:
                    print(f"   ⚠️ LLM stopped early - last part of chunk was out of context")
                    if next_hint:
                        print(f"   💡 Next chunk hint: {next_hint[:80]}...")
                else:
                    print(f"   ✅ LLM processed complete chunk")
                
                # Extract chapters from this chunk
                if "document" in chunk_json:
                    chunk_doc = chunk_json["document"]
                    if "chapters" in chunk_doc:
                        # Merge chapters (handle continuation from previous chunk)
                        for chapter in chunk_doc["chapters"]:
                            chapter_title = chapter.get("chapter_title", "Untitled Chapter")
                            
                            # Check if this chapter already exists (continuing from previous chunk)
                            if chapter_title in accumulated_chapters:
                                # Merge sections - append new sections to existing chapter
                                new_sections = chapter.get("sections", [])
                                accumulated_chapters[chapter_title]["sections"].extend(new_sections)
                                print(f"   📝 Merged {len(new_sections)} sections into existing chapter: {chapter_title}")
                            else:
                                # New chapter
                                accumulated_chapters[chapter_title] = chapter
                                print(f"   ➕ New chapter: {chapter_title} ({len(chapter.get('sections', []))} sections)")
                    
                    chunk_chapter_count = len(chunk_doc.get('chapters', []))
                    print(f"   ✅ Chunk {chunk_number} processed: found {chunk_chapter_count} chapters")
                
                # Move to next chunk position (true rolling cursor)
                previous_pos = current_pos
                current_pos = next_pos
                
                # Safety check: ensure we're making progress
                if current_pos <= previous_pos:
                    print(f"   ❌ Error: cursor didn't advance ({previous_pos} -> {current_pos}). Breaking to avoid infinite loop.")
                    current_pos = end_pos  # Force advance
                    if current_pos >= text_length:
                        break
                    
            except json.JSONDecodeError as e:
                print(f"   ❌ JSON decode error after all retries: {str(e)}")
                if raw_response:
                    print(f"   📄 Raw response length: {len(raw_response)} chars")
                    print(f"   📄 Raw response (first 1000 chars): {raw_response[:1000]}")
                    print(f"   📄 Raw response (last 500 chars): {raw_response[-500:]}")
                # Move forward anyway to avoid getting stuck
                current_pos = end_pos
                continue
            except Exception as e:
                print(f"   ❌ Error processing chunk {chunk_number}: {str(e)}")
                import traceback
                traceback.print_exc()
                # Move forward anyway to avoid getting stuck
                current_pos = end_pos
                continue
        
        # Convert accumulated chapters to list (filter out any empty/invalid chapters)
        all_chapters = [ch for ch in accumulated_chapters.values() if isinstance(ch, dict) and ch.get("sections")]
        
        # Return merged structure
        structured_json = {
            "document": {
                "title": title,
                "author": author,
                "chapters": all_chapters
            }
        }
        print(f"\n✅ Structure extracted successfully: {len(all_chapters)} total chapters from {chunk_number} chunks")
        return structured_json
    
    # Short book - process directly
    user_prompt = f"""Extract the structure from this text and convert it to the required JSON format.

{"Title: " + title if title else ""}
{"Author: " + author if author else ""}

Text ({len(text)} characters):
{text}"""

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