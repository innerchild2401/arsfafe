"""
Summary generation service using GPT-4o-mini
Generates chapter summaries and book-level executive summaries
"""
from openai import OpenAI
from app.config import settings
from typing import List, Optional

client = OpenAI(api_key=settings.openai_api_key)

def generate_chapter_summary(chapter_text: str, chapter_title: str = None) -> str:
    """
    Generate a concise summary for a chapter/section (3-4 sentences)
    
    Args:
        chapter_text: Full text of the chapter/section
        chapter_title: Optional chapter title for context
    
    Returns:
        Concise summary string (3-4 sentences)
    """
    prompt = f"""Generate a concise summary of this chapter/section in 3-4 sentences.
Focus on the key ideas, main arguments, and important concepts.

{"Chapter Title: " + chapter_title if chapter_title else ""}

Text:
{chapter_text[:5000]}"""  # Limit to 5K chars for chapter summary

    try:
        response = client.chat.completions.create(
            model=settings.labeling_model,  # Use gpt-4o-mini for summaries
            messages=[
                {
                    "role": "system",
                    "content": "You are a summarization expert. Generate concise, informative summaries that capture the essence of the content."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3
        )
        
        summary = response.choices[0].message.content.strip()
        return summary
        
    except Exception as e:
        # Fallback: return truncated text
        print(f"⚠️ Failed to generate chapter summary: {str(e)}")
        return chapter_text[:500] + "..." if len(chapter_text) > 500 else chapter_text

def generate_book_summary(chapter_summaries: List[str], title: str = None, author: str = None) -> str:
    """
    Generate a master executive summary from chapter summaries
    
    Args:
        chapter_summaries: List of chapter summaries
        title: Book title
        author: Book author
    
    Returns:
        Executive summary of the entire book
    """
    if not chapter_summaries:
        return "Summary not available."
    
    # Combine chapter summaries
    combined_summaries = "\n\n".join([
        f"Chapter {i+1} Summary:\n{summary}" 
        for i, summary in enumerate(chapter_summaries)
    ])
    
    # Limit total length to avoid token limits
    max_length = 10000  # ~10K chars
    if len(combined_summaries) > max_length:
        combined_summaries = combined_summaries[:max_length] + "..."
    
    prompt = f"""Combine these chapter summaries into a comprehensive Executive Summary of the entire book.

{"Title: " + title if title else ""}
{"Author: " + author if author else ""}

Instructions:
- Create a structured summary with: Introduction (overview of the book's purpose), Key Themes (main arguments and concepts), and Conclusion (overall message and takeaways)
- Synthesize the information from all chapters
- Keep it concise but comprehensive (4-6 paragraphs)
- Focus on the big picture and how chapters relate to each other

Chapter Summaries:
{combined_summaries}

Executive Summary:"""

    try:
        response = client.chat.completions.create(
            model=settings.chat_model,  # Use gpt-4o-mini for book summary
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at synthesizing information into executive summaries. Create clear, structured summaries that capture the essence of the entire book."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.4
        )
        
        summary = response.choices[0].message.content.strip()
        return summary
        
    except Exception as e:
        # Fallback: concatenate chapter summaries
        print(f"⚠️ Failed to generate book summary: {str(e)}")
        return "\n\n".join(chapter_summaries[:10])  # Return first 10 chapter summaries
