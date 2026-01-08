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

Output format: JSON with structure: Document -> Chapters -> Sections -> Paragraphs
Each chapter should have a chapter_title and an array of sections.
Each section should have a section_title and an array of paragraphs."""

    user_prompt = f"""Extract the structure from this text and convert it to the required JSON format.

{"Title: " + title if title else ""}
{"Author: " + author if author else ""}

Text:
{text[:50000]}"""  # Limit to ~50K chars to avoid token limits

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
        
        structured_json = json.loads(response.choices[0].message.content)
        
        # Validate structure
        if "document" not in structured_json:
            raise ValueError("Invalid structure: missing 'document' key")
        
        return structured_json
        
    except json.JSONDecodeError as e:
        raise Exception(f"Failed to parse JSON response from GPT: {str(e)}")
    except Exception as e:
        raise Exception(f"Error extracting structure: {str(e)}")
