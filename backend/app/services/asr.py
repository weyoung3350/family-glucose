"""阿里 DashScope 语音识别（qwen-audio-turbo）。

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


_TRANSCRIBE_PROMPT = "请把这段语音原样转写成文字，不要添加任何解释或标点修正，直接输出转写结果。"


async def transcribe(audio_bytes: bytes, mime: str = "audio/mp3") -> str:
    if not settings.DASHSCOPE_API_KEY:
        raise ASRError("ERR_ASR_NOT_CONFIGURED", "语音识别未配置")
    if len(audio_bytes) == 0:
        raise ASRError("ERR_AUDIO_EMPTY", "录音为空")
    if len(audio_bytes) > settings.ASR_MAX_BYTES:
        raise ASRError("ERR_AUDIO_TOO_LARGE", "录音过长，请缩短到 60 秒内")

    audio_b64 = base64.b64encode(audio_bytes).decode()
    payload = {
        "model": "qwen-audio-turbo",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"audio": f"data:{mime};base64,{audio_b64}"},
                        {"text": _TRANSCRIBE_PROMPT},
                    ],
                }
            ]
        },
    }
    headers = {
        "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    url = f"{settings.DASHSCOPE_BASE_URL}/services/aigc/multimodal-generation/generation"

    try:
        async with httpx.AsyncClient(timeout=settings.ASR_TIMEOUT_SEC) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise ASRError("ERR_ASR_NETWORK", "语音识别服务连接失败") from exc

    if response.status_code != 200:
        raise ASRError(
            "ERR_ASR_HTTP",
            f"语音识别服务异常 (HTTP {response.status_code})",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise ASRError("ERR_ASR_PARSE", "语音识别响应格式异常") from exc

    if "output" not in data:
        msg = data.get("message", "语音识别失败")
        raise ASRError("ERR_ASR_API", f"识别失败：{msg}")

    try:
        choices = data["output"].get("choices") or []
        if not choices:
            raise KeyError("no choices")
        content = choices[0]["message"]["content"]
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    text = item["text"]
                    break
            else:
                raise KeyError("no text in content list")
        else:
            text = content
    except (KeyError, IndexError, TypeError) as exc:
        raise ASRError("ERR_ASR_PARSE", "语音识别响应格式异常") from exc

    text = (text or "").strip()
    if not text:
        raise ASRError("ERR_ASR_EMPTY", "未识别到有效语音内容")
    return text
