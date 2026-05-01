import csv
from datetime import date, datetime, time
from io import StringIO
from typing import Iterator

from sqlmodel import Session, select

from app.enums import PERIOD_LABELS, Period
from app.models import Family, GlucoseRecord, User
from app.services.grading import grade_with_meta


CSV_HEADER = ["日期", "时间", "时段", "时段名", "血糖值", "单位", "状态", "记录人", "备注"]


def write_row(row: list[str]) -> str:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(row)
    return output.getvalue()


def stream_csv(session: Session, family_id: int, from_date: date, to_date: date) -> Iterator[str]:
    family = session.get(Family, family_id)
    yield "\ufeff" + write_row(CSV_HEADER)
    if family is None:
        return

    start = datetime.combine(from_date, time.min)
    end = datetime.combine(to_date, time.max)
    offset = 0
    batch_size = 1000
    while True:
        records = session.exec(
            select(GlucoseRecord)
            .where(
                GlucoseRecord.family_id == family_id,
                GlucoseRecord.measured_at >= start,
                GlucoseRecord.measured_at <= end,
            )
            .order_by(GlucoseRecord.measured_at.asc(), GlucoseRecord.id.asc())
            .offset(offset)
            .limit(batch_size)
        ).all()
        if not records:
            break
        for record in records:
            recorder = session.get(User, record.recorder_id)
            status = grade_with_meta(record.value, record.period, family)
            yield write_row(
                [
                    record.measured_at.strftime("%Y-%m-%d"),
                    record.measured_at.strftime("%H:%M"),
                    record.period,
                    PERIOD_LABELS[Period(record.period)],
                    f"{record.value:.1f}",
                    "mmol/L",
                    status["label"],
                    recorder.nickname if recorder and recorder.nickname else "未命名",
                    record.note or "",
                ]
            )
        offset += batch_size
