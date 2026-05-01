from collections.abc import Generator

from fastapi import Depends, Header, HTTPException
from jose import JWTError
from sqlmodel import Session

from app.database import get_session as database_get_session
from app.enums import Role
from app.models import User
from app.security import decode_token


def get_session() -> Generator[Session, None, None]:
    yield from database_get_session()


def raise_auth_error(code: str, message: str, status_code: int = 401) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def get_current_user(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    if not authorization:
        raise_auth_error("ERR_TOKEN_INVALID", "缺少登录凭证")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise_auth_error("ERR_TOKEN_INVALID", "登录凭证格式无效")

    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub", ""))
    except (JWTError, TypeError, ValueError):
        raise_auth_error("ERR_TOKEN_INVALID", "登录凭证已失效")

    user = session.get(User, user_id)
    if user is None:
        raise_auth_error("ERR_USER_NOT_FOUND", "用户不存在")

    return user


def require_family(user: User = Depends(get_current_user)) -> User:
    if user.family_id is None:
        raise_auth_error("ERR_NOT_IN_FAMILY", "请先加入家庭", status_code=403)
    return user


def require_creator(user: User = Depends(require_family)) -> User:
    if user.role != Role.creator.value:
        raise_auth_error("ERR_PERMISSION_DENIED", "无权执行该操作", status_code=403)
    return user
