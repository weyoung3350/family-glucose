# T01 · 家有糖人小程序 UX 修订方案

> **配套文档：** [`T01-UX评估报告.md`](./T01-UX评估报告.md)
> **方案版本：** v1.0 · 2026-04-30
> **方案作者：** Claude（Cowork）
> **覆盖范围：** 评估报告中 21 项 P0 + 12 项 P1 的具体修复路径
> **预估总工作量：** P0 共约 9-12 人天；P1 共约 6-8 人天

---

## 0. 改动统计

| 类别 | 文件数 | 改动范围 |
|---|---|---|
| 后端（FastAPI/Python） | 6 | grading 算法、records 列表 today_count、records 编辑权限、family 唯一约束、迁移脚本 |
| 前端（小程序） | 14 | 设计 token、record-card、index、add、ai-add、family、me、analytics、period-picker 等 |
| 资源（图标） | 4-6 | menu icon、空态 icon、tab-bar 优化（可选） |
| 文档 | 2 | T01 验收报告补充修复后回归 + 升级到 v0.2 |

落地后建议跑 codex 已写好的 `tests/automation/p0.test.js` 做回归。

---

## Epic 1 · 颜色与血糖分级（最优先，最快收益）

### Epic-1.1 修复 grading 颜色不可辨

**关联问题：** P0-DS-1, P0-A11Y-1

**改动文件：**

#### 后端 `backend/app/enums.py`

```diff
 GRADE_COLORS = {
     GradeLevel.low:   "#4DA3FF",  # 蓝（保持）
     GradeLevel.ideal: "#52C41A",  # 绿（保持）
-    GradeLevel.ok:    "#FAAD14",  # 暖黄/橙黄
-    GradeLevel.high:  "#FA8C16",  # 橙
+    GradeLevel.ok:    "#FFC53D",  # 改为亮黄（明度 84%，与橙系拉开 ≥ 15° 色相差）
+    GradeLevel.high:  "#FA8C16",  # 橙（保持）
     GradeLevel.vhigh: "#F5222D",  # 红（保持）
 }
```

**对比度验证（白字+底色）：**
- 旧 ok #FAAD14 + 白：1.92:1 ❌
- 新 ok #FFC53D + 白：1.84:1 ❌（白字依然不达标）

→ 配套：状态标签的文字颜色不能用白，应该用深字 + 浅底。

#### 前端 `miniprogram/components/record-card/record-card.wxss`

```diff
-.status { color: #FFFFFF; font-size: 24rpx; border-radius: 999rpx; padding: 8rpx 14rpx; }
+/* status 文字色由内联 style 由 status.text_color 控制，背景为 status.color */
+.status { font-size: 24rpx; border-radius: 999rpx; padding: 8rpx 14rpx; font-weight: 600; }
```

#### 后端 `backend/app/enums.py` 增加 text_color

```python
GRADE_TEXT_COLORS = {
    GradeLevel.low:   "#FFFFFF",
    GradeLevel.ideal: "#FFFFFF",
    GradeLevel.ok:    "#874D00",   # 深棕字配亮黄底，对比 4.5:1+
    GradeLevel.high:  "#FFFFFF",
    GradeLevel.vhigh: "#FFFFFF",
}
```

#### 后端 `backend/app/services/grading.py` 输出 text_color

```diff
 def grade_with_meta(value: float, period: str, std: Family) -> dict:
     level = grade(value, period, std)
     target_low, target_high = target_range(period, std)
     return {
         "level": level.value,
         "label": GRADE_LABELS[level],
         "color": GRADE_COLORS[level],
+        "text_color": GRADE_TEXT_COLORS[level],
         "target_low": target_low,
         "target_high": target_high,
     }
```

#### 后端 `backend/app/schemas/record.py`

```diff
 class StatusDTO(BaseModel):
     level: str
     label: str
     color: str
+    text_color: str = "#FFFFFF"
     target_low: float
     target_high: float
```

#### 前端 `miniprogram/components/record-card/record-card.wxml`

```diff
-  <view class="status" style="background: {{record.status.color}}">{{record.status.label}}</view>
+  <view class="status" style="background: {{record.status.color}}; color: {{record.status.text_color}}">{{record.status.label}}</view>
```

**测试：** 5 条记录 (3.5 / 6.0 / 6.8 / 9.5 / 14.0) 应分别显示 蓝/绿/亮黄+深字/橙/红，可肉眼区分。

---

### Epic-1.2 修复 grading 阈值不合理

**关联问题：** P0-DS-2

**改动文件：** `backend/app/services/grading.py`

```diff
 def grade(value: float, period: str, std: Family) -> GradeLevel:
     if value < std.critical_low:
         return GradeLevel.low
     if value >= std.critical_high:
         return GradeLevel.vhigh

     target_low, target_high = target_range(period, std)
     if value < target_low:
         return GradeLevel.low
     if value <= target_high:
         return GradeLevel.ideal
-    if value < std.critical_high * 0.85:
-        return GradeLevel.ok
-    return GradeLevel.high
+    # 引入显式分段：理想区间外，按超出幅度分轻度/显著
+    # 规则：超出 target_high 不超过 30% → 轻度（ok）；30%-critical → 显著（high）
+    threshold_high = target_high * 1.3
+    if value <= threshold_high:
+        return GradeLevel.ok
+    return GradeLevel.high
```

