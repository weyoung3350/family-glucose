from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.deps import require_family
from app.models import User
from app.schemas.ai import ParseRequest, ParseResponse
from app.services.ai_parser import parse
from app.services.asr import ASRError, transcribe


router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def _api_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


@router.post("/parse-record", response_model=ParseResponse)
async def parse_record(
    req: ParseRequest,
    current_user: User = Depends(require_family),
) -> ParseResponse:
    parsed = await parse(req.text)
    missing = [key for key in ("value", "period") if getattr(parsed, key) is None]
    return ParseResponse(parsed=parsed, missing=missing, raw_text=req.text)


@router.post("/parse-voice", response_model=ParseResponse)
async def parse_voice(
    audio: UploadFile = File(...),
    current_user: User = Depends(require_family),
) -> ParseResponse:
    """录音文件 → 阿里 ASR 转文字 → 复用 ai_parser 解析。"""
    audio_bytes = await audio.read()
    mime = audio.content_type or "audio/mp3"
    try:
        text = await transcribe(audio_bytes, mime=mime)
    except ASRError as exc:
        # 用户可读的错误码透传
        status = 400 if exc.code in {"ERR_AUDIO_EMPTY", "ERR_AUDIO_TOO_LARGE", "ERR_ASR_EMPTY"} else 502
        _api_error(status, exc.code, exc.message)

    parsed = await parse(text)
    missing = [key for key in ("value", "period") if getattr(parsed, key) is None]
    return ParseResponse(parsed=parsed, missing=missing, raw_text=text)
