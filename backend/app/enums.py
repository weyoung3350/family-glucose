from enum import Enum


class Period(str, Enum):
    fasting = "fasting"
    before_breakfast = "before_breakfast"
    after_breakfast = "after_breakfast"
    before_lunch = "before_lunch"
    after_lunch = "after_lunch"
    before_dinner = "before_dinner"
    after_dinner = "after_dinner"
    bedtime = "bedtime"


PERIOD_LABELS = {
    Period.fasting: "空腹",
    Period.before_breakfast: "早餐前",
    Period.after_breakfast: "早餐后",
    Period.before_lunch: "午餐前",
    Period.after_lunch: "午餐后",
    Period.before_dinner: "晚餐前",
    Period.after_dinner: "晚餐后",
    Period.bedtime: "睡前",
}


class Role(str, Enum):
    creator = "creator"
    member = "member"


class Source(str, Enum):
    manual = "manual"
    ai = "ai"


class GradeLevel(str, Enum):
    low = "low"
    ideal = "ideal"
    ok = "ok"
    high = "high"
    vhigh = "vhigh"


GRADE_LABELS = {
    GradeLevel.low: "偏低",
    GradeLevel.ideal: "理想",
    GradeLevel.ok: "一般",
    GradeLevel.high: "偏高",
    GradeLevel.vhigh: "过高",
}


GRADE_COLORS = {
    GradeLevel.low: "#4DA3FF",
    GradeLevel.ideal: "#52C41A",
    GradeLevel.ok: "#FFC53D",
    GradeLevel.high: "#FA8C16",
    GradeLevel.vhigh: "#F5222D",
}


GRADE_TEXT_COLORS = {
    GradeLevel.low: "#FFFFFF",
    GradeLevel.ideal: "#FFFFFF",
    GradeLevel.ok: "#874D00",
    GradeLevel.high: "#FFFFFF",
    GradeLevel.vhigh: "#FFFFFF",
}