**示例验证（默认空腹标准 fasting_high=6.1, critical_high=13.9）：**

| value | period | 旧分级 | 新分级 |
|---|---|---|---|
| 3.5 | fasting | low (蓝) | low (蓝) |
| 5.5 | fasting | ideal (绿) | ideal (绿) |
| 6.5 | fasting | ok (黄) | ok (亮黄, 6.5 ≤ 6.1×1.3=7.93) |
| 7.9 | fasting | ok (黄) | ok (亮黄) |
| 8.0 | fasting | ok (黄) ❌ | high (橙) ✅ |
| 11.5 | fasting | ok (黄) ❌❌ | high (橙) ✅ |
| 14.0 | fasting | vhigh (红) | vhigh (红) |

**单元测试：** 在 `backend/tests/test_grading.py` 加 7 个用例。

---

### Epic-1.3 修复 AI 角标视觉

**关联问题：** P0-RC-1

**改动文件：** `miniprogram/components/record-card/record-card.wxss`

```diff
-.ai-tag { background: #FFE4C7; color: #F08A2C; font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 999rpx; margin-left: 12rpx; font-weight: 700; letter-spacing: 1rpx; }
+/* AI 角标改为紫色高对比 */
+.ai-tag {
+  background: #722ED1;     /* 紫 */
+  color: #FFFFFF;
+  font-size: 22rpx;
+  padding: 4rpx 14rpx;
+  border-radius: 999rpx;
+  margin-left: 12rpx;
+  font-weight: 700;
+  letter-spacing: 1rpx;
+}
```

**配套同步：** `miniprogram/pages/detail/detail.wxss`、`miniprogram/pages/ai-add/ai-add.wxss` 中的 `.ai-tag` 也保持一致。

**对比度验证：** #722ED1 + 白字 = 7.4:1 ✅ AAA。

---

## Epic 2 · 文案与硬编码

### Epic-2.1 移除"爸爸"硬编码

**关联问题：** P0-IDX-3, P0-JOIN-1, P0-COPY-2, P1-IDX-4

#### 方案 A（推荐，最小改动）：改成中性文案

`miniprogram/pages/index/index.js`：
```diff
-    todayLabel: '一起记录爸爸的血糖',
+    todayLabel: '一家人一起守护血糖',
```

`miniprogram/pages/join/join.wxml`：
```diff
-    <view class="desc">一家人一起记录爸爸的血糖</view>
+    <view class="desc">一家人一起守护家人血糖健康</view>
```

#### 方案 B（推荐，给 v0.2）：让用户配置

后端 `Family` 模型加字段 `subtitle: Optional[str]`；
家庭管理页加一行可编辑"家庭副标题（如：'一起记录爸爸的血糖'）"；
首页 `todayLabel = family.subtitle || '一家人一起守护血糖'`。

**当前阶段先做方案 A**，方案 B 进 backlog。

---

### Epic-2.2 修复 "今日已测 13" 单位歧义

**关联问题：** P0-IDX-2, P0-COPY-1

**改动文件：** `miniprogram/pages/index/index.wxml`

```diff
-    <view class="today-stat">
-      <view class="num">{{todayCount}}</view>
-      <view class="lbl">今日已测</view>
-    </view>
+    <view class="today-stat">
+      <view class="num">{{todayCount}}</view>
+      <view class="lbl">次 · 今日</view>
+    </view>
```

**视觉：** 圆形里显示 "13 / 次·今日"，糖友一眼知道是次数不是 mmol/L。

---

### Epic-2.3 修复默认家庭名 fallback

**关联问题：** P0-IDX-3

**改动文件：** `miniprogram/pages/index/index.js`

```diff
   data: {
-    family: { name: '家有糖人' },
+    family: null,
     groups: [],
     ...
   },
   onShow() {
     const app = getApp()
+    if (!app.globalData.family) {
+      // 兜底路由（理论上 app.js onLaunch 已处理；这里再保险一次）
+      wx.reLaunch({ url: '/pages/join/join' })
+      return
+    }
     ...
-    this.setData({ family: app.globalData.family || { name: '家有糖人' } })
+    this.setData({ family: app.globalData.family })
     this.loadFirstPage()
   },
```

`miniprogram/pages/index/index.wxml` 也加保护：
```diff
-<view class="page home-page">
+<view class="page home-page" wx:if="{{family}}">
```

---

## Epic 3 · 录入流程

### Epic-3.1 segment 跨页改成同页切换

**关联问题：** P0-ADD-1

**两种方案：**

#### 方案 A（推荐）：合并 add + ai-add 为一页

把 `pages/ai-add/` 内容合并进 `pages/add/`，segment 仅切换 `<view>`。优点：UX 自然；缺点：页面 js 变长。

#### 方案 B（最小改动）：修改 redirectTo → navigateTo + 智能切换

