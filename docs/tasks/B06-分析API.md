# B06 · 分析 API

## 目标
实现按天矩阵、趋势图、周期报表三个分析端点。

## 前置依赖
B05

## 上下文
- 概要设计 §6.5（分析 API）、§9.4（矩阵聚合规则）、§9.5（异常天数）
- PRD §6.4 / §6.5 / §6.6

## 输入
- `GlucoseRecord` 模型与 grading 服务（B05）

## 输出

```
backend/
└── app/
    ├── routers/
    │   └── analytics.py
    ├── schemas/
    │   └── analytics.py
    └── services/
        └── analytics.py
```

## 详细需求

### app/schemas/analytics.py

```python
class CellDTO(BaseModel):
    value: float
    status: StatusDTO   # 复用 record 中的 StatusDTO

class DayMatrixDTO(BaseModel):
    date: date
    cells: Dict[str, Optional[CellDTO]]
    # cells 的 key 是时段枚举（fasting/after_breakfast/...）
    # 值为 null 表示该时段当天无记录

class MatrixResponse(BaseModel):
    days: List[DayMatrixDTO]   # 倒序，今天在第一位

class ChartPointDTO(BaseModel):
    measured_at: datetime
    value: float
    status: StatusDTO

class DistributionDTO(BaseModel):
    low: int
    ideal: int
    ok: int
    high: int
    vhigh: int

class ChartStatsDTO(BaseModel):
    count: int
    avg: Optional[float]
    max: Optional[float]
    min: Optional[float]
    distribution: DistributionDTO

class ChartResponse(BaseModel):
    points: List[ChartPointDTO]
    stats: ChartStatsDTO

class ByPeriodStatDTO(BaseModel):
    period: str
    period_label: str
    avg: Optional[float]
    count: int
    status: Optional[StatusDTO]   # 用 avg 值算 status

class ReportSummaryDTO(BaseModel):
    count: int
    avg: Optional[float]
    overall_status: Optional[StatusDTO]
    abnormal_days: int
    ideal_pct: float

class ReportResponse(BaseModel):
    summary: ReportSummaryDTO
    distribution: DistributionDTO
    by_period: List[ByPeriodStatDTO]   # 8 个时段固定顺序
```

### app/services/analytics.py

#### get_matrix(session, family_id, from_date, to_date) -> MatrixResponse
- 按 `family_id` + `measured_at` 区间 SELECT 全部记录
- 在 Python 中按 `(date(measured_at), period)` 分组，每组保留 `measured_at` 最新的一条
- 输出 `days` 倒序，每天都包含 8 个 period key

#### get_chart(session, family_id, from_date, to_date, period: Optional[str]) -> ChartResponse
- query 同上，可加 period 过滤
- points 按 measured_at asc 排序，最多 1000 个（超出截断并日志警告）
- stats 全部用查询结果计算，distribution 按 grade 分桶

#### get_report(session, family_id, from_date, to_date) -> ReportResponse
- count / avg / max / min / distribution 同 chart
- abnormal_days：将记录按日期分组，凡有任意 status in {low, high, vhigh} 即记一天
- ideal_pct = ideal_count / count（count=0 时为 0.0）
- by_period：按 8 个时段固定顺序输出，未出现的 period 也显示 count=0/avg=None/status=None
- overall_status：用 `avg` 值套 grade（period 用 fasting 标准近似）

### app/routers/analytics.py

| 方法 | 路径 | 依赖 |
| --- | --- | --- |
| GET | /matrix | require_family |
| GET | /chart | require_family |
| GET | /report | require_family |

参数校验：
- `from`/`to` 必须存在；`from <= to`，否则 400 `ERR_INVALID_RANGE`
- 范围跨度 ≤ 365 天；超过 400 `ERR_RANGE_TOO_LARGE`

## 验收标准

- [ ] 准备测试数据：连续 10 天每天 2 条记录，调 `/matrix?from=...&to=...` 响应中 days 长度 == 10，每天 cells 含全部 8 个 period key
- [ ] 同一天同时段重测两次，矩阵中显示最新的那条
- [ ] `/chart?period=fasting` 仅返回空腹记录
- [ ] `/report` 返回的 abnormal_days 等于人工统计值
- [ ] from > to → 400 ERR_INVALID_RANGE
- [ ] 范围 400 天 → 400 ERR_RANGE_TOO_LARGE
- [ ] 跨家庭隔离：A 家用户调 analytics 不会看到 B 家的数据

## 不在范围内
- 导出（B08）
- AI 异常提醒（后续阶段）
