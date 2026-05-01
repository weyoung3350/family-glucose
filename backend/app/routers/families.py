from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.services.time_utils import now_cn
from app.deps import get_current_user, get_session, require_creator, require_family
from app.enums import Role
from app.models import Family, User
from app.routers.auth import display_nickname
from app.schemas.family import (
    CreateFamilyRequest,
    FamilyDetailResponse,
    FamilyFullDTO,
    JoinFamilyRequest,
    MemberDTO,
    UpdateFamilyRequest,
)
from app.schemas.standards import StandardsDTO, UpdateStandardsRequest
from app.security import generate_invite_code


router = APIRouter(prefix="/api/v1/families", tags=["families"])


def api_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def standards_dto(family: Family) -> StandardsDTO:
    return StandardsDTO(
        fasting_low=family.fasting_low,
        fasting_high=family.fasting_high,
        postprandial_low=family.postprandial_low,
        postprandial_high=family.postprandial_high,
        critical_low=family.critical_low,
        critical_high=family.critical_high,
    )


def build_detail(session: Session, family: Family, current_user: User) -> FamilyDetailResponse:
    members = session.exec(
        select(User)
        .where(User.family_id == family.id)
        .order_by(User.role.desc(), User.joined_at, User.id)
    ).all()
    role_of_me = current_user.role or ""
    return FamilyDetailResponse(
        family=FamilyFullDTO(
            id=family.id,
            name=family.name,
            invite_code=family.invite_code if role_of_me == Role.creator.value else None,
            fasting_low=family.fasting_low,
            fasting_high=family.fasting_high,
            postprandial_low=family.postprandial_low,
            postprandial_high=family.postprandial_high,
            critical_low=family.critical_low,
            critical_high=family.critical_high,
            role_of_me=role_of_me,
            member_count=len(members),
        ),
        members=[
            MemberDTO(
                id=member.id,
                nickname=display_nickname(member),
                avatar_url=member.avatar_url,
                role=member.role or "",
                joined_at=member.joined_at,
                is_me=member.id == current_user.id,
            )
            for member in members
        ],
    )


def get_my_family(session: Session, user: User) -> Family:
    family = session.get(Family, user.family_id)
    if family is None:
        api_error(404, "ERR_FAMILY_NOT_FOUND", "家庭不存在")
    return family


def validate_standards(values: StandardsDTO) -> None:
    if not values.critical_low < values.fasting_low < values.fasting_high < values.critical_high:
        api_error(400, "ERR_STANDARDS_INVALID", "空腹标准必须满足 critical_low < fasting_low < fasting_high < critical_high")
    if not values.critical_low < values.postprandial_low < values.postprandial_high < values.critical_high:
        api_error(400, "ERR_STANDARDS_INVALID", "餐后标准必须满足 critical_low < postprandial_low < postprandial_high < critical_high")


@router.post("", response_model=FamilyDetailResponse)
def create_family(
    req: CreateFamilyRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FamilyDetailResponse:
    name = req.name.strip()
    if current_user.family_id is not None:
        api_error(400, "ERR_USER_ALREADY_IN_FAMILY", "用户已经加入家庭")

    family = None
    for _ in range(5):
        family = Family(name=name, invite_code=generate_invite_code(), creator_id=current_user.id)
        session.add(family)
        try:
            session.commit()
            session.refresh(family)
            break
        except IntegrityError:
            session.rollback()
            family = None
    if family is None:
        api_error(500, "ERR_INVITE_CODE_GENERATE_FAILED", "邀请码生成失败")

    current_user.family_id = family.id
    current_user.role = Role.creator.value
    current_user.joined_at = now_cn()
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    session.refresh(family)
    return build_detail(session, family, current_user)


@router.post("/join", response_model=FamilyDetailResponse)
def join_family(
    req: JoinFamilyRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FamilyDetailResponse:
    if current_user.family_id is not None:
        api_error(400, "ERR_USER_ALREADY_IN_FAMILY", "用户已经加入家庭")
    family = session.exec(select(Family).where(Family.invite_code == req.invite_code.upper())).first()
    if family is None:
        api_error(404, "ERR_INVITE_CODE_INVALID", "邀请码不存在")

    current_user.family_id = family.id
    current_user.role = Role.member.value
    current_user.joined_at = now_cn()
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return build_detail(session, family, current_user)


@router.get("/me", response_model=FamilyDetailResponse)
def get_family_me(
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> FamilyDetailResponse:
    return build_detail(session, get_my_family(session, current_user), current_user)


@router.patch("/me", response_model=FamilyDetailResponse)
def update_family(
    req: UpdateFamilyRequest,
    current_user: User = Depends(require_creator),
    session: Session = Depends(get_session),
) -> FamilyDetailResponse:
    family = get_my_family(session, current_user)
    name = req.name.strip()
    family.name = name
    family.updated_at = now_cn()
    session.add(family)
    session.commit()
    session.refresh(family)
    return build_detail(session, family, current_user)


@router.delete("/me/members/{user_id}", status_code=204)
def remove_member(
    user_id: int,
    current_user: User = Depends(require_creator),
    session: Session = Depends(get_session),
) -> None:
    if user_id == current_user.id:
        api_error(400, "ERR_CANNOT_REMOVE_SELF", "不能移除自己")
    target = session.get(User, user_id)
    if target is None or target.family_id != current_user.family_id:
        api_error(404, "ERR_USER_NOT_IN_FAMILY", "用户不在当前家庭")
    target.family_id = None
    target.role = None
    target.joined_at = None
    session.add(target)
    session.commit()


@router.post("/me/leave", status_code=204)
def leave_family(
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> None:
    if current_user.role == Role.creator.value:
        api_error(400, "ERR_CREATOR_CANNOT_LEAVE", "创建者不能退出家庭，请解散家庭")
    current_user.family_id = None
    current_user.role = None
    current_user.joined_at = None
    session.add(current_user)
    session.commit()


@router.delete("/me", status_code=204)
def dissolve_family(
    current_user: User = Depends(require_creator),
    session: Session = Depends(get_session),
) -> None:
    family = get_my_family(session, current_user)
    members = session.exec(select(User).where(User.family_id == family.id)).all()
    for member in members:
        member.family_id = None
        member.role = None
        member.joined_at = None
        session.add(member)
    session.delete(family)
    session.commit()


@router.get("/me/standards", response_model=StandardsDTO)
def get_standards(
    current_user: User = Depends(require_family),
    session: Session = Depends(get_session),
) -> StandardsDTO:
    return standards_dto(get_my_family(session, current_user))


@router.patch("/me/standards", response_model=StandardsDTO)
def update_standards(
    req: UpdateStandardsRequest,
    current_user: User = Depends(require_creator),
    session: Session = Depends(get_session),
) -> StandardsDTO:
    family = get_my_family(session, current_user)
    values = standards_dto(family).model_copy(update=req.model_dump(exclude_none=True))
    validate_standards(values)
    for key, value in values.model_dump().items():
        setattr(family, key, value)
    family.updated_at = now_cn()
    session.add(family)
    session.commit()
    session.refresh(family)
    return standards_dto(family)
