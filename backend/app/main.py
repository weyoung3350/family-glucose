import logging
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import ai, analytics, auth, export, families, records


LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s"


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


def configure_logging() -> None:
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logging.basicConfig(level=level, format=LOG_FORMAT)
    for handler in logging.getLogger().handlers:
        handler.addFilter(RequestIdFilter())


configure_logging()

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(families.router)
app.include_router(records.router)
app.include_router(analytics.router)
app.include_router(export.router)
app.include_router(ai.router)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = uuid4().hex[:8]
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(
    request: Request,
    exc: HTTPException,
) -> JSONResponse:
    if isinstance(exc.detail, dict):
        code = str(exc.detail.get("code") or "ERR_HTTP")
        message = str(exc.detail.get("message") or "请求失败")
    else:
        detail = str(exc.detail or "")
        code = detail if detail.startswith("ERR_") else "ERR_HTTP"
        message = detail or "请求失败"

    return JSONResponse(
        status_code=exc.status_code,
        content={"code": code, "message": message},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"code": "ERR_HTTP", "message": "请求参数不正确"},
    )


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": "0.1.0",
        "env": settings.APP_ENV,
    }
