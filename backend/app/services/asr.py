"""阿里 DashScope 语音识别（qwen-omni-turbo，OpenAI 兼容模式）。

接收音频字节流（小程序上传 mp3），同步返回转写文字。
失败时抛出 ASRError。
"""
import base64

import httpx

from app.config import settings


class ASRError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


_TRANSCRIBE_PROMPT = (
    "请把这段语音原样转写成文字，只输出转写结果，不要添加任何解释、标点修正或前后缀。"
)


async def transcribe(audio_bytes: bytes, mime: str = "audio/mp3") -> str:
    if not settings.DASHSCOPE_API_KEY:
        raise ASRError("ERR_ASR_NOT_CONFIGURED", "语音识别未配置")
    if len(audio_bytes) == 0:
        raise ASRError("ERR_AUDIO_EMPTY", "录音为空")
    if len(audio_bytes) > settings.ASR_MAX_BYTES:
        raise ASRError("ERR_AUDIO_TOO_LARGE", "录音过长，请缩短到 60 秒内")

    audio_b64 = base64.b64encode(audio_bytes).decode()
    audio_format = "mp3"
    if mime and "/" in mime:
        ext = mime.split("/", 1)[1].split(";", 1)[0].strip().lower()
        if ext in {"mp3", "wav", "m4a", "aac", "amr", "ogg"}:
            audio_format = ext

    payload = {
        "model": settings.ASR_MODEL,
        "modalities": ["text"],
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": f"data:audio/{audio_format};base64,{audio_b64}",
                            "format": audio_format,
                        },
                    },
                    {"type": "text", "text": _TRANSCRIBE_PROMPT},
                ],
            }
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    url = f"{settings.DASHSCOPE_BASE_URL}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=settings.ASR_TIMEOUT_SEC) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise ASRError("ERR_ASR_NETWORK", "语音识别服务连接失败") from exc

    if response.status_code != 200:
        try:
            err_body = response.json()
            err_msg = (err_body.get("error") or {}).get("message") or err_body.get("message")
        except ValueError:
            err_msg = response.text[:200]
        raise ASRError(
            "ERR_ASR_HTTP",
            f"语音识别服务异常 (HTTP {response.status_code}): {err_msg}",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise ASRError("ERR_ASR_PARSE", "语音识别响应格式异常") from exc

    try:
        choices = data.get("choices") or []
        if not choices:
            raise KeyError("no choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(item.get("text") or "")
                elif isinstance(item, dict) and "text" in item:
                    text_parts.append(item.get("text") or "")
            text = "".join(text_parts)
        else:
            text = content or ""
    except (KeyError, IndexError, TypeError) as exc:
        raise ASRError("ERR_ASR_PARSE", "语音识别响应格式异常") from exc

    text = (text or "").strip()
    if not text:
        raise ASRError("ERR_ASR_EMPTY", "未识别到有效语音内容")
    return text
