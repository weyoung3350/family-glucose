from app.enums import GRADE_COLORS, GRADE_LABELS, GRADE_TEXT_COLORS, GradeLevel
from app.models import Family


POSTPRANDIAL_PERIODS = {"after_breakfast", "after_lunch", "after_dinner"}


def target_range(period: str, std: Family) -> tuple[float, float]:
    if period in POSTPRANDIAL_PERIODS:
        return std.postprandial_low, std.postprandial_high
    return std.fasting_low, std.fasting_high


def grade(value: float, period: str, std: Family) -> GradeLevel:
    if value < std.critical_low:
        return GradeLevel.low
    if value >= std.critical_high:
        return GradeLevel.vhigh

    target_low, target_high = target_range(period, std)
    if value < target_low:
        return GradeLevel.low
    if value <= target_high:
        return GradeLevel.ideal
    if value <= target_high * 1.3:
        return GradeLevel.ok
    return GradeLevel.high


def grade_with_meta(value: float, period: str, std: Family) -> dict:
    level = grade(value, period, std)
    target_low, target_high = target_range(period, std)
    return {
        "level": level.value,
        "label": GRADE_LABELS[level],
        "color": GRADE_COLORS[level],
        "text_color": GRADE_TEXT_COLORS[level],
        "target_low": target_low,
        "target_high": target_high,
    }
