from datetime import datetime, timedelta


def round_to_5min(dt: datetime) -> datetime:
    """向最近的 5 分钟取整。3 分钟以下舍去，>=3 分钟进位。"""
    minute = dt.minute
    new_minute = (minute // 5) * 5
    if minute % 5 >= 3:
        new_minute += 5
    if new_minute == 60:
        return dt.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return dt.replace(minute=new_minute, second=0, microsecond=0)
