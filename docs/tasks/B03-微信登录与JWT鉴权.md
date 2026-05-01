# B03 · 微信登录与 JWT 鉴权

## 目标
实现 `POST /api/v1/auth/login`：拿前端 wx.login 的 code 换 openid，upsert user，签 JWT 返回。提供 `get_current_user` 依赖供后续路由使用。

## 前置依赖
B02

## 上下文
- 概要设计 §6.1（鉴权 API）、§7（认证流程）、§8（家庭范围隔离）
- PRD §8.1（首次使用流程）

## 输入
- `app/models.py`、`app/database.py`（B02 输出）
- 微信开放平台 `code2Session` 接口

## 输出

```
backend/
└── app/
    ├── security.py
    ├── deps.py
    ├── schemas/
    │   ├── __init__.py
    │   └── auth.py
    ├── services/
    │   └── wechat.py
    └── routers/
        └── auth.py
```

## 详细需求

### app/security.py
- `def create_access_token(data: dict) -> str`：HS256 签名，过期 `settings.JWT_TTL_DAYS` 天，密钥 `settings.JWT_SECRET`
- `def decode_token(token: str) -> dict`：抛 `jwt.JWTError` 给上层
- `def generate_invite_code(length: int = 6) -> str`：从字符集 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` 用 `secrets.choice` 取 N 字符

### app/services/wechat.py
- `async def code_to_openid(code: str) -> str`：
  - 调用 `GET https://api.weixin.qq.com/sns/jscode2session?appid=&secret=&js_code=&grant_type=authorization_code`
  - 用 `httpx.AsyncClient(timeout=5)`
  - 微信返回的 `errcode` != 0 时抛 `WechatLoginError(errcode, errmsg)`，否则返回 openid
  - 提供环境变量 `WX_MOCK_OPENID` 用于本地开发：当 `APP_ENV=development` 且该值非空时直接返回，不调微信

### app/schemas/auth.py
```python
class LoginRequest(BaseModel):
    code: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None

class UserDTO(BaseModel):
    id: int
    nickname: str
    avatar_url: Optional[str]
    role: Optional[str]

class FamilyDTO(BaseModel):
    id: int
    name: str
    role_of_me: str  # creator | member
    member_count: int

class LoginResponse(BaseModel):
    token: str
    user: UserDTO
    family: Optional[FamilyDTO]  # null 时前端跳 P09
```

### app/routers/auth.py
- `POST /api/v1/auth/login`：
  - 调 `code_to_openid(req.code)`
  - `select(User).where(User.openid == openid)` upsert
  - 若存在且前端传了新的 nickname/avatar_url，更新一下
  - 签 JWT：`{"sub": user.id, "openid": openid_last4, "exp": ...}`（不放完整 openid，仅尾 4 位用于审计）
  - 拼装响应（family 部分见下）
- 错误：
  - 微信失败 → 502 `ERR_WX_API`
  - code 非法 → 400 `ERR_WX_CODE_INVALID`

### app/deps.py
- `def get_session() -> Generator[Session]`：从 database 导出
- `def get_current_user(authorization: str = Header(...), session: Session = Depends(get_session)) -> User`：
  - 解析 `Bearer xxx`，否则 401 `ERR_TOKEN_INVALID`
  - decode_token，过期/非法 → 401 `ERR_TOKEN_INVALID`
  - 查 user，不存在 → 401 `ERR_USER_NOT_FOUND`
  - 返回 user
- `def require_family(user: User = Depends(get_current_user)) -> User`：family_id 为空 → 403 `ERR_NOT_IN_FAMILY`
- `def require_creator(user: User = Depends(require_family)) -> User`：role != "creator" → 403 `ERR_PERMISSION_DENIED`

## 验收标准

- [ ] 设置 `WX_MOCK_OPENID=test_openid_123 APP_ENV=development` 后 `curl -XPOST localhost:8080/api/v1/auth/login -d '{"code":"any","nickname":"妈妈"}'` 返回 200，含 token、user、family=null
- [ ] 重复登录同一 mock openid，user.id 不变，nickname 被更新
- [ ] 不带 token 调 `GET /api/v1/families/me`（即便此路由还没实现，也应被中间件拦在 401，因为 require_family 依赖会先跑——本任务暂用一个临时 `GET /api/v1/me` 测）
  - 子任务：在 router 中临时加 `GET /api/v1/me` 返回 `{"id": user.id}`，仅用于 B03 验证，B04 后可删
- [ ] 带过期 token 调 `/api/v1/me` 返回 401 `{"code":"ERR_TOKEN_INVALID",...}`
- [ ] `python -c "from app.security import generate_invite_code; print(generate_invite_code())"` 输出 6 位无 0/O/1/I 字符的字符串

## 不在范围内
- 家庭管理逻辑（B04）
- 真实微信 AppID 接入测试（用户配置 .env 后自测）
