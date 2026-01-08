"""
Admin endpoints for user management
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_supabase_client
from app.dependencies import get_admin_user

router = APIRouter()

class ApproveUserRequest(BaseModel):
    has_limits: bool = True
    max_books: Optional[int] = None
    max_pages_per_month: Optional[int] = None
    max_chat_messages_per_month: Optional[int] = None

class UpdateLimitsRequest(BaseModel):
    has_limits: bool
    max_books: Optional[int] = None
    max_pages_per_month: Optional[int] = None
    max_chat_messages_per_month: Optional[int] = None

@router.get("/users/pending")
async def get_pending_users(
    admin: dict = Depends(get_admin_user)
):
    """Get list of pending users"""
    supabase = get_supabase_client()
    
    result = supabase.table("user_profiles").select("*").eq("status", "pending").execute()
    
    return {"users": result.data}

@router.get("/users")
async def get_all_users(
    admin: dict = Depends(get_admin_user)
):
    """Get all users"""
    supabase = get_supabase_client()
    
    result = supabase.table("user_profiles").select("*").order("created_at", desc=True).execute()
    
    return {"users": result.data}

@router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: str,
    request: ApproveUserRequest,
    admin: dict = Depends(get_admin_user)
):
    """Approve a user and set usage limits"""
    supabase = get_supabase_client()
    
    # Check if user exists
    user_result = supabase.table("user_profiles").select("*").eq("id", user_id).execute()
    
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update user
    update_data = {
        "status": "approved",
        "approved_at": datetime.utcnow().isoformat(),
        "approved_by": admin["id"],
        "has_limits": request.has_limits,
        "max_books": request.max_books,
        "max_pages_per_month": request.max_pages_per_month,
        "max_chat_messages_per_month": request.max_chat_messages_per_month
    }
    
    result = supabase.table("user_profiles").update(update_data).eq("id", user_id).execute()
    
    return {
        "message": "User approved successfully",
        "user": result.data[0]
    }

@router.put("/users/{user_id}/limits")
async def update_user_limits(
    user_id: str,
    request: UpdateLimitsRequest,
    admin: dict = Depends(get_admin_user)
):
    """Update user usage limits"""
    supabase = get_supabase_client()
    
    update_data = {
        "has_limits": request.has_limits,
        "max_books": request.max_books,
        "max_pages_per_month": request.max_pages_per_month,
        "max_chat_messages_per_month": request.max_chat_messages_per_month
    }
    
    result = supabase.table("user_profiles").update(update_data).eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "message": "User limits updated successfully",
        "user": result.data[0]
    }

@router.post("/users/{user_id}/reject")
async def reject_user(
    user_id: str,
    admin: dict = Depends(get_admin_user)
):
    """Reject a user signup"""
    supabase = get_supabase_client()
    
    result = supabase.table("user_profiles").update({
        "status": "rejected"
    }).eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "message": "User rejected",
        "user": result.data[0]
    }

@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    admin: dict = Depends(get_admin_user)
):
    """Suspend a user"""
    supabase = get_supabase_client()
    
    result = supabase.table("user_profiles").update({
        "status": "suspended"
    }).eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "message": "User suspended",
        "user": result.data[0]
    }

@router.get("/users/{user_id}/activity")
async def get_user_activity(
    user_id: str,
    admin: dict = Depends(get_admin_user)
):
    """Get user activity statistics"""
    supabase = get_supabase_client()
    
    # Get user profile
    user_result = supabase.table("user_profiles").select("*").eq("id", user_id).execute()
    
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = user_result.data[0]
    
    # Get user's books count
    books_result = supabase.table("user_book_access").select("book_id").eq("user_id", user_id).eq("is_visible", True).execute()
    
    # Get chat messages count
    messages_result = supabase.table("chat_messages").select("id", count="exact").eq("user_id", user_id).execute()
    
    return {
        "user": user,
        "activity": {
            "books_count": len(books_result.data),
            "chat_messages_count": messages_result.count or 0,
            "pages_processed_this_month": user.get("pages_processed_this_month", 0),
            "chat_messages_this_month": user.get("chat_messages_this_month", 0)
        }
    }
