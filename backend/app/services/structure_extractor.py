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

def extract_structure(text: str, title: str = None, author: str = None) -> Dict[str, Any]:
    """
    Extract hierarchical structure from text using GPT-4o-mini
    
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
  }
}

The top-level key MUST be "document". Do not use any other key name."""

    user_prompt = f"""Extract the structure from this text and convert it to the required JSON format.

{"Title: " + title if title else ""}
{"Author: " + author if author else ""}

Text (first 50,000 characters):
{text[:50000]}"""  # Limit to ~50K chars to avoid token limits

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
