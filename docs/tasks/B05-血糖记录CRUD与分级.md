# B05 · 血糖记录 CRUD 与分级

## 目标
实现血糖记录的增删改查 + 颜色分级算法。`POST /records` 必须在响应中返回带 status 信息的完整对象。

## 前置依赖
B03

## 上下文
- 概要设计 §6.4（血糖记录 API）、§9.1（颜色分级算法）、§9.2（5 分钟取整）
- PRD §6.1 / §6.2 / §6.3 / §7（颜色分级规则）

## 输入
- `app/models.GlucoseRecord`、`app/models.Family`（B02）
- `app/enums`（B02）
- 鉴权依赖 `require_family`（B03）

## 输出

```
backend/
└── app/
    ├── routers/
    │   └── records.py
    ├── schemas/
    │   └── record.py
    └── services/
        ├── grading.py
        └── time_utils.py
```

注册到 main.py。

## 详细需求

### app/services/time_utils.py
```python
def round_to_5min(dt: datetime) -> datetime:
    """向最近的 5 分钟取整。3 分钟以下舍去，≥3 分钟进位。"""
    minute = dt.minute
    new_minute = (minute // 5) * 5
    if minute % 5 >= 3:
        new_minute += 5
    if new_minute == 60:
        return (dt.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
    return dt.replace(minute=new_minute, second=0, microsecond=0)
```

### app/services/grading.py
按概要设计 §9.1 实现 `grade(value, period, std) -> GradeLevel`。同时提供：

```python
def grade_with_meta(value: float, period: str, std: Family) -> dict:
    """返回 { level, label, color, target_low, target_high }"""
```

`target_low/high` 用于前端展示"理想范围 4.4-7.8"等说明文字。

### app/schemas/record.py
```python
class RecorderDTO(BaseModel):
    id: int
    nickname: str
    avatar_url: Optional[str]

class StatusDTO(BaseModel):
    level: str       # low|ideal|ok|high|vhigh
    label: str       # 偏低|理想|一般|偏高|过高
    color: str       # #RRGGBB
    target_low: float
    target_high: float

class RecordDTO(BaseModel):
    id: int
    value: float
    unit: str = "mmol/L"
    period: str
    period_label: str
    measured_at: datetime
    note: Optional[str]
    source: str
    recorder: RecorderDTO
    status: StatusDTO
    created_at: datetime
    updated_at: datetime

class CreateRecordRequest(BaseModel):
    value: float = Field(gt=0, lt=50)
    period: str  # 时段枚举校验
    measured_at: datetime
    note: Optional[str] = Field(default=None, max_length=200)
    source: str = "manual"  # 校验 in {manual, ai}

class UpdateRecordRequest(BaseModel):
    value: Optional[float] = Field(default=None, gt=0, lt=50)
    period: Optional[str] = None
    measured_at: Optional[datetime] = None
    note: Optional[str] = Field(default=None, max_length=200)

class RecordListResponse(BaseModel):
    items: List[RecordDTO]
    total: int
    page: int
    size: int
```

### app/routers/records.py

| 方法 | 路径 | 依赖 | 行为 |
| --- | --- | --- | --- |
| GET | / | require_family | 列表（分页+筛选） |
| POST | / | require_family | 新增 |
| GET | /{id} | require_family | 详情 |
| PATCH | /{id} | require_family + 自己记的 | 编辑 |
| DELETE | /{id} | require_family + 自己记的 | 删除 |

#### GET /
- query：`from`（ISO 日期，含）, `to`（ISO 日期，含）, `period`（可选），`page` 默认 1，`size` 默认 20，`size` 上限 100
- 排序：`measured_at DESC, id DESC`
- 仅返回 `family_id == current_user.family_id` 的记录
- total 走 `select(func.count())`
- 每条 record 拼装 RecorderDTO + StatusDTO（用当前家庭的 standards）

#### POST /
- 校验 period 在枚举内，否则 400 `ERR_INVALID_PERIOD`
- `measured_at = round_to_5min(req.measured_at)`
- INSERT，返回 RecordDTO（拼装 status）

#### PATCH/DELETE
- 必须 `record.recorder_id == current_user.id`，否则 403 `ERR_NOT_RECORDER`
- PATCH 只覆盖请求中非空字段；measured_at 也走 5 分钟取整
- DELETE 物理删除（首版不做软删）

## 验收标准

- [ ] grading.py 单元测试：覆盖五档边界（3.8/3.9/4.4/6.1/6.2/7.8/13.8/13.9/14.0），空腹与餐后两套标准
- [ ] round_to_5min 单元测试：09:23 → 09:25、09:22 → 09:20、09:58 → 10:00、09:00 → 09:00
- [ ] 创建一条 `value=11.1, period=fasting` 后，响应中 `status.level=high`、color=#FA8C16
- [ ] 创建一条 `value=8.2, period=after_breakfast` → status.level=ok（在 7.8 上限到 13.9*0.85=11.815 之间用 high 还是 ok 由算法决定，需对照算法验证）
- [ ] GET 列表按 measured_at desc 排序
- [ ] 用户 A 不能 PATCH 用户 B 创建的记录 → 403
- [ ] measured_at=09:23 创建后 DB 里实际存的是 09:25
- [ ] 跨家庭查询：A 家成员尝试访问 B 家记录 ID → 404 `ERR_RECORD_NOT_FOUND`（注意是 404 而非 403，避免泄漏存在性）

## 不在范围内
- 分析端点（B06）
- 导出（B08）
- AI 解析（B09）
