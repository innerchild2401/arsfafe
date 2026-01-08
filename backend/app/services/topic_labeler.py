"""
Topic labeling service using GPT-4o-mini
Generates topic labels for parent chunks
"""
from openai import OpenAI
from app.config import settings
import json
from typing import List

client = OpenAI(api_key=settings.openai_api_key)

def generate_topic_labels(text: str, num_labels: int = 5) -> List[str]:
    """
    Generate topic labels for a text chunk
    
    Args:
        text: Text chunk to label
        num_labels: Number of labels to generate (default: 5)
    
    Returns:
        List of topic labels (2-4 words each)
    """
    prompt = f"""Extract {num_labels} concise topic labels (2-4 words each) for this text section.
Return as a JSON array of strings: ["label1", "label2", "label3", ...]

Text:
{text[:2000]}"""  # Limit text length

    try:
        response = client.chat.completions.create(
            model=settings.labeling_model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "You are a topic extraction expert. Generate concise, descriptive topic labels."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # Extract labels from response (could be in different formats)
        if "labels" in result:
            labels = result["labels"]
        elif isinstance(result, list):
            labels = result
        else:
            # Try to find array in response
            labels = list(result.values())[0] if result else []
        
        # Ensure we have a list of strings
        if isinstance(labels, list):
            labels = [str(label) for label in labels[:num_labels]]
        else:
            labels = [str(labels)]
        
        return labels
        
    except Exception as e:
        # Fallback: return generic labels
        return [f"Topic {i+1}" for i in range(num_labels)]
