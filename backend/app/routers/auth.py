"""
Authentication endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.database import get_supabase_client
from app.dependencies import get_current_user

router = APIRouter()

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

@router.post("/signup")
async def signup(request: SignupRequest):
    """
    User signup (creates auth user, profile created via trigger)
    """
    supabase = get_supabase_client()
    
    try:
        # Create user in Supabase Auth
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {
                "data": {
                    "full_name": request.full_name
                }
            }
        })
        
        if not response.user:
            raise HTTPException(status_code=400, detail="Failed to create user")
        
        return {
            "message": "User created successfully. Please wait for admin approval.",
            "user_id": response.user.id,
            "status": "pending"
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Signup failed: {str(e)}")

@router.get("/me")
async def get_current_user_profile(
    current_user: dict = Depends(get_current_user)
):
    """Get current user profile"""
    return {
        "user": current_user
    }

@router.get("/status")
async def check_user_status(
    current_user: dict = Depends(get_current_user)
):
    """Check user approval status"""
    return {
        "status": current_user.get("status"),
        "role": current_user.get("role"),
        "approved": current_user.get("status") == "approved"
    }
