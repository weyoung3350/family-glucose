import json
import re
from datetime import datetime, time
from typing import Optional

import httpx

from app.config import settings
from app.enums import Period
from app.schemas.ai import ParsedFields
from app.services.time_utils import round_to_5min, now_cn


SYSTEM_PROMPT = """你是中文血糖记录解析器。从用户一句话中抽取以下字段，输出严格 JSON：
{
  "value": <number or null>,
  "period": <string or null>,
  "measured_at": <"HH:MM" or null>,
  "note": <string or null>
}
规则：
- 时段枚举：fasting / before_breakfast / after_breakfast / before_lunch / after_lunch / before_dinner / after_dinner / bedtime
- 用户说"饭后两小时"等同 after_<最近一餐>
- "刚才/现在" → 当前时间
- 不要猜测原文未提及的字段，仅返回 null
"""

PERIOD_WORDS = {
    "fasting": ["空腹", "早晨空腹", "刚睡醒"],
    "before_breakfast": ["早餐前", "早饭前"],
    "after_breakfast": ["早餐后", "早饭后"],
    "before_lunch": ["午餐前", "午饭前"],
    "after_lunch": ["午餐后", "午饭后", "中午饭后", "中餐后"],
    "before_dinner": ["晚餐前", "晚饭前"],
    "after_dinner": ["晚餐后", "晚饭后"],
    "bedtime": ["睡前", "临睡前"],
}
CN_NUMBERS = {
    "零": 0,
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
    "十一": 11,
    "十二": 12,
    "十三": 13,
    "十四": 14,
    "十五": 15,
    "十六": 16,
    "十七": 17,
    "十八": 18,
    "十九": 19,
    "二十": 20,
    "二十一": 21,
    "二十二": 22,
    "二十三": 23,
}


def infer_period(dt: datetime) -> str:
    current = dt.time()
    if time(4, 0) <= current < time(8, 30):
        return Period.fasting.value
    if time(8, 30) <= current < time(11, 0):
        return Period.after_breakfast.value
    if time(11, 0) <= current < time(12, 30):
        return Period.before_lunch.value
    if time(12, 30) <= current < time(15, 30):
        return Period.after_lunch.value
    if time(15, 30) <= current < time(18, 0):
        return Period.before_dinner.value
    if time(18, 0) <= current < time(21, 30):
        return Period.after_dinner.value
    return Period.bedtime.value


def infer_recent_after_meal(now: datetime) -> str:
    if now.hour < 11:
        return Period.after_breakfast.value
    if now.hour < 17:
        return Period.after_lunch.value
    return Period.after_dinner.value


def parse_hour(raw: str) -> Optional[int]:
    if raw.isdigit():
        return int(raw)
    return CN_NUMBERS.get(raw)


def parse_minute(raw: str) -> int:
    if raw == "":
        return 0
    if raw.isdigit():
        return int(raw)
    if raw in CN_NUMBERS:
        return CN_NUMBERS[raw]
    if len(raw) == 2 and raw[0] in CN_NUMBERS and raw[1] in CN_NUMBERS:
        return CN_NUMBERS[raw[0]] * 10 + CN_NUMBERS[raw[1]]
    return 0


def extract_time(text: str, now: datetime) -> tuple[Optional[datetime], bool, list[str]]:
    if "刚才" in text or "现在" in text:
        return round_to_5min(now), True, ["刚才", "现在"]
    match = re.search(r"([零一二两三四五六七八九十]{1,3}|\d{1,2})[:：点](\d{0,2}|[零一二两三四五六七八九十]{0,3})", text)
    if not match:
        return None, False, []
    hour = parse_hour(match.group(1))
    minute = parse_minute(match.group(2))
    if hour is None:
        return None, False, []
    prefix = text[max(0, match.start() - 4) : match.start()]
    if any(word in prefix for word in ("下午", "晚上", "傍晚")) and hour < 12:
        hour += 12
    if hour > 23 or minute > 59:
        return None, False, []
    return round_to_5min(now.replace(hour=hour, minute=minute, second=0, microsecond=0)), False, [match.group(0)]


def extract_period(text: str, measured_at: Optional[datetime], now: datetime) -> tuple[Optional[str], bool, list[str]]:
    for period, words in PERIOD_WORDS.items():
        for word in words:
            if word in text:
                return period, False, [word]
    if "饭后两小时" in text or "餐后两小时" in text:
        return infer_recent_after_meal(measured_at or now), True, ["饭后两小时", "餐后两小时"]
    if measured_at is not None:
        return infer_period(measured_at), True, []
    return None, False, []


def cn_to_int(s: str) -> Optional[int]:
    """中文整数解析：'十二'→12，'二十一'→21，'十'→10，'三'→3。"""
    if not s:
        return None
    if s in CN_NUMBERS:
        return CN_NUMBERS[s]
    if "十" in s:
        a, _, b = s.partition("十")
        tens = CN_NUMBERS.get(a, 1) if a else 1
        ones = CN_NUMBERS.get(b, 0) if b else 0
        if isinstance(tens, int) and isinstance(ones, int) and 0 <= tens <= 9 and 0 <= ones <= 9:
            return tens * 10 + ones
    return None


