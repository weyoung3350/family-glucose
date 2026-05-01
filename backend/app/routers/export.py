from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from jose import JWTError
from sqlmodel import Session

from app.deps import get_current_user, get_session
from app.models import User
from app.security import decode_token
from app.services.csv_export import stream_csv


router = APIRouter(prefix="/api/v1/export", tags=["export"])


def api_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def validate_range(from_date: date, to_date: date) -> None:
    if from_date > to_date:
        api_error(400, "ERR_INVALID_RANGE", "开始日期不能晚于结束日期")
    if (to_date - from_date).days > 365:
        api_error(400, "ERR_RANGE_TOO_LARGE", "导出范围不能超过 365 天")


def get_user_from_query_token(token: str, session: Session) -> User:
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub", ""))
    except (JWTError, TypeError, ValueError):
        api_error(401, "ERR_TOKEN_INVALID", "登录凭证已失效")
    user = session.get(User, user_id)
    if user is None:
        api_error(401, "ERR_USER_NOT_FOUND", "用户不存在")
    return user


@router.get("/csv")
def export_csv(
    from_: date = Query(alias="from"),
    to: date = Query(),
    token: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> StreamingResponse:
    validate_range(from_, to)
    if token:
        current_user = get_user_from_query_token(token, session)
    else:
        current_user = get_current_user(authorization=authorization, session=session)
    if current_user.family_id is None:
        api_error(403, "ERR_NOT_IN_FAMILY", "请先加入家庭")

    filename = f"家有糖人_{from_}_{to}.csv"
    encoded = quote(filename)
    return StreamingResponse(
        stream_csv(session, current_user.family_id, from_, to),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )
