from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class ParsedFields(BaseModel):
    value: Optional[float]
    period: Optional[str]
    period_inferred: bool = False
    measured_at: Optional[datetime]
    measured_at_inferred: bool = False
    note: Optional[str]


class ParseResponse(BaseModel):
    parsed: ParsedFields
    missing: list[str]
    raw_text: str
