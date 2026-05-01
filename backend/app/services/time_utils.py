from datetime import datetime, timedelta, timezone


CN_TZ = timezone(timedelta(hours=8))


def now_cn() -> datetime:
    """北京时间（+8）的 naive datetime。

    DB / API 字段约定按北京时间存（无 tz info），与前端 JavaScript Date
    解析无 Z 后缀字符串的本地行为保持一致。
    """
    return datetime.now(CN_TZ).replace(tzinfo=None)


def round_to_5min(dt: datetime) -> datetime:
    """向最近的 5 分钟取整。3 分钟以下舍去，>=3 分钟进位。"""
    minute = dt.minute
    new_minute = (minute // 5) * 5
    if minute % 5 >= 3:
        new_minute += 5
    if new_minute == 60:
        return dt.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return dt.replace(minute=new_minute, second=0, microsecond=0)