`miniprogram/pages/add/add.js`：
```diff
-  onAiTap() { wx.redirectTo({ url: '/pages/ai-add/ai-add' }) },
+  onAiTap() {
+    // 用 redirectTo 但 hint 用户这是切到另一个录入方式
+    wx.redirectTo({ url: '/pages/ai-add/ai-add' })
+  },
```

**实际：方案 B 不解决根本问题（redirectTo 销毁栈）。建议方案 A。**

详细方案 A 实施步骤：
1. 把 ai-add 的状态字段（text/parsed/missing/error）和方法搬到 add.js
2. add.wxml 用 `mode === 'manual'` / `mode === 'ai'` 控制显示
3. 新建 mode 切换方法 `switchMode(event)`
4. 删除 ai-add 文件夹（保留 git 历史）
5. app.json 删除 'pages/ai-add/ai-add'

工作量：M（半天 - 1 天）。

---

### Epic-3.2 保存 toast 时序修复

**关联问题：** P0-ADD-2

**改动文件：** `miniprogram/pages/add/add.js`

```diff
   async onSave() {
     ...
     try {
       let saved
       if (this.data.id) saved = await api.updateRecord(this.data.id, payload)
       else saved = await api.createRecord(payload)
       const newId = saved && saved.id ? saved.id : this.data.id
       if (newId && !this.data.id) wx.setStorageSync('pending_highlight_id', newId)
-      wx.showToast({ title: '保存成功' })
-      wx.navigateBack()
+      wx.showToast({ title: '保存成功', duration: 1200 })
+      // 等 toast 完整显示再返回
+      setTimeout(() => wx.navigateBack(), 1200)
     } catch (err) {
       wx.showToast({ title: err.message || '保存失败', icon: 'none' })
     }
   },
```

`miniprogram/pages/ai-add/ai-add.js` 同样改：
```diff
-      wx.showToast({ title: '保存成功' })
-      wx.switchTab({ url: '/pages/index/index' })
+      wx.showToast({ title: '保存成功', duration: 1200 })
+      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1200)
```

---

### Epic-3.3 AI 自动 LLM 调用改成手动

**关联问题：** P0-AIA-1

**改动文件：** `miniprogram/pages/ai-add/ai-add.js`

```diff
   onTextInput(event) {
     const text = event.detail.value
-    clearTimeout(this.data.timer)
-    const timer = setTimeout(() => this.parseText(), 800)
-    this.setData({ text, timer, error: '' })
+    this.setData({ text, error: '', parsed: null, canSave: false })
   },
```

`ai-add.wxml` 加显式"识别"按钮：
```diff
   <view class="card input-card">
     <textarea value="{{text}}" bindinput="onTextInput" ... />
     <view class="input-actions">
       <view class="voice" bindlongpress="onVoiceTap">...</view>
       <text>长按说话，松开识别</text>
       <text class="clear" bindtap="onClear">清空</text>
     </view>
-    <view class="btn-ghost" bindtap="onReparse">重新识别</view>
+    <view class="btn-primary recognize-btn {{text ? '' : 'disabled'}}" bindtap="onReparse">点击识别</view>
     <view wx:if="{{error}}" class="error">{{error}}</view>
   </view>
```

`onReparse` 改名 `onRecognize`，逻辑不变。`disabled` class 加上灰底。

---

### Epic-3.4 AI 推断字段视觉强化

**关联问题：** P0-AIA-2

**改动文件：** `miniprogram/pages/ai-add/ai-add.wxml` + `.wxss`

```diff
-    <view class="result-row"><text>测量时间</text><text>{{parsed.timeText}} <text wx:if="{{parsed.measured_at_inferred}}" class="infer">（推断）</text></text></view>
+    <view class="result-row {{parsed.measured_at_inferred ? 'inferred' : ''}}" bindtap="onTimeEdit">
+      <text>测量时间</text>
+      <text>
+        {{parsed.timeText}}
+        <text wx:if="{{parsed.measured_at_inferred}}" class="infer-badge">AI 推断</text>
+        ›
+      </text>
+    </view>
```

`ai-add.wxss`：
```diff
+.result-row.inferred { background: #FFFBE6; border-left: 6rpx solid #FAAD14; padding-left: 18rpx; }
+.infer-badge { background: #FAAD14; color: #FFFFFF; font-size: 20rpx; padding: 2rpx 10rpx; border-radius: 8rpx; margin-left: 8rpx; }
```

新增 `onTimeEdit` 方法（修复 P1-AIA-3）：
```js
onTimeEdit() {
  // 复用 add.js 的 picker 逻辑或弹出 datePicker
  wx.showActionSheet({
    itemList: ['保留当前', '改为现在', '手动选择'],
    success: (res) => {
      if (res.tapIndex === 1) {
        const now = new Date()
        this.setData({
          'parsed.measured_at': now.toISOString(),
          'parsed.timeText': formatDate(now, 'YYYY-MM-DD HH:mm'),
          'parsed.measured_at_inferred': false,
        })
      }
      // tapIndex === 2 → 弹日期 picker（需进一步实现）
    },
  })
},
```

