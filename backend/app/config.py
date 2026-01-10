"""
Configuration settings
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
        env_ignore_empty=True
    )
    
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
    cors_origins: str = "http://localhost:3000"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    # Embedding Model
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    
    # LLM Models
    structure_model: str = "gpt-4o-mini"
    chat_model: str = "gpt-4o-mini"  # Fast, cheap for standard queries
    reasoning_model: str = "gpt-4o"  # Deep reasoning for complex queries (Path C)
    labeling_model: str = "gpt-4o-mini"
    
    # DeepSeek Reasoning (alternative to GPT-4o)
    # deepseek_api_key: str = ""
    # deepseek_reasoning_model: str = "deepseek-reasoner"  # Uncomment if using DeepSeek
    
settings = Settings()
