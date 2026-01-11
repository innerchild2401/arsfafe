"""
Action metadata extraction service using GPT-4o-mini
Extracts methodology tags (framework, script, derivation) from parent chunks
Used for Path D (Action Planner) to identify actionable content during ingestion
"""
from openai import OpenAI
from app.config import settings
import json
from typing import List, Dict, Optional

client = OpenAI(api_key=settings.openai_api_key)

def extract_action_metadata(text: str) -> Dict[str, any]:
    """
    Extract action metadata from a text chunk to identify methodologies.
    
    Determines if the text contains:
    - "framework": Step-by-step frameworks, methodologies, procedures
    - "script": Dialogue scripts, conversation patterns, "what to say" guides
    - "derivation": Mathematical derivations, computational steps, formulas
    
    Args:
        text: Text chunk to analyze
        
    Returns:
        Dictionary with action metadata tags:
        {
            "tags": ["framework", "script"],  # Array of applicable tags
            "confidence": 0.85,  # Confidence score (0.0-1.0)
            "description": "Brief description of the methodology type"
        }
        Returns empty dict if no action metadata found.
    """
    prompt = f"""Analyze this text to determine if it contains actionable methodologies.

Does this text contain:
1. **Framework** - Step-by-step frameworks, methodologies, procedures, routines, or processes?
2. **Script** - Dialogue scripts, conversation patterns, "what to say" guides, or interaction templates?
3. **Derivation** - Mathematical derivations, computational steps, formulas, or problem-solving procedures?

Return a JSON object with this structure:
{{
    "tags": ["framework"],  // Array of applicable tags: "framework", "script", "derivation" (can be multiple)
    "confidence": 0.85,  // Your confidence (0.0-1.0)
    "description": "Brief description of what type of methodology this is"
}}

If none apply, return: {{"tags": [], "confidence": 0.0, "description": ""}}

Text:
{text[:3000]}"""  # Limit text length for efficiency

    try:
        response = client.chat.completions.create(
            model=settings.labeling_model,  # Use gpt-4o-mini for cost efficiency
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at identifying actionable methodologies in text. Focus on step-by-step instructions, frameworks, scripts, and computational procedures."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3  # Low temperature for consistent tagging
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # Validate result structure
        if not isinstance(result, dict):
            return {}
        
        tags = result.get("tags", [])
        confidence = result.get("confidence", 0.0)
        description = result.get("description", "")
        
        # Validate tags (only allow valid values)
        valid_tags = {"framework", "script", "derivation"}
        tags = [tag for tag in tags if tag in valid_tags]
        
        # Only return metadata if we have tags and reasonable confidence
        if tags and confidence >= 0.5:
            return {
                "tags": tags,
                "confidence": float(confidence),
                "description": description
            }
        
        return {}
        
    except Exception as e:
        # Fail silently - action metadata is optional
        print(f"⚠️ Failed to extract action metadata: {str(e)}")
        return {}