---

### Epic-3.5 AI missingText 改为多字段提示

**关联问题：** P1-AIA-4

```diff
   buildMissingText(missing) {
-    if (missing.indexOf('value') >= 0) return '未识别到血糖值，请补充或重新输入'
-    if (missing.indexOf('period') >= 0) return '未识别到时段，请选择'
-    return ''
+    const labels = []
+    if (missing.indexOf('value') >= 0) labels.push('血糖值')
+    if (missing.indexOf('period') >= 0) labels.push('时段')
+    if (missing.indexOf('measured_at') >= 0) labels.push('时间')
+    if (labels.length === 0) return ''
+    return `还需要补充：${labels.join('、')}`
   },
```

---

### Epic-3.6 隐藏未实现的语音

**关联问题：** P1-AIA-6

`ai-add.wxml`：
```diff
-    <view class="input-actions">
-      <view class="voice" bindlongpress="onVoiceTap"><image src="/images/mic.png" mode="aspectFit" /></view>
-      <text>长按说话，松开识别</text>
-      <text class="clear" bindtap="onClear">清空</text>
-    </view>
+    <view class="input-actions">
+      <text class="hint">语音功能开发中，请文字输入</text>
+      <text class="clear" bindtap="onClear">清空</text>
+    </view>
```

---

## Epic 4 · 数据契约修复

### Epic-4.1 todayCount 后端来源

**关联问题：** P0-IDX-1

**改动文件：** `backend/app/schemas/record.py`

```diff
 class RecordListResponse(BaseModel):
     items: list[RecordDTO]
     total: int
+    total_today: int = 0
     page: int
     size: int
```

**改动文件：** `backend/app/routers/records.py`

```diff
 @router.get("", response_model=RecordListResponse)
 def list_records(
     ...
 ) -> RecordListResponse:
     family = get_family(session, current_user)
     ...
     total = session.exec(count_statement).one()
+    today_start = datetime.combine(datetime.utcnow().date(), time.min)
+    today_end = datetime.combine(datetime.utcnow().date(), time.max)
+    today_total = session.exec(
+        select(func.count(GlucoseRecord.id))
+        .where(GlucoseRecord.family_id == family.id)
+        .where(GlucoseRecord.measured_at >= today_start)
+        .where(GlucoseRecord.measured_at <= today_end)
+    ).one()
     records = ...
     return RecordListResponse(
         items=[build_record_dto(...) for record in records],
         total=total,
+        total_today=today_total,
         page=page,
         size=size,
     )
```

**改动文件：** `miniprogram/pages/index/index.js`

```diff
   async loadRecords(page) {
     this.setData({ loading: true })
     try {
       const res = await api.listRecords({ page, size: this.data.size })
       const items = page === 1 ? res.items : this.flattenGroups().concat(res.items)
       this.setData({
         groups: this.groupRecords(items),
         page,
         hasMore: page * this.data.size < res.total,
-        todayCount: items.filter((item) => dateOnly(item.measured_at) === dateOnly(new Date())).length,
+        todayCount: res.total_today,
       })
     ...
   },
```

**注意：** UTC vs 本地时区。后端用 `datetime.utcnow()`，但糖友的"今天"是中国时区（UTC+8）。需要确认后端用本地时区还是接受前端 query。

**建议：** 加 query 参数 `?tz=Asia/Shanghai`，后端按时区计算 today；或前端传 `from/to` 带时区。

---

## Epic 5 · 权限模型修复

### Epic-5.1 管理员可编辑/删除家人记录

**关联问题：** P0-DTL-1

**改动文件：** `backend/app/routers/records.py`

```diff
 @router.patch("/{record_id}", response_model=RecordDTO)
 def update_record(
     record_id: int,
     req: UpdateRecordRequest,
     current_user: User = Depends(require_family),
     session: Session = Depends(get_session),
 ) -> RecordDTO:
     family = get_family(session, current_user)
     record = get_record_in_family(session, record_id, family.id)
-    if record.recorder_id != current_user.id:
-        api_error(403, "ERR_NOT_RECORDER", "只能修改自己记录的数据")
+    is_creator = current_user.role == Role.creator.value
+    if record.recorder_id != current_user.id and not is_creator:
+        api_error(403, "ERR_FORBIDDEN", "无权修改该记录")
     ...

 @router.delete("/{record_id}", status_code=204)
 def delete_record(
     ...
 ) -> None:
     family = get_family(session, current_user)
     record = get_record_in_family(session, record_id, family.id)
-    if record.recorder_id != current_user.id:
-        api_error(403, "ERR_NOT_RECORDER", "只能删除自己记录的数据")
+    is_creator = current_user.role == Role.creator.value
+    if record.recorder_id != current_user.id and not is_creator:
+        api_error(403, "ERR_FORBIDDEN", "无权删除该记录")
     ...
```

**前端：** `miniprogram/pages/detail/detail.js`

