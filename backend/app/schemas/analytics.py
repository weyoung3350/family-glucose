from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.record import StatusDTO


class CellDTO(BaseModel):
    id: int
    value: float
    status: StatusDTO


class DayMatrixDTO(BaseModel):
    date: date
    cells: dict[str, Optional[CellDTO]]


class MatrixResponse(BaseModel):
    days: list[DayMatrixDTO]


class ChartPointDTO(BaseModel):
    measured_at: datetime
    value: float
    period: str
    status: StatusDTO


class DistributionDTO(BaseModel):
    low: int = 0
    ideal: int = 0
    ok: int = 0
    high: int = 0
    vhigh: int = 0


class ChartStatsDTO(BaseModel):
    count: int
    avg: Optional[float]
    max: Optional[float]
    min: Optional[float]
    distribution: DistributionDTO


class ChartResponse(BaseModel):
    points: list[ChartPointDTO]
    stats: ChartStatsDTO


class ByPeriodStatDTO(BaseModel):
    period: str
    period_label: str
    avg: Optional[float]
    count: int
    status: Optional[StatusDTO]


class ReportSummaryDTO(BaseModel):
    count: int
    avg: Optional[float]
    overall_status: Optional[StatusDTO]
    abnormal_days: int
    ideal_pct: float


class ReportResponse(BaseModel):
    summary: ReportSummaryDTO
    distribution: DistributionDTO
    by_period: list[ByPeriodStatDTO]
