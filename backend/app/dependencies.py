"""
FastAPI dependencies for authentication and authorization
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from supabase import Client

from app.database import get_supabase_client

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    supabase: Client = Depends(get_supabase_client)
) -> dict:
    """
    Get current authenticated user from JWT token
    
    Returns:
        User profile dict with id, email, role, status, etc.
    """
    try:
        # Verify token with Supabase
        token = credentials.credentials
        
        # Get user from Supabase Auth
        user_response = supabase.auth.get_user(token)
        
        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
        
        user_id = user_response.user.id
        
        # Get user profile
        profile_response = supabase.table("user_profiles").select("*").eq("id", user_id).execute()
        
        if not profile_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        
        profile = profile_response.data[0]
        
        # Check if user is approved
        if profile["status"] != "approved":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account status: {profile['status']}. Please wait for admin approval."
            )
        
        return profile
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )

async def get_admin_user(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    Ensure current user is an admin
    
    Returns:
        Admin user profile
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return current_user

def check_usage_limits(user: dict, limit_type: str, current_usage: int = None):
    """
    Check if user has exceeded usage limits
    
    Args:
        user: User profile dict
        limit_type: 'books', 'pages', or 'chat'
        current_usage: Current usage count (optional, will be fetched if not provided)
    
    Raises:
        HTTPException if limit exceeded
    """
    # Admin bypass
    if user.get("role") == "admin" or not user.get("has_limits", True):
        return
    
    if limit_type == "books":
        max_limit = user.get("max_books")
        current = current_usage or user.get("current_books_count", 0)
        if max_limit and current >= max_limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Book limit exceeded. Maximum: {max_limit}, Current: {current}"
            )
    
    elif limit_type == "pages":
        max_limit = user.get("max_pages_per_month")
        current = current_usage or user.get("pages_processed_this_month", 0)
        if max_limit and current >= max_limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Monthly page limit exceeded. Maximum: {max_limit}, Current: {current}"
            )
    
    elif limit_type == "chat":
        max_limit = user.get("max_chat_messages_per_month")
        current = current_usage or user.get("chat_messages_this_month", 0)
        if max_limit and current >= max_limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Monthly chat limit exceeded. Maximum: {max_limit}, Current: {current}"
            )
