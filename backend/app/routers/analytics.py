from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.deps import get_session, require_family
from app.enums import Period
from app.models import Family, User
from app.schemas.analytics import ChartResponse, MatrixResponse, ReportResponse
from app.services.analytics import get_chart, get_matrix, get_report


router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


def api_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def validate_range(from_date: date, to_date: date) -> None:
    if from_date > to_date:
        api_error(400, "ERR_INVALID_RANGE", "开始日期不能晚于结束日期")
    if (to_date - from_date).days > 365:
        api_error(400, "ERR_RANGE_TOO_LARGE", "查询范围不能超过 365 天")


def get_family(session: Session, user: User) -> Family:
    family = session.get(Family, user.family_id)
    if family is None:
        api_error(404, "ERR_FAMILY_NOT_FOUND", "家庭不存在")
    return family


@router.get("/matrix", response_model=MatrixResponse)
def matrix(
    from_: date = Query(alias="from"),
    to: date = Query(),
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> MatrixResponse:
    validate_range(from_, to)
    return get_matrix(session, get_family(session, current_user), from_, to)


@router.get("/chart", response_model=ChartResponse)
def chart(
    from_: date = Query(alias="from"),
    to: date = Query(),
    period: Optional[str] = Query(default=None),
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> ChartResponse:
    validate_range(from_, to)
    if period and period not in {item.value for item in Period}:
        api_error(400, "ERR_INVALID_PERIOD", "时段不正确")
    return get_chart(session, get_family(session, current_user), from_, to, period)


@router.get("/report", response_model=ReportResponse)
def report(
    from_: date = Query(alias="from"),
    to: date = Query(),
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> ReportResponse:
    validate_range(from_, to)
    return get_report(session, get_family(session, current_user), from_, to)
