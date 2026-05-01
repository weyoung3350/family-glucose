# B09 · AI 一句话解析

## 目标
实现 `POST /api/v1/ai/parse-record`：接收一段中文，返回结构化字段（value/period/measured_at/note）+ 缺失字段提示。LLM 主路径走 DeepSeek，失败时降级规则解析器。

## 前置依赖
B05

## 上下文
- 概要设计 §6.6、§8（AI 解析实现）
- PRD §6.2b

## 输入
- 时段枚举与时段窗口（B02）
- `round_to_5min`（B05）

## 输出

```
backend/
└── app/
    ├── routers/
    │   └── ai.py
    ├── schemas/
    │   └── ai.py
    └── services/
        └── ai_parser.py
```

## 详细需求

### app/schemas/ai.py
```python
class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)

class ParsedFields(BaseModel):
    value: Optional[float]
    period: Optional[str]
    period_inferred: bool = False
    measured_at: Optional[datetime]
    measured_at_inferred: bool = False
    note: Optional[str]

class ParseResponse(BaseModel):
    parsed: ParsedFields
    missing: List[str]    # ['value','period'] 子集
    raw_text: str
```

### app/services/ai_parser.py

提供：
```python
async def parse(text: str) -> ParsedFields: ...
```

#### 主路径：DeepSeek
- 当 `settings.LLM_PROVIDER == "deepseek"` 且 `DEEPSEEK_API_KEY` 非空：
  - POST `${DEEPSEEK_BASE_URL}/chat/completions`
  - 请求体：
    ```json
    {
      "model": "deepseek-chat",
      "messages": [
        {"role":"system","content": SYSTEM_PROMPT},
        {"role":"user","content": text}
      ],
      "response_format": {"type":"json_object"},
      "temperature": 0
    }
    ```
  - SYSTEM_PROMPT 内容见概要设计 §8.2
  - 超时 `LLM_TIMEOUT_SEC` 秒，超时或非 200 → fallback
  - 解析返回的 JSON，校验字段类型
  - measured_at 处理：DeepSeek 返回 `HH:MM` 字符串，结合 today 日期合成 datetime；若得到 `null` 则 fallback 到 `now`
  - period 处理：若 LLM 没给 period 但给了 measured_at，按时段窗口推断并标 `period_inferred=true`；若两者都没给，period 留 None

#### 兜底：规则解析器
- value：正则 `r'(\d+(?:[.．]\d+)?)'` 取第一组（替换 `．` 为 `.`），过滤明显非血糖的数字（如时间中的小时）
- 时段词典：
  ```python
  PERIOD_WORDS = {
      "fasting": ["空腹","早晨空腹","刚睡醒"],
      "before_breakfast": ["早餐前","早饭前"],
      "after_breakfast": ["早餐后","早饭后"],
      "before_lunch": ["午餐前","午饭前"],
      "after_lunch": ["午餐后","午饭后","中午饭后","中餐后"],
      "before_dinner": ["晚餐前","晚饭前"],
      "after_dinner": ["晚餐后","晚饭后"],
      "bedtime": ["睡前","临睡前"],
  }
  ```
- 时间：正则 `r'(\d{1,2})[:：点](\d{0,2})'`，结合"上午/下午/晚上"前缀判断
  - 中文数字：建立 `{"零":0,"一":1,...,"十":10,"十一":11,...,"二十三":23}` 映射
- 备注：剥离上述识别到的子串后，剩余非空文本（去标点空白）若 ≥2 字则作为 note
- 所有时间均做 5 分钟取整

#### value 兜底
若 raw text 含"血糖" 关键字附近的数字，优先取该数字；否则取第一个"4-30"区间的数字。

### app/routers/ai.py

| 方法 | 路径 | 依赖 |
| --- | --- | --- |
| POST | /api/v1/ai/parse-record | require_family |

- 调 `parse(text)` 拿到 ParsedFields
- 计算 missing：`['value']`（如 value 为空）、`['period']`（如 period 为空且 inferred=False 也为空）
  - 实际逻辑：missing = [k for k in ('value','period') if getattr(parsed, k) is None]
- 返回 ParseResponse

注意：本端点**不写库**，写库是 POST /records 的事。前端拿到响应后让用户确认再调 records POST。

## 验收标准

单元测试覆盖以下输入（mock LLM 关闭，仅测规则解析器）：

- [ ] "早上 9:20 空腹血糖 11.1，吃了二甲双胍" → value=11.1, period=fasting, measured_at=今天 09:20, note="吃了二甲双胍"
- [ ] "9:20 血糖 11.1" → value=11.1, period=after_breakfast（推断，09:20 在窗口内）, period_inferred=true
- [ ] "刚才血糖 7.8" → value=7.8, period 按当前时间推断，period_inferred=true, measured_at_inferred=true
- [ ] "饭后两小时 8.0" → value=8.0, period 推断为最近一餐后, period_inferred=true
- [ ] "11.1" → value=11.1, period=null, missing=['period']
- [ ] "" → 400（schema 校验）
- [ ] 输入 mock 异常 LLM（用环境变量 `LLM_PROVIDER=fail` + 短超时）→ 自动 fallback 到规则解析器，仍能返回结果
- [ ] 集成测试：真实带 DeepSeek key（如可获取），输入 "下午两点空腹血糖 6.5" → 期望 value=6.5, period=fasting（虽然下午两点说空腹罕见，LLM 应尊重用户原话）

## 不在范围内
- 多条记录批量解析（首版仅单条）
- 跨日支持（首版限当天）
- 语音转文字（前端用微信 wx.startRecord + wx.translateVoice 或 plugin，本任务后端只接收文本）
