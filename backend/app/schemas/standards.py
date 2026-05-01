from typing import Optional

from pydantic import BaseModel, Field


class StandardsDTO(BaseModel):
    fasting_low: float
    fasting_high: float
    postprandial_low: float
    postprandial_high: float
    critical_low: float
    critical_high: float


class UpdateStandardsRequest(BaseModel):
    fasting_low: Optional[float] = Field(default=None, gt=0, lt=50)
    fasting_high: Optional[float] = Field(default=None, gt=0, lt=50)
    postprandial_low: Optional[float] = Field(default=None, gt=0, lt=50)
    postprandial_high: Optional[float] = Field(default=None, gt=0, lt=50)
    critical_low: Optional[float] = Field(default=None, gt=0, lt=50)
    critical_high: Optional[float] = Field(default=None, gt=0, lt=50)
