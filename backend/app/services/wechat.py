import httpx

from app.config import settings


class WechatLoginError(Exception):
    def __init__(self, errcode: int, errmsg: str) -> None:
        self.errcode = errcode
        self.errmsg = errmsg
        super().__init__(f"{errcode}: {errmsg}")


async def code_to_openid(code: str) -> str:
    if settings.APP_ENV == "development" and settings.WX_MOCK_OPENID:
        return settings.WX_MOCK_OPENID

    params = {
        "appid": settings.WX_APPID,
        "secret": settings.WX_SECRET,
        "js_code": code,
        "grant_type": "authorization_code",
    }

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                "https://api.weixin.qq.com/sns/jscode2session",
                params=params,
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WechatLoginError(-1, "微信登录接口调用失败") from exc

    errcode = int(data.get("errcode", 0) or 0)
    if errcode != 0:
        raise WechatLoginError(errcode, data.get("errmsg", "微信登录失败"))

    openid = data.get("openid")
    if not openid:
        raise WechatLoginError(-1, "微信登录响应缺少 openid")

    return str(openid)