```diff
-    this.setData({ record, isMine: record.recorder.id === user.id })
+    const family = getApp().globalData.family || {}
+    const canEdit = record.recorder.id === user.id || family.role_of_me === 'creator'
+    this.setData({ record, isMine: canEdit })
```

**注意：** 前端字段沿用 `isMine`（向后兼容），但语义改成"我能编辑"，建议下个版本重命名为 `canEdit`。

**审计 trail（建议进 v0.2）：** 后端 GlucoseRecord 加 `last_modified_by_id`，详情页显示"由 XX 修改于 YY"。

---

## Epic 6 · 视觉密度与触达

### Epic-6.1 矩阵单元格扩大

**关联问题：** P0-ANA-1, P0-A11Y-2

**改动文件：** `miniprogram/pages/analytics/analytics.wxss`

```diff
-.matrix-head,.matrix-row { display: grid; grid-template-columns: 150rpx repeat(8, 78rpx); gap: 8rpx; align-items: center; min-width: 790rpx; }
+/* 改为竖排：每天一行折叠展开。或者保留矩阵但加大单元格 */
+.matrix-head,.matrix-row { display: grid; grid-template-columns: 150rpx repeat(8, 88rpx); gap: 10rpx; align-items: center; min-width: 870rpx; }
-.cell { height: 58rpx; border-radius: 12rpx; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 24rpx; }
+.cell { height: 88rpx; border-radius: 14rpx; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 30rpx; font-weight: 600; }
```

**配套：** 加横滑提示

`analytics.wxml` 矩阵上方加：
```html
<view class="matrix-tip">‹ 左右滑动查看完整时段 ›</view>
```

`.wxss`:
```css
.matrix-tip { color: #86909C; font-size: 24rpx; text-align: center; margin-bottom: 14rpx; }
```

**长期建议（进 v0.2）：** 重设计为按天折叠 + 卡片视图，避免横滑。

---

### Epic-6.2 我的页菜单图标

**关联问题：** P0-ME-1

**资源准备：** 添加 SVG 图标 4 个：

`miniprogram/images/menu-family.svg` / `menu-standards.svg` / `menu-export.svg` / `menu-about.svg`

或者用微信内置 emoji 图标（快速上线）：

**改动文件：** `miniprogram/pages/me/me.wxml`

```diff
-  <view class="menu card">
-    <view bindtap="goFamily"><text class="icon">家</text><text>家庭管理</text><text>›</text></view>
-    <view bindtap="goStandards"><text class="icon">设</text><text>自定义血糖标准</text><text>›</text></view>
-    <view bindtap="goExport"><text class="icon">导</text><text>数据导出</text><text>›</text></view>
-    <view bindtap="goAbout"><text class="icon">i</text><text>关于</text><text>›</text></view>
-  </view>
+  <view class="menu card">
+    <view bindtap="goFamily">
+      <image src="/images/menu-family.png" class="icon" />
+      <text class="menu-text">家庭管理</text>
+      <text class="arrow">›</text>
+    </view>
+    <view bindtap="goStandards">
+      <image src="/images/menu-standards.png" class="icon" />
+      <text class="menu-text">自定义血糖标准</text>
+      <text class="arrow">›</text>
+    </view>
+    <view bindtap="goExport">
+      <image src="/images/menu-export.png" class="icon" />
+      <text class="menu-text">数据导出</text>
+      <text class="arrow">›</text>
+    </view>
+    <view bindtap="goAbout">
+      <image src="/images/menu-about.png" class="icon" />
+      <text class="menu-text">关于</text>
+      <text class="arrow">›</text>
+    </view>
+  </view>
```

`me.wxss`：
```css
.menu .icon { width: 48rpx; height: 48rpx; margin-right: 18rpx; }
.menu-text { flex: 1; }
.arrow { color: #C9CDD4; font-size: 36rpx; }
```

**临时方案（无 icon 资源时）：** 用微信内置图标库 `wx.iconfont` 或者保留单字但放大字号 +改色彩 +加圆形底色：

```diff
-<text class="icon">家</text>
+<view class="icon-wrap"><text class="icon">家</text></view>
```

```css
.icon-wrap { width: 60rpx; height: 60rpx; border-radius: 18rpx; background: #FFF3E8; display: flex; align-items: center; justify-content: center; }
.icon { font-size: 32rpx; color: #F08A2C; font-weight: 700; }
```

---

### Epic-6.3 时段二段选择重设计

**关联问题：** P0-PP-1

**改动文件：** `miniprogram/components/period-picker/period-picker.wxml`

```diff
-<view class="periods">
-  <view wx:for="{{periods}}" wx:key="key" data-key="{{item.key}}" bindtap="onPick" class="chip {{value === item.key ? 'active' : ''}}">
-    {{item.label}}
-  </view>
-</view>
+<view class="period-picker">
+  <!-- 第一行：餐次锚点 -->
+  <view class="meals">
+    <view wx:for="{{meals}}" wx:key="key" data-meal="{{item.key}}" bindtap="onMealPick" class="meal {{currentMeal === item.key ? 'active' : ''}}">
+      {{item.icon}} {{item.label}}
+    </view>
+  </view>
+  <!-- 第二行：前/后/无（仅当选了三餐时显示） -->
+  <view wx:if="{{showBeforeAfter}}" class="ba-row">
+    <view data-ba="before" bindtap="onBaPick" class="chip {{currentBa === 'before' ? 'active' : ''}}">餐前</view>
+    <view data-ba="after" bindtap="onBaPick" class="chip {{currentBa === 'after' ? 'active' : ''}}">餐后</view>
+  </view>
+</view>
```

