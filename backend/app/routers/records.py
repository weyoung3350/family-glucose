from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.deps import get_session, require_family
from app.enums import PERIOD_LABELS, Period, Role, Source
from app.models import Family, GlucoseRecord, User
from app.schemas.record import (
    CreateRecordRequest,
    RecordDTO,
    RecordListResponse,
    RecorderDTO,
    StatusDTO,
    UpdateRecordRequest,
)
from app.services.grading import grade_with_meta
from app.services.time_utils import round_to_5min


router = APIRouter(prefix="/api/v1/records", tags=["records"])


def api_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def get_family(session: Session, user: User) -> Family:
    family = session.get(Family, user.family_id)
    if family is None:
        api_error(404, "ERR_FAMILY_NOT_FOUND", "家庭不存在")
    return family


def get_record_in_family(session: Session, record_id: int, family_id: int) -> GlucoseRecord:
    record = session.get(GlucoseRecord, record_id)
    if record is None or record.family_id != family_id:
        api_error(404, "ERR_RECORD_NOT_FOUND", "记录不存在")
    return record


def build_record_dto(session: Session, record: GlucoseRecord, family: Family) -> RecordDTO:
    recorder = session.get(User, record.recorder_id)
    status = grade_with_meta(record.value, record.period, family)
    return RecordDTO(
        id=record.id,
        value=record.value,
        period=record.period,
        period_label=PERIOD_LABELS[Period(record.period)],
        measured_at=record.measured_at,
        note=record.note,
        source=record.source,
        recorder=RecorderDTO(
            id=recorder.id if recorder else record.recorder_id,
            nickname=recorder.nickname if recorder else "",
            avatar_url=recorder.avatar_url if recorder else None,
        ),
        status=StatusDTO(**status),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def validate_period_or_error(period: str) -> None:
    if period not in {item.value for item in Period}:
        api_error(400, "ERR_INVALID_PERIOD", "时段不正确")


def validate_source_or_error(source: str) -> None:
    if source not in {item.value for item in Source}:
        api_error(400, "ERR_INVALID_SOURCE", "来源不正确")


@router.get("", response_model=RecordListResponse)
def list_records(
    from_: Optional[date] = Query(default=None, alias="from"),
    to: Optional[date] = Query(default=None),
    period: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> RecordListResponse:
    family = get_family(session, current_user)
    statement = select(GlucoseRecord).where(GlucoseRecord.family_id == family.id)
    count_statement = select(func.count(GlucoseRecord.id)).where(GlucoseRecord.family_id == family.id)
    if from_ is not None:
        start_at = datetime.combine(from_, time.min)
        statement = statement.where(GlucoseRecord.measured_at >= start_at)
        count_statement = count_statement.where(GlucoseRecord.measured_at >= start_at)
    if to is not None:
        end_at = datetime.combine(to, time.max)
        statement = statement.where(GlucoseRecord.measured_at <= end_at)
        count_statement = count_statement.where(GlucoseRecord.measured_at <= end_at)
    if period:
        validate_period_or_error(period)
        statement = statement.where(GlucoseRecord.period == period)
        count_statement = count_statement.where(GlucoseRecord.period == period)

    total = session.exec(count_statement).one()

    # 按 +8 时区算"今天"
    cn_tz = timezone(timedelta(hours=8))
    today_cn = datetime.now(cn_tz).date()
    today_start = datetime.combine(today_cn, time.min)
    today_end = datetime.combine(today_cn, time.max)
    total_today = session.exec(
        select(func.count(GlucoseRecord.id))
        .where(GlucoseRecord.family_id == family.id)
        .where(GlucoseRecord.measured_at >= today_start)
        .where(GlucoseRecord.measured_at <= today_end)
    ).one()

    records = session.exec(
        statement.order_by(GlucoseRecord.measured_at.desc(), GlucoseRecord.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).all()
    return RecordListResponse(
        items=[build_record_dto(session, record, family) for record in records],
        total=total,
        total_today=total_today,
        page=page,
        size=size,
    )


@router.post("", response_model=RecordDTO)
def create_record(
    req: CreateRecordRequest,
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> RecordDTO:
    validate_period_or_error(req.period)
    validate_source_or_error(req.source)
    family = get_family(session, current_user)
    record = GlucoseRecord(
        family_id=family.id,
        recorder_id=current_user.id,
        value=req.value,
        period=req.period,
        measured_at=round_to_5min(req.measured_at),
        note=req.note,
        source=req.source,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return build_record_dto(session, record, family)


@router.get("/{record_id}", response_model=RecordDTO)
def get_record(
    record_id: int,
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> RecordDTO:
    family = get_family(session, current_user)
    return build_record_dto(session, get_record_in_family(session, record_id, family.id), family)


@router.patch("/{record_id}", response_model=RecordDTO)
def update_record(
    record_id: int,
    req: UpdateRecordRequest,
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> RecordDTO:
    family = get_family(session, current_user)
    record = get_record_in_family(session, record_id, family.id)
    if record.recorder_id != current_user.id and current_user.role != Role.creator.value:
        api_error(403, "ERR_FORBIDDEN", "无权修改该记录")

    data = req.model_dump(exclude_unset=True)
    if "period" in data and data["period"] is not None:
        validate_period_or_error(data["period"])
    if "measured_at" in data and data["measured_at"] is not None:
        data["measured_at"] = round_to_5min(data["measured_at"])
    for key, value in data.items():
        setattr(record, key, value)
    record.updated_at = datetime.utcnow()
    session.add(record)
    session.commit()
    session.refresh(record)
    return build_record_dto(session, record, family)


@router.delete("/{record_id}", status_code=204)
def delete_record(
    record_id: int,
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> None:
    family = get_family(session, current_user)
    record = get_record_in_family(session, record_id, family.id)
    if record.recorder_id != current_user.id and current_user.role != Role.creator.value:
        api_error(403, "ERR_FORBIDDEN", "无权删除该记录")
    session.delete(record)
    session.commit()
