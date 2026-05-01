# F06 · AI 一句话快记 P02b

## 目标
实现 P02b：用户输入文字或语音 → 调后端解析 → 展示识别结果卡片 → 用户点击"确认保存"才入库。

## 前置依赖
F02、B05、B09

## 上下文
- PRD §6.2b
- 概要设计 §6.6 / §8
- 原型截图：`docs/assets/家有糖人/P02b-一句话快记_AI模式_.png`

## 输入
- `api.parseRecord(text)` 返回 ParseResponse
- `api.createRecord(data)` 用于最终保存

## 输出

```
miniprogram/
└── pages/
    └── ai-add/
        ├── ai-add.js
        ├── ai-add.wxml
        ├── ai-add.wxss
        └── ai-add.json
```

## 详细需求

### 顶部分段切换
"手动录入"（点击 redirect 回 add）/ "AI 一句话"（当前激活）。

### 输入区
卡片内：
- 多行 textarea（minHeight 160rpx，autoFocus 默认开）
- placeholder："试试说：早上 9:20 空腹血糖 11.1，吃了二甲双胍"
- 下方：圆形麦克风按钮（橙底白色 mic icon）+ 文字"长按说话，松开识别" + 右侧"清空"小按钮

#### 语音录入
- 按下：`wx.startRecord({ success: ()=>{}, fail: ... })`
- 松开：`wx.stopRecord()`，得到临时文件 → 调微信内置 `wx.translateVoice`（如可用）或先 `wx.uploadFile` 到自家后端再调云厂商 ASR
- **首版简化**：使用微信小程序原生 `getRecorderManager()` + 取消语音上传，直接给用户提示"语音功能即将开放，请用文字输入"。麦克风按钮长按时显示提示弹窗，松开恢复。这避免了语音 ASR 的额外接入工作。
- F06 任务范围内只搭建 UI 框架，文本路径必须可用。语音转文字以 hook 形式留出接口（`onVoiceResult(text)`）以备后续接入。

### 解析按钮
卡片底部"智能识别"按钮（不是必须，输入后自动 debounce 500ms 调一次解析也可。**首版**：用户输入后失焦或停顿 800ms 后自动解析；同时提供"重新识别"小按钮）。

### 识别结果卡片
顶部小标签"已识别（点字段可改）"。下方列出 4 行：
- 血糖值 → 大数字 + 单位 + ›
- 时段 → 文字（如为推断则附"推断"灰字标记）+ ›
- 测量时间 → "今天 09:20" + ›
- 备注 → 截短显示

每行点击 → 浮起一个简单的 picker（数字键盘 / 时段 chips / 时间 picker / 备注 input），改完即更新本地 state。

### 缺字段提示
若 `missing` 含 `value` 或 `period`，顶部红色横条提示："未识别到血糖值，请补充或重新输入" / "未识别到时段，请选择"。"确认保存"按钮置灰禁用。

### 底部按钮
两个：
- "重新输入"（btn-ghost，清空整个状态回到输入态）
- "确认保存"（btn-primary，禁用条件：value/period 任一为空）
  - 调 `api.createRecord({ value, period, measured_at, note, source:"ai" })`
  - 成功 → toast "保存成功" → `wx.switchTab("/pages/index/index")`

## 验收标准

- [ ] 输入"早上 9:20 空腹血糖 11.1，吃了二甲双胍"，800ms 后解析卡片自动出现，4 个字段正确
- [ ] 输入"血糖 11.1"，提示缺时段，确认保存按钮置灰
- [ ] 修改某一字段后，确认保存的请求 body 是修改后的值
- [ ] 后端返回 `period_inferred=true` 时该字段后显示"（推断）"小灰字
- [ ] 点"重新输入"清空 textarea 与解析结果
- [ ] 网络异常时输入框下显示红字提示，不阻断用户继续编辑
- [ ] 顶部分段切换"手动录入"可跳回 P02
- [ ] 视觉与 P02b 原型截图差异 ≤ 10%

## 不在范围内
- 语音真实 ASR 接入（首版仅文本，留 hook）
- 多条记录批量
- 跨日支持（提示用户改时间手动）