`period-picker.js` 重写：
```js
const MEALS = [
  { key: 'fasting', label: '空腹', icon: '🌅' },
  { key: 'breakfast', label: '早餐', icon: '🥐' },
  { key: 'lunch', label: '午餐', icon: '🍱' },
  { key: 'dinner', label: '晚餐', icon: '🍲' },
  { key: 'bedtime', label: '睡前', icon: '🌙' },
]

Component({
  properties: { value: String },
  data: { meals: MEALS, currentMeal: '', currentBa: '', showBeforeAfter: false },
  observers: {
    value(v) {
      // 把 'after_breakfast' 拆成 currentMeal='breakfast' currentBa='after'
      const parts = (v || '').split('_')
      if (v === 'fasting' || v === 'bedtime') {
        this.setData({ currentMeal: v, currentBa: '', showBeforeAfter: false })
      } else if (parts.length === 2 && (parts[0] === 'before' || parts[0] === 'after')) {
        this.setData({ currentMeal: parts[1], currentBa: parts[0], showBeforeAfter: true })
      }
    },
  },
  methods: {
    onMealPick(e) {
      const meal = e.currentTarget.dataset.meal
      if (meal === 'fasting' || meal === 'bedtime') {
        this.setData({ currentMeal: meal, currentBa: '', showBeforeAfter: false })
        this.triggerEvent('change', { value: meal })
      } else {
        this.setData({ currentMeal: meal, currentBa: '', showBeforeAfter: true })
      }
    },
    onBaPick(e) {
      const ba = e.currentTarget.dataset.ba
      const fullKey = `${ba}_${this.data.currentMeal}`
      this.setData({ currentBa: ba })
      this.triggerEvent('change', { value: fullKey })
    },
  },
})
```

**视觉：**
- 第一行：5 个大卡片（70rpx 高，icon + 文字），间距均匀
- 第二行：选中早/午/晚后才出现的"餐前/餐后"二选一

**触达：** 每个 chip ≥ 88rpx ✅

**测试：** 用户依次选 早 → 餐前 → 触发 `change` event with value='before_breakfast'

---

## Epic 7 · 离线缓存重试层

**关联问题：** P0-GLOBAL-5

**改动文件：** 新建 `miniprogram/utils/offline.js`

```js
const QUEUE_KEY = 'offline_record_queue'

function enqueue(payload) {
  const queue = wx.getStorageSync(QUEUE_KEY) || []
  queue.push({ ts: Date.now(), payload })
  wx.setStorageSync(QUEUE_KEY, queue)
}

function dequeue() {
  return wx.getStorageSync(QUEUE_KEY) || []
}

function clear() {
  wx.removeStorageSync(QUEUE_KEY)
}

async function flush(api) {
  const queue = dequeue()
  if (!queue.length) return { ok: 0, failed: 0 }
  const results = { ok: 0, failed: 0 }
  const remaining = []
  for (const item of queue) {
    try {
      await api.createRecord(item.payload)
      results.ok++
    } catch (e) {
      results.failed++
      remaining.push(item)
    }
  }
  wx.setStorageSync(QUEUE_KEY, remaining)
  return results
}

module.exports = { enqueue, flush, clear, queueSize: () => dequeue().length }
```

**改动文件：** `miniprogram/pages/add/add.js`

```diff
+const offline = require('../../utils/offline.js')
   async onSave() {
     ...
     try {
       ...
       wx.showToast({ title: '保存成功', duration: 1200 })
       setTimeout(() => wx.navigateBack(), 1200)
     } catch (err) {
+      if (err.code === 'ERR_NETWORK' || err.code === 'ERR_HTTP') {
+        offline.enqueue(payload)
+        wx.showToast({ title: '已暂存，连网后自动同步', icon: 'success', duration: 1500 })
+        setTimeout(() => wx.navigateBack(), 1500)
+        return
+      }
       wx.showToast({ title: err.message || '保存失败', icon: 'none' })
     }
   },
```

**改动文件：** `miniprogram/app.js`

```diff
+const offline = require('./utils/offline.js')
+const { api } = require('./utils/api.js')
   App({
     ...
     onLaunch(options) {
       ...
+      // 启动时尝试 flush 离线队列
+      offline.flush(api).then((res) => {
+        if (res.ok > 0) wx.showToast({ title: `已同步 ${res.ok} 条记录`, icon: 'success' })
+      })
     },
+    onShow() {
+      // 每次回到前台再 flush 一次
+      offline.flush(api).catch(() => {})
+    },
   })
```

**首页提示离线条数（可选）：**

