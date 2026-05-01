from typing import Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    code: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None


class UserDTO(BaseModel):
    id: int
    nickname: str
    avatar_url: Optional[str]
    role: Optional[str]


class UpdateProfileRequest(BaseModel):
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None


class FamilyDTO(BaseModel):
    id: int
    name: str
    role_of_me: str
    member_count: int


class LoginResponse(BaseModel):
    token: str
    user: UserDTO
    family: Optional[FamilyDTO]
