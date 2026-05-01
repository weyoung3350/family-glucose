# B04 · 家庭管理 API

## 目标
实现家庭的全套管理：创建、加入、查看、改名、移除成员、退出、解散。

## 前置依赖
B03

## 上下文
- 概要设计 §6.2（家庭 API）、§7.3（家庭范围隔离）
- PRD §4（用户角色）、§6.8、§6.8b、§6.9

## 输入
- `app/security.generate_invite_code`（B03）
- 鉴权依赖 `require_family` / `require_creator`（B03）

## 输出

```
backend/
└── app/
    ├── routers/
    │   └── families.py
    └── schemas/
        └── family.py
```

并把 router 注册到 `app/main.py`。

## 详细需求

### app/schemas/family.py
```python
class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=20)

class JoinFamilyRequest(BaseModel):
    invite_code: str = Field(min_length=6, max_length=6)

class UpdateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=20)

class MemberDTO(BaseModel):
    id: int
    nickname: str
    avatar_url: Optional[str]
    role: str  # creator | member
    joined_at: Optional[datetime]
    is_me: bool

class FamilyFullDTO(BaseModel):
    id: int
    name: str
    invite_code: Optional[str]      # 仅 creator 可见，否则 None
    fasting_low: float
    fasting_high: float
    postprandial_low: float
    postprandial_high: float
    critical_low: float
    critical_high: float
    role_of_me: str
    member_count: int

class FamilyDetailResponse(BaseModel):
    family: FamilyFullDTO
    members: List[MemberDTO]
```

### app/routers/families.py

实现以下端点（前缀 `/api/v1/families`）：

| 方法 | 路径 | 依赖 | 行为 |
| --- | --- | --- | --- |
| POST | / | get_current_user（不要求已加入） | 创建家庭 |
| POST | /join | get_current_user（不要求已加入） | 加入家庭 |
| GET | /me | require_family | 当前家庭信息 |
| PATCH | /me | require_creator | 改家庭名 |
| DELETE | /me/members/{user_id} | require_creator | 移除成员 |
| POST | /me/leave | require_family | 自己退出（仅成员） |
| DELETE | /me | require_creator | 解散家庭 |

#### POST /
- 用户当前 family_id 必须为空，否则 400 `ERR_USER_ALREADY_IN_FAMILY`
- 校验 `name` 唯一（DB 唯一索引），重复时 409 `ERR_FAMILY_NAME_TAKEN`
- 生成 invite_code（冲突时重试最多 5 次）
- INSERT family，creator_id 暂置 user.id
- 更新 user：family_id=family.id, role="creator", joined_at=now
- 返回 `FamilyDetailResponse`，invite_code 暴露

#### POST /join
- 用户当前 family_id 必须为空，否则 400 `ERR_USER_ALREADY_IN_FAMILY`
- 按 invite_code 查 family，找不到 404 `ERR_INVITE_CODE_INVALID`
- 更新 user：family_id, role="member", joined_at=now
- 返回 `FamilyDetailResponse`，invite_code = None

#### GET /me
- 拼装当前家庭 + 成员列表
- 仅 creator 在响应里能看到 invite_code，member 看到 None
- members 列表中 `is_me` 字段标识当前用户

#### PATCH /me
- 仅 creator
- 校验新 name 唯一性，重复 409 `ERR_FAMILY_NAME_TAKEN`
- 更新 family.name, updated_at

#### DELETE /me/members/{user_id}
- 仅 creator
- 不能踢自己 → 400 `ERR_CANNOT_REMOVE_SELF`
- 目标 user 必须 family_id == 当前 family.id，否则 404 `ERR_USER_NOT_IN_FAMILY`
- 把目标 user 的 family_id, role, joined_at 全部置 null
- **保留**该 user 已记录的 GlucoseRecord（不级联删除）

#### POST /me/leave
- 仅 member（creator 调用 → 400 `ERR_CREATOR_CANNOT_LEAVE`，让其用 DELETE /me 解散）
- 把自己 family_id 等置 null

#### DELETE /me
- 仅 creator
- 删除 family 行 + 把所有 user.family_id 置 null
- **保留**所有 GlucoseRecord（family_id 字段保留指向已删 family，但前端无入口能查询，等同归档）

### app/main.py
注册路由：
```python
from app.routers import auth, families
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(families.router, prefix="/api/v1/families", tags=["families"])
```

## 验收标准

- [ ] 用户 A 创建家庭 "咱家"，返回 invite_code 可见
- [ ] 用户 B 用 invite_code 加入，B 在 GET /me 中 role=member、invite_code 字段为 null
- [ ] 用户 A 再次创建同名 "咱家" → 409 ERR_FAMILY_NAME_TAKEN
- [ ] 用户 B 调 PATCH /me 改家庭名 → 403 ERR_PERMISSION_DENIED
- [ ] 用户 A 调 DELETE /me/members/B 后 B 的 GET /me → 403 ERR_NOT_IN_FAMILY
- [ ] 用户 B 调 POST /me/leave 在加入新家庭后能成功
- [ ] 创建者调 POST /me/leave → 400 ERR_CREATOR_CANNOT_LEAVE
- [ ] 创建者调 DELETE /me 解散家庭后，所有曾经的 member GET /me → 403
- [ ] 邀请码用错的字母（如 "AAAAAA" 不存在）→ 404 ERR_INVITE_CODE_INVALID
- [ ] 单元测试：覆盖以上每条路径，至少 12 个测试用例

## 不在范围内
- 自定义血糖标准（B07 处理）
- 微信分享的小程序原生能力（前端任务）
