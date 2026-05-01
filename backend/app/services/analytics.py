from collections import defaultdict
from datetime import date, datetime, time, timedelta
from statistics import mean
from typing import Optional

from sqlmodel import Session, select

from app.enums import PERIOD_LABELS, Period
from app.models import Family, GlucoseRecord
from app.schemas.analytics import (
    ByPeriodStatDTO,
    CellDTO,
    ChartPointDTO,
    ChartResponse,
    ChartStatsDTO,
    DayMatrixDTO,
    DistributionDTO,
    MatrixResponse,
    ReportResponse,
    ReportSummaryDTO,
)
from app.schemas.record import StatusDTO
from app.services.grading import grade_with_meta


ABNORMAL_LEVELS = {"low", "high", "vhigh"}


def day_bounds(from_date: date, to_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(from_date, time.min)
    end = datetime.combine(to_date, time.max)
    return start, end


def status_for(record: GlucoseRecord, family: Family) -> StatusDTO:
    return StatusDTO(**grade_with_meta(record.value, record.period, family))


def distribution_for(records: list[GlucoseRecord], family: Family) -> DistributionDTO:
    counts = {key: 0 for key in ("low", "ideal", "ok", "high", "vhigh")}
    for record in records:
        counts[grade_with_meta(record.value, record.period, family)["level"]] += 1
    return DistributionDTO(**counts)


def get_records(
    session: Session,
    family_id: int,
    from_date: date,
    to_date: date,
    period: Optional[str] = None,
) -> list[GlucoseRecord]:
    start, end = day_bounds(from_date, to_date)
    statement = select(GlucoseRecord).where(
        GlucoseRecord.family_id == family_id,
        GlucoseRecord.measured_at >= start,
        GlucoseRecord.measured_at <= end,
    )
    if period:
        statement = statement.where(GlucoseRecord.period == period)
    return session.exec(statement.order_by(GlucoseRecord.measured_at.asc(), GlucoseRecord.id.asc())).all()


def get_matrix(session: Session, family: Family, from_date: date, to_date: date) -> MatrixResponse:
    records = get_records(session, family.id, from_date, to_date)
    latest: dict[tuple[date, str], GlucoseRecord] = {}
    for record in records:
        key = (record.measured_at.date(), record.period)
        current = latest.get(key)
        if current is None or (record.measured_at, record.id) > (current.measured_at, current.id):
            latest[key] = record

    days = []
    current_day = to_date
    while current_day >= from_date:
        cells = {}
        for period in Period:
            record = latest.get((current_day, period.value))
            cells[period.value] = (
                CellDTO(id=record.id, value=record.value, status=status_for(record, family))
                if record
                else None
            )
        days.append(DayMatrixDTO(date=current_day, cells=cells))
        current_day -= timedelta(days=1)
    return MatrixResponse(days=days)


def get_chart(
    session: Session,
    family: Family,
    from_date: date,
    to_date: date,
    period: Optional[str] = None,
) -> ChartResponse:
    records = get_records(session, family.id, from_date, to_date, period)[:1000]
    values = [record.value for record in records]
    points = [
        ChartPointDTO(
            measured_at=record.measured_at,
            value=record.value,
            period=record.period,
            status=status_for(record, family),
        )
        for record in records
    ]
    distribution = distribution_for(records, family)
    return ChartResponse(
        points=points,
        stats=ChartStatsDTO(
            count=len(records),
            avg=round(mean(values), 1) if values else None,
            max=max(values) if values else None,
            min=min(values) if values else None,
            distribution=distribution,
        ),
    )


def get_report(session: Session, family: Family, from_date: date, to_date: date) -> ReportResponse:
    records = get_records(session, family.id, from_date, to_date)
    values = [record.value for record in records]
    distribution = distribution_for(records, family)
    avg_value = round(mean(values), 1) if values else None
    by_day = defaultdict(list)
    by_period = defaultdict(list)
    for record in records:
        by_day[record.measured_at.date()].append(record)
        by_period[record.period].append(record)
    abnormal_days = sum(
        1
        for day_records in by_day.values()
        if any(grade_with_meta(record.value, record.period, family)["level"] in ABNORMAL_LEVELS for record in day_records)
    )
    period_rows = []
    for period in Period:
        period_records = by_period[period.value]
        period_values = [record.value for record in period_records]
        period_avg = round(mean(period_values), 1) if period_values else None
        period_rows.append(
            ByPeriodStatDTO(
                period=period.value,
                period_label=PERIOD_LABELS[period],
                avg=period_avg,
                count=len(period_records),
                status=StatusDTO(**grade_with_meta(period_avg, period.value, family)) if period_avg is not None else None,
            )
        )

    return ReportResponse(
        summary=ReportSummaryDTO(
            count=len(records),
            avg=avg_value,
            overall_status=StatusDTO(**grade_with_meta(avg_value, Period.fasting.value, family)) if avg_value is not None else None,
            abnormal_days=abnormal_days,
            ideal_pct=round(distribution.ideal / len(records), 4) if records else 0.0,
        ),
        distribution=distribution,
        by_period=period_rows,
    )
