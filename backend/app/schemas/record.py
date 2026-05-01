from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.enums import Source


class RecorderDTO(BaseModel):
    id: int
    nickname: str
    avatar_url: Optional[str]


class StatusDTO(BaseModel):
    level: str
    label: str
    color: str
    text_color: str = "#FFFFFF"
    target_low: float
    target_high: float


class RecordDTO(BaseModel):
    id: int
    value: float
    unit: str = "mmol/L"
    period: str
    period_label: str
    measured_at: datetime
    note: Optional[str]
    source: str
    recorder: RecorderDTO
    status: StatusDTO
    created_at: datetime
    updated_at: datetime


class CreateRecordRequest(BaseModel):
    value: float = Field(gt=0, lt=50)
    period: str
    measured_at: datetime
    note: Optional[str] = Field(default=None, max_length=200)
    source: str = Source.manual.value


class UpdateRecordRequest(BaseModel):
    value: Optional[float] = Field(default=None, gt=0, lt=50)
    period: Optional[str] = None
    measured_at: Optional[datetime] = None
    note: Optional[str] = Field(default=None, max_length=200)



class RecordListResponse(BaseModel):
    items: list[RecordDTO]
    total: int
    total_today: int = 0
    page: int
    size: int
