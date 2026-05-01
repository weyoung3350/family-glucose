from collections.abc import Generator

from sqlmodel import SQLModel, Session, create_engine

from app.config import settings


engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    connect_args={"check_same_thread": False},
)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def init_db() -> None:
    from app import models

    SQLModel.metadata.create_all(engine)
