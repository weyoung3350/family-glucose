from fastapi import APIRouter, Depends

from app.deps import require_family
from app.models import User
from app.schemas.ai import ParseRequest, ParseResponse
from app.services.ai_parser import parse


router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.post("/parse-record", response_model=ParseResponse)
async def parse_record(
    req: ParseRequest,
    current_user: User = Depends(require_family),
) -> ParseResponse:
    parsed = await parse(req.text)
    missing = [key for key in ("value", "period") if getattr(parsed, key) is None]
    return ParseResponse(parsed=parsed, missing=missing, raw_text=req.text)
