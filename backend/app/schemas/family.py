from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=20)


class JoinFamilyRequest(BaseModel):
    invite_code: str = Field(min_length=6, max_length=6)


class UpdateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=20)


class MemberDTO(BaseModel):
    id: int
    nickname: str
    avatar_url: Optional[str]
    role: str
    joined_at: Optional[datetime]
    is_me: bool


class FamilyFullDTO(BaseModel):
    id: int
    name: str
    invite_code: Optional[str]
    fasting_low: float
    fasting_high: float
    postprandial_low: float
    postprandial_high: float
    critical_low: float
    critical_high: float
    role_of_me: str
    member_count: int


class FamilyDetailResponse(BaseModel):
    family: FamilyFullDTO
    members: list[MemberDTO]
