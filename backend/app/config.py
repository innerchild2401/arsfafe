"""
Configuration settings
"""
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_key: str
    supabase_service_role_key: str
    
    # OpenAI
    openai_api_key: str
    
    # DeepSeek OCR (optional, commented out for now)
    # deepseek_ocr_api_key: str = ""
    
    # Application
    environment: str = "development"
    cors_origins: List[str] = ["http://localhost:3000"]
    
    # Embedding Model
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    
    # LLM Models
    structure_model: str = "gpt-4o-mini"
    chat_model: str = "gpt-4o-mini"
    labeling_model: str = "gpt-4o-mini"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
