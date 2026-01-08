"""
Embedding generation service using OpenAI
"""
from openai import OpenAI
from app.config import settings
from typing import List
import asyncio

client = OpenAI(api_key=settings.openai_api_key)

def generate_embedding(text: str) -> List[float]:
    """
    Generate embedding for a single text chunk
    
    Args:
        text: Text to embed
    
    Returns:
        List of floats (1536 dimensions for text-embedding-3-small)
    """
    try:
        response = client.embeddings.create(
            model=settings.embedding_model,
            input=text
        )
        
        return response.data[0].embedding
        
    except Exception as e:
        raise Exception(f"Error generating embedding: {str(e)}")

def generate_embeddings_batch(texts: List[str], batch_size: int = 100) -> List[List[float]]:
    """
    Generate embeddings for multiple texts in batches
    
    Args:
        texts: List of texts to embed
        batch_size: Number of texts to process per batch
    
    Returns:
        List of embeddings (same order as input texts)
    """
    embeddings = []
    
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        
        try:
            response = client.embeddings.create(
                model=settings.embedding_model,
                input=batch
            )
            
            batch_embeddings = [item.embedding for item in response.data]
            embeddings.extend(batch_embeddings)
            
        except Exception as e:
            raise Exception(f"Error generating embeddings for batch {i}: {str(e)}")
    
    return embeddings
