from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, Index
from sqlmodel import Field, SQLModel

from app.enums import Period, Role, Source


PERIOD_VALUES = "', '".join(period.value for period in Period)
ROLE_VALUES = "', '".join(role.value for role in Role)
SOURCE_VALUES = "', '".join(source.value for source in Source)


class Family(SQLModel, table=True):
    __tablename__ = "families"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    invite_code: str = Field(index=True, unique=True)
    creator_id: Optional[int] = Field(default=None, foreign_key="users.id")
    fasting_low: float = 4.4
    fasting_high: float = 6.1
    postprandial_low: float = 4.4
    postprandial_high: float = 7.8
    critical_low: float = 3.9
    critical_high: float = 13.9
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            f"role IS NULL OR role IN ('{ROLE_VALUES}')",
            name="ck_users_role",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    openid: str = Field(index=True, unique=True)
    nickname: str = ""
    avatar_url: Optional[str] = None
    family_id: Optional[int] = Field(
        default=None,
        foreign_key="families.id",
        index=True,
    )
    role: Optional[str] = None
    joined_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GlucoseRecord(SQLModel, table=True):
    __tablename__ = "glucose_records"
    __table_args__ = (
        CheckConstraint("value > 0 AND value < 50", name="ck_records_value"),
        CheckConstraint(
            f"period IN ('{PERIOD_VALUES}')",
            name="ck_records_period",
        ),
        CheckConstraint(
            f"source IN ('{SOURCE_VALUES}')",
            name="ck_records_source",
        ),
        Index("ix_glucose_records_family_measured_at", "family_id", "measured_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    family_id: int = Field(foreign_key="families.id", index=True)
    recorder_id: int = Field(foreign_key="users.id", index=True)
    value: float
    period: str
    measured_at: datetime = Field(index=True)
    note: Optional[str] = None
    source: str = Source.manual.value
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