`index.wxml`:
```html
<view wx:if="{{offlineCount > 0}}" class="offline-banner">
  有 {{offlineCount}} 条记录待同步，连网后自动上传
</view>
```

---

## Epic 8 · 家庭名唯一约束

**关联问题：** P0-JOIN-2

**核心问题：** `Family.name = Field(index=True, unique=True)` 全局唯一，导致 100 个用户都想叫"我家"只有第 1 个能用。

**改动方案：**

1. 移除唯一约束 → DB 迁移
2. 移除 `ensure_family_name_available` 调用
3. UI 文案 "该家庭名已被使用" 改 "保存失败，请稍后再试"（或彻底删除该错误码）

**改动文件：** `backend/app/models.py`

```diff
 class Family(SQLModel, table=True):
     ...
-    name: str = Field(index=True, unique=True)
+    name: str  # 不再唯一；同名家庭通过 invite_code 区分
     invite_code: str = Field(index=True, unique=True)
     ...
```

**改动文件：** `backend/app/routers/families.py`

```diff
 @router.post("", response_model=FamilyDetailResponse)
 def create_family(
     req: CreateFamilyRequest,
     current_user: User = Depends(get_current_user),
     session: Session = Depends(get_session),
 ) -> FamilyDetailResponse:
     name = req.name.strip()
     if current_user.family_id is not None:
         api_error(400, "ERR_USER_ALREADY_IN_FAMILY", "用户已经加入家庭")
-    ensure_family_name_available(session, name)
     ...

 @router.patch("/me", response_model=FamilyDetailResponse)
 def update_family(...):
     family = get_my_family(session, current_user)
     name = req.name.strip()
-    ensure_family_name_available(session, name, exclude_id=family.id)
     family.name = name
     ...
```

**DB 迁移脚本（手动执行一次）：**

```bash
cd backend
sqlite3 data/glucose.db "DROP INDEX IF EXISTS ix_families_name; CREATE INDEX ix_families_name_nonunique ON families(name);"
```

或者用 alembic 写正式迁移（推荐）。

**改动文件：** `miniprogram/pages/join/join.js`

```diff
   async submitFamily(action, keepDialog) {
     ...
     try {
       const res = await action()
       ...
     } catch (err) {
-      if (err.code === 'ERR_FAMILY_NAME_TAKEN' && keepDialog) {
-        this.setData({ createError: '该家庭名已被使用' })
-      } else {
-        wx.showToast({ title: err.code === 'ERR_INVITE_CODE_INVALID' ? '邀请码不存在' : (err.message || '操作失败'), icon: 'none' })
-      }
+      const msg = err.code === 'ERR_INVITE_CODE_INVALID' ? '邀请码不存在' : (err.message || '操作失败')
+      wx.showToast({ title: msg, icon: 'none' })
     }
     ...
   },
```

---

## P1 批量改动（精简版）

| ID | 改动 | 工作量 |
|---|---|---|
| P1-IDX-5 | `index.js` 高亮 timeout 1200 → 2500 | XS |
| P1-IDX-6 | `index.wxss` fab-row bottom 改 `calc(env(safe-area-inset-bottom) + 24rpx)` | XS |
| P1-IDX-7 | 视觉确认 fab-mic 红点是否残留，无则不改 | XS |
| P1-ADD-3 | `add.js` value >= 25 时弹 modal 二次确认 | S |
| P1-ADD-4 | `add.wxml` picker 上方加 "时间精度 5 分钟" 提示 | XS |
| P1-ADD-5 | 后端 `record.py` 加 `measured_for_user_id`；前端 add 加"为谁记录"选择 | M |
| P1-FAM-2 | `family.js` member 用真实 wx avatar；fallback 时按 id 分配色块 | S |
| P1-FAM-3 | `family.wxss` `.remove` 改 outline + 加 padding | XS |
| P1-FAM-4 | `family.wxss` `.code` 加 `font-family: SF Mono, Courier New, monospace` | XS |
| P1-STD-1 | `standards.js` 用专门 picker 替换 wx.showModal editable | M |
| P1-STD-2 | `standards.js` 输入"abc" 提示"请输入数字" | XS |
| P1-EXP-1 | `export.wxml` 加"自定义日期范围"选项 | S |
| P1-EXP-2 | 后端导出加 .xlsx 选项；前端按钮加单选 | M |
| P1-RC-2 | `record-card.wxss` `.status` 固定宽度 | XS |
| P1-AIA-3 | 见 Epic-3.4（已含 onTimeEdit） | 已合并 |
| P1-AIA-5 | `ai-add.js` 区分网络错误/LLM 错误/解析错误，文案不同 | S |
| P1-COPY-3 | 全局错误文案统一审校 | S |
| P1-COPY-4 | `detail.wxml` 备注空 → "（无备注）" | XS |
| P1-A11Y-3 | 关键 `<view bindtap>` 改 `<button>` | M |
| P1-A11Y-4 | `<image>` 加 `aria-label`（小程序 image 原生不支持，但用 wx 自定义） | S |
| P1-ANA-2 | `analytics.wxml` 矩阵上加滑动提示（已含 Epic-6.1） | 已合并 |
| P1-ANA-3 | `analytics.wxss` chart-box 380→520rpx | XS |
| P1-ANA-5 | `analytics.js` 加时段细分 chip | S |
| P1-GLOBAL-4 | `utils/api.js` 抽 errorHandler 中间件 | M |

