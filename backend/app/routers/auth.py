import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi import Request
from pydantic import ValidationError
from sqlalchemy import func
from sqlmodel import Session, select

from app.deps import get_current_user, get_session
from app.models import Family, User
from app.schemas.auth import FamilyDTO, LoginRequest, LoginResponse, UpdateProfileRequest, UserDTO
from app.security import create_access_token
from app.services.wechat import WechatLoginError, code_to_openid


router = APIRouter()
INVALID_CODE_ERRCODES = {40029, 40163}


async def parse_login_request(request: Request) -> LoginRequest:
    try:
        if "application/json" in request.headers.get("content-type", ""):
            payload = await request.json()
        else:
            raw_body = (await request.body()).decode("utf-8")
            payload = json.loads(raw_body) if raw_body else {}
        return LoginRequest.model_validate(payload)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "ERR_HTTP", "message": "请求体格式无效"},
        ) from exc


def build_family_dto(user: User, session: Session) -> FamilyDTO | None:
    if user.family_id is None:
        return None

    family = session.get(Family, user.family_id)
    if family is None:
        return None

    member_count = session.exec(
        select(func.count(User.id)).where(User.family_id == family.id)
    ).one()

    return FamilyDTO(
        id=family.id,
        name=family.name,
        role_of_me=user.role or "",
        member_count=member_count,
    )


def build_user_dto(user: User) -> UserDTO:
    return UserDTO(
        id=user.id,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        role=user.role,
    )


@router.post("/api/v1/auth/login", response_model=LoginResponse)
async def login(
    req: LoginRequest = Depends(parse_login_request),
    session: Session = Depends(get_session),
) -> LoginResponse:
    try:
        openid = await code_to_openid(req.code)
    except WechatLoginError as exc:
        if exc.errcode in INVALID_CODE_ERRCODES:
            raise HTTPException(
                status_code=400,
                detail={"code": "ERR_WX_CODE_INVALID", "message": "登录 code 无效"},
            ) from exc
        raise HTTPException(
            status_code=502,
            detail={"code": "ERR_WX_API", "message": "微信登录服务异常"},
        ) from exc

    user = session.exec(select(User).where(User.openid == openid)).first()
    if user is None:
        user = User(
            openid=openid,
            nickname=req.nickname or "",
            avatar_url=req.avatar_url,
        )
    else:
        if req.nickname is not None:
            user.nickname = req.nickname
        if req.avatar_url is not None:
            user.avatar_url = req.avatar_url

    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(
        {
            "sub": user.id,
            "openid": openid[-4:],
            "family_id": user.family_id,
            "role": user.role,
        }
    )

    return LoginResponse(
        token=token,
        user=build_user_dto(user),
        family=build_family_dto(user, session),
    )


@router.get("/api/v1/me")
def get_me(user: User = Depends(get_current_user)) -> dict[str, int]:
    return {"id": user.id}


@router.patch("/api/v1/users/me", response_model=UserDTO)
def update_profile(
    req: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserDTO:
    if req.nickname is not None:
        nickname = req.nickname.strip()
        if not nickname:
            raise HTTPException(
                status_code=400,
                detail={"code": "ERR_NICKNAME_EMPTY", "message": "昵称不能为空"},
            )
        if len(nickname) > 20:
            raise HTTPException(
                status_code=400,
                detail={"code": "ERR_NICKNAME_TOO_LONG", "message": "昵称最多 20 个字"},
            )
        user.nickname = nickname
    if req.avatar_url is not None:
        user.avatar_url = req.avatar_url
    session.add(user)
    session.commit()
    session.refresh(user)
    return build_user_dto(user)