def cn_to_float(s: str) -> Optional[float]:
    """中文小数解析：'七点八'→7.8，'十二点五'→12.5，'十二'→12.0。"""
    if "点" in s:
        a, _, b = s.partition("点")
        ai = cn_to_int(a) if a else 0
        bi = cn_to_int(b) if b else None
        if ai is not None and bi is not None:
            digits = max(1, len(b))
            return ai + bi / (10 ** digits)
        return None
    val = cn_to_int(s)
    return float(val) if val is not None else None


def extract_value(text: str) -> tuple[Optional[float], list[str]]:
    candidates = []
    # 1. 阿拉伯数字
    for match in re.finditer(r"(\d+(?:[.．]\d+)?)", text):
        value = float(match.group(1).replace("．", "."))
        prefix = text[max(0, match.start() - 2) : match.start()]
        suffix = text[match.end() : match.end() + 3]
        if ":" in prefix or "：" in prefix or "点" in prefix or suffix.startswith((":","：","点")):
            continue
        if 4 <= value <= 30:
            priority = 0 if "血糖" in text[max(0, match.start() - 6) : match.end() + 6] else 1
            candidates.append((priority, match.start(), value, match.group(0)))
    # 2. 中文数字（仅在紧邻"血糖"或"糖"时识别，避免误吃"晚上八点"中的"八"）
    cn_pattern = r"([零一二两三四五六七八九十]+(?:点[零一二两三四五六七八九十]+)?)"
    for match in re.finditer(cn_pattern, text):
        raw = match.group(1)
        value = cn_to_float(raw)
        if value is None:
            continue
        prefix = text[max(0, match.start() - 4) : match.start()]
        suffix = text[match.end() : match.end() + 3]
        # 必须明确指向血糖：前文有"血糖"/"糖"或后文有"mmol"
        if not ("血糖" in prefix or "糖" in prefix or "mmol" in suffix.lower()):
            continue
        # "X点" 类似"两点"="2:00"，单 char + "点" 后面跟数字时段更像时间，跳过
        if 4 <= value <= 30:
            candidates.append((0, match.start(), value, raw))
    if not candidates:
        return None, []
    _, _, value, raw = sorted(candidates)[0]
    return value, [raw]


def clean_note(text: str, removals: list[str]) -> Optional[str]:
    note = text
    for item in removals:
        if item:
            note = note.replace(item, "")
    note = re.sub(r"(血糖|早上|上午|下午|晚上|今早|今天|测得|测了|是)", "", note)
    note = note.strip(" ，,。；;：:")
    return note if len(note) >= 2 else None


def normalize_llm_payload(payload: dict, now: datetime) -> ParsedFields:
    value = payload.get("value")
    value = float(value) if isinstance(value, (int, float, str)) and str(value).strip() else None
    period = payload.get("period")
    period = period if period in {item.value for item in Period} else None
    measured_at = None
    measured_at_inferred = False
    if payload.get("measured_at"):
        try:
            hour, minute = [int(part) for part in str(payload["measured_at"]).split(":", 1)]
            measured_at = round_to_5min(now.replace(hour=hour, minute=minute, second=0, microsecond=0))
        except (ValueError, TypeError):
            measured_at = None
    if measured_at is None:
        measured_at = round_to_5min(now)
        measured_at_inferred = True
    period_inferred = False
    if period is None and measured_at is not None:
        period = infer_period(measured_at)
        period_inferred = True
    return ParsedFields(
        value=value,
        period=period,
        period_inferred=period_inferred,
        measured_at=measured_at,
        measured_at_inferred=measured_at_inferred,
        note=payload.get("note"),
    )


async def parse_by_llm(text: str, now: datetime) -> Optional[ParsedFields]:
    if settings.LLM_PROVIDER != "deepseek" or not settings.DEEPSEEK_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SEC) as client:
            response = await client.post(
                f"{settings.DEEPSEEK_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}"},
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": text},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return normalize_llm_payload(json.loads(content), now)
    except Exception:
        return None


def parse_by_rules(text: str, now: datetime) -> ParsedFields:
    measured_at, measured_at_inferred, time_tokens = extract_time(text, now)
    value, value_tokens = extract_value(text)
    period, period_inferred, period_tokens = extract_period(text, measured_at, now)
    if measured_at is None:
        measured_at = round_to_5min(now)
        measured_at_inferred = True
    note = clean_note(text, time_tokens + value_tokens + period_tokens)
    return ParsedFields(
        value=value,
        period=period,
        period_inferred=period_inferred,
        measured_at=measured_at,
        measured_at_inferred=measured_at_inferred,
        note=note,
    )


async def parse(text: str) -> ParsedFields:
    now = now_cn()
    parsed = await parse_by_llm(text, now)
    if parsed is not None:
        return parsed
    return parse_by_rules(text, now)