---

## P2 优化清单（共 24 项，进 backlog）

略，详见评估报告 §3-7。建议进入 v0.3 路线图，按"中老年友好优化"专题集中处理。

---

## 落地顺序与时间表

### Sprint 0（修复阻塞，1 天）

立即修，配合 codex 跑 `tests/automation/p0.test.js` 验证：

- Epic 1.1 + 1.2 + 1.3（颜色 + grading + AI 角标）
- Epic 2.1 + 2.2 + 2.3（文案 + fallback）
- Epic 3.2（toast 时序）

**验收：** 重新打开首页，5 条不同值的记录显示 5 种状态色；AI 卡片紫色标识；保存能看到 toast。

### Sprint 1（发版前必修，3-4 天）

- Epic 3.1（segment 同页化）— 半天
- Epic 3.3 + 3.4 + 3.5 + 3.6（AI 流程）— 1 天
- Epic 4.1（todayCount 后端）— 半天
- Epic 5.1（管理员权限）— 半天
- Epic 6.1（矩阵触达）— 半天
- Epic 6.2（菜单图标，临时方案）— 半天
- Epic 7（离线缓存）— 1 天
- Epic 8（家庭名约束 + DB 迁移）— 半天

**验收：** P0 全部清掉；codex 自动化脚本全部通过；视觉验证全员加 1 分。

### Sprint 2（强化优化，2-3 天）

- Epic 6.3（时段二段选择）— 1 天
- P1 批量（select 重要的 6-8 项）— 1-2 天

### Sprint 3（v0.2 路线）

- 全部 P2
- 真实 icon 资源
- 多设备适配补充
- 真实头像
- 审计 trail
- 推送/订阅同步

---

## 回归测试方案

### 自动化（接 codex 已写好的 automator 脚本）

**改动 `tests/automation/p0.test.js` 增加：**

```js
// P0-DS：5 个值对应 5 个状态色
const colors = await Promise.all(values.map(v => createAndCheckColor(mp, v)))
// expected: [low.color, ideal.color, ok.color, high.color, vhigh.color]

// P0-RC-1：AI 角标颜色应为紫色
const aiTagColor = await aiTagElem.attribute('style')
assert(aiTagColor.includes('background: rgb(114, 46, 209)') || aiTagColor.includes('background: #722ED1'))

// P0-IDX-2：今日已测应显示"次"
const lblText = await page.$('.today-stat .lbl').text()
assert(lblText.includes('次'))

// P0-DTL-1：管理员能看到编辑/删除按钮
const detail = await mp.reLaunch(`/pages/detail/detail?id=${someoneElsesId}`)
assert(await detail.$$('.btn-ghost').length > 0) // 编辑按钮可见
```

### 手工冒烟（5 分钟）

修复后人工再走一遍：

1. ✅ 首页 5 条记录颜色应有差异
2. ✅ 新增→保存→看到 toast→返回首页→对应卡片 2.5s 高亮
3. ✅ AI 录入：输入文字→点"识别"→推断字段有黄色边框
4. ✅ 家庭管理：成员"加入于 YYYY-MM-DD"渲染正确
5. ✅ 我的页菜单：图标不再是单字"家/设/导/i"
6. ✅ 分析→矩阵：cell 至少 88rpx 高
7. ✅ 时段选择：选"早餐"→出现"餐前/餐后"二选一
8. ✅ 断网测试：开飞行模式 → 保存 → "已暂存，连网后自动同步"

---

## 风险与回退

| 改动 | 风险 | 回退方案 |
|---|---|---|
| Epic-1.2 grading 阈值 | 历史记录"颜色变化" — 用户可能困惑 | 在 about/notice 加版本说明 |
| Epic-5.1 权限放宽 | 管理员误改家人记录 | 详情页加"由 X 修改"显示；记录 last_modified_by_id |
| Epic-7 离线缓存 | 设备时间不准导致 measured_at 错位 | flush 时按服务端时间矫正 |
| Epic-8 家庭名约束 | 已有 unique index 必须先 drop 才能加新数据 | 备份 db 后跑迁移；测试环境先验证 |

---

## 完成标志

- [ ] Sprint 0 + 1 全部 PR 合并
- [ ] `tests/automation/p0.test.js` 全绿
- [ ] 视觉验证（飞连助手解锁后）11 页 × 2 设备截图归档至 `docs/tasks/_acceptance/screenshots/v0.2/`
- [ ] T01 验收报告升级到 v0.2，状态 ✅ 通过
- [ ] 用户（为意）对 5 个核心场景做最终检视

**预估总周期：** 1 个 sprint（5-7 工作日，含 review/QA/调整）。

---

**方案完毕。**

实施前建议跟 codex 同步一下 Epic 4/5/8（涉及后端契约和 DB），避免双方在不同分支撞车。
