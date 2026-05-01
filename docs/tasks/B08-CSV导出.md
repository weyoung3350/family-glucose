# B08 · CSV 导出

## 目标
实现 `GET /api/v1/export/csv` 返回家庭范围血糖记录的 CSV 文件流。

## 前置依赖
B05

## 上下文
- 概要设计 §6.7（导出 API）
- PRD §6.11

## 输入
- `GlucoseRecord` 模型 + grading 服务（B05）

## 输出

```
backend/
└── app/
    ├── routers/
    │   └── export.py
    └── services/
        └── csv_export.py
```

## 详细需求

### app/services/csv_export.py
- `def stream_csv(session, family_id, from_date, to_date) -> Iterator[str]`：返回逐行 CSV
- 字段顺序：`date, time, period, period_label, value, unit, status, recorder, note`
- `date` = `YYYY-MM-DD`，`time` = `HH:MM`（已经是 5 分钟刻度）
- 第一行 BOM `﻿` 然后是表头
- 表头中文：`日期,时间,时段,时段名,血糖值,单位,状态,记录人,备注`
- value 保留 1 位小数
- status 用中文（理想/偏高 等）
- recorder 用 nickname（如为空字符串显示"未命名"）
- note 中包含逗号需要双引号包裹并转义

### app/routers/export.py

| 方法 | 路径 | 依赖 |
| --- | --- | --- |
| GET | /api/v1/export/csv | require_family |

- query：`from`、`to`，校验同 B06
- 返回 `StreamingResponse(stream_csv(...), media_type="text/csv; charset=utf-8")`
- 响应头：`Content-Disposition: attachment; filename="家有糖人_{from}_{to}.csv"`（filename 用 RFC 5987 编码处理中文）
- 大文件不一次性加载到内存：分页查 1000 条/批生成

## 验收标准

- [ ] curl 下载的文件用 Excel 直接打开，中文不乱码（BOM 生效）
- [ ] 导出文件第一行是中文表头
- [ ] 导出条数与 GET /records?from=&to=（不分页累计）数量一致
- [ ] 备注里有逗号或换行的记录正确转义
- [ ] 跨家庭：A 家用户拿到的 CSV 不含 B 家数据
- [ ] from=2026-01-01&to=2026-04-29 范围导出 1000+ 条不会内存溢出

## 不在范围内
- PDF 导出（不做）
- 自定义字段（首版固定 9 列）
