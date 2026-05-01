from datetime import datetime, timedelta
from secrets import choice

from jose import jwt

from app.config import settings


ALGORITHM = "HS256"
INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(days=settings.JWT_TTL_DAYS)
    if "sub" in payload:
        payload["sub"] = str(payload["sub"])
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])


def generate_invite_code(length: int = 6) -> str:
    return "".join(choice(INVITE_CODE_CHARS) for _ in range(length))
