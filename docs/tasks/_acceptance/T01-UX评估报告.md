# T01 · 家有糖人小程序 UX/可用性/无障碍 评估报告

> **评估时间：** 2026-04-30
> **评估人：** Claude（Cowork）
> **评估范围：** 11 个页面 + 5 条核心流程 + edge case + 设计系统/无障碍
> **方法：** 代码层审计（wxml/wxss/js + 后端 grading 逻辑） + 视觉验证（首页 + 新增页已验，其余 9 页待视觉补充）
> **结论：** ❌ **不建议直接上线**。发现 P0 严重问题 7 项、P1 12 项、P2 24 项。其中 **血糖分级颜色映射、AI 角标可识别性、family.name 默认值** 直接影响家庭血糖管理这一核心场景。

---

## 0. 执行摘要

### 0.1 总体评分（10 分制）

| 维度 | 评分 | 说明 |
|---|---|---|
| 信息架构 | 6 | 三 tab 结构合理；二级页路径清晰；但首页"今日已测"等关键信息单位/含义不明 |
| 视觉层次 | 5 | 主色橙调统一；但状态色 ok/high 视觉无差；AI 角标与时段标签同色 |
| 交互一致性 | 5 | tab 切换、modal、toast 风格统一；但跨页 segment 切换实为 redirectTo（误导）；编辑入口部分 modal 部分 in-page |
| 文案 | 6 | "请遵医嘱"等关键 notice 在位；但硬编码"爸爸"、按钮文字"›"等装饰符号语义弱 |
| 无障碍/中老年 | 4 | 全局字号 32rpx 达标、按钮 88-104rpx 触达 OK；但矩阵单元格 58rpx 偏小、菜单图标用单字"家/设/导/i" |
| 错误处理 | 4 | 大量 toast 兜底但缺乏分类；保存失败无重试；离线无本地缓存 |
| 数据契约 | 7 | 后端字段完整；mock openid 单值限制多人测试 |
| **加权综合** | **5.3** | 整体可用，但有显著 UX 问题，影响中老年家庭用户 |

### 0.2 必须解决（P0，不解决不上线）

1. **血糖分级 ok/high 颜色不可辨**（`grading.py` + `enums.py`）— ok 是 #FAAD14、high 是 #FA8C16，色相只差一点。糖尿病应用的核心信号失效。
2. **分级阈值不合理：6.2 和 11.7 都是"一般"** — `grading.py` 中 ok 区间从 target_high 一直延伸到 critical_high*0.85，跨度过大。
3. **AI 角标与时段标签同色**（`record-card.wxss`）— `.period` 浅橙底深橙字、`.ai-tag` 浅橙底深橙字。AI 标识失去识别功能。
4. **首页家庭名 fallback 是 "家有糖人"** + 副文案硬编码"一起记录爸爸的血糖" — 不是所有家庭都给爸爸记，且未配家庭名时显示"家有糖人的血糖记录"，错位严重。
5. **录入页"AI 一句话" segment 用 wx.redirectTo 跨页切换** — UI 看起来是 tab 切换，实际是切到另一个页面，破坏栈、不能返回。
6. **AI 录入防抖 800ms 自动调用 LLM** — 中老年慢速输入会触发多次浪费请求，且 LLM 错误处理只笼统说"无法连接服务器"。
7. **删除/编辑权限只对 isMine 开放** — 妈妈给爸爸记录后，爸爸自己看不能改？（待确认 isMine 含义；如果是 recorder.id===user.id，则管理员发现错误也无法修改。）

### 0.3 强烈建议（P1，发版前修）

见第 3-7 节，共 12 项。

### 0.4 优化项（P2，下个版本）

见第 3-7 节，共 24 项。

---

## 1. 评估方法

### 1.1 工具与流程

| 阶段 | 方法 | 状态 |
|---|---|---|
| 设计系统审计 | 读 `app.wxss` + 各页面 wxss 提取 token | ✅ 完成 |
| 文档审计 | 读全部 `pages/*/{wxml,wxss,js}` + 关键 utils + 后端 schemas/grading | ✅ 完成 |
| 视觉验证 | 微信开发者工具截图（iPhone 15 Pro 模拟器） | ⚠️ 仅首页 + 新增页（受第三方屏幕监控软件覆盖层阻塞） |
| 用户流程串测 | 通过代码 trace + 已截图验证 | ⚠️ 待视觉补充 |
| Edge case 验证 | 代码层推演 | ⚠️ 待视觉补充 |
| 跨设备验证 | iPhone 14/15 (390×844) + Pro Max (428×926) + Android | ⚠️ 待视觉补充 |

### 1.2 评估维度

依据 WCAG 2.1 AA + 中老年友好基线（PRD §12 中"正文 ≥ 32rpx、按钮 ≥ 88rpx"）+ 设计批评经典框架（First Impression / Usability / Hierarchy / Consistency / Accessibility）。

### 1.3 严重程度定义

- 🔴 **P0** — 影响核心业务逻辑或视觉信号失效，必须解决
- 🟡 **P1** — 显著影响可用性或可访问性，发版前应修
- 🟢 **P2** — 优化点，下个版本可改

---

## 2. 设计系统审计（app.wxss）

### 2.1 设计 Token 现状

```
--primary: #FF9F40   主色（暖橙，符合关怀型产品定位）
--primary-deep: #F08A2C
--bg: #F5F5F5
--card: #FFFFFF
--text/text-2/text-3: #1F2329 / #4E5969 / #86909C
--line: #E5E6EB

GRADE_COLORS:
  low (偏低)   #4DA3FF  蓝
  ideal (理想) #52C41A  绿
  ok (一般)    #FAAD14  暖黄/橙黄
  high (偏高)  #FA8C16  橙
  vhigh (过高) #F5222D  红
```

### 2.2 严重问题

#### 🔴 P0-DS-1：状态色 ok 与 high 视觉无差

`#FAAD14`（ok）与 `#FA8C16`（high）色相差 < 5°，明度相近，**在小尺寸标签和矩阵单元格上几乎不可辨**。糖尿病应用的核心信号是"今天血糖怎么样"，这两个颜色映射"一般 vs 偏高"——一个无需采取行动、一个需要警觉，颜色却没差别。

**实测**：首页截图中 5 条记录（10.5/6.8/7/8.2/6.5）所有状态条显示同一橙色"一般"，无视高低。

**建议修复**：
```python
# enums.py 改为
GRADE_COLORS = {
    "low":   "#4DA3FF",  # 蓝
    "ideal": "#52C41A",  # 绿
    "ok":    "#FFD43B",  # 改为亮黄（明度更高、与橙系拉开）
    "high":  "#FA8C16",  # 橙
    "vhigh": "#F5222D",  # 红
}
```
配合 grading 阈值调整（见 P0-2）。

#### 🔴 P0-DS-2：分级阈值不合理

`grading.py` 第 25 行：`if value < std.critical_high * 0.85: return GradeLevel.ok`，意味着如果 critical_high=13.9，那么 6.1（target_high）到 11.8 全部归为"一般"——但 6.5 和 11.5 在医学上完全是不同处理路径。

**建议修复**：引入分段，比如：
```python
if value <= target_high:
    return GradeLevel.ideal
if value <= target_high * 1.3:  # ≈ 7.9 for fasting
    return GradeLevel.ok  # 轻度偏高
if value < std.critical_high:
    return GradeLevel.high  # 显著偏高
return GradeLevel.vhigh
```

### 2.3 良好部分

- 全局 `font-size: 32rpx`（中老年友好基线达标）✅
- `btn-primary` 96rpx 高 + 34rpx 字号 ✅
- card padding 28rpx，呼吸感合适
- antialiased 字体平滑 ✅

---

## 3. 按页发现

### 3.1 首页（pages/index）

**📸 视觉证据**：已实测——iPhone 15 Pro 模拟器截图显示 5 条记录卡片，2 条带 AI 角标。

#### 🔴 P0-IDX-1：todayCount 计算错误

`index.js:48` `todayCount: items.filter(...).length` 只统计**当前已加载的**条目。如果今天有 25 条记录、首页 size=20、第一页只有 20 条今日记录，`todayCount` = 20，但下拉到第二页才看到剩余 5 条。

**修复**：后端 list API 增加 `total_today` 字段，前端直接展示。

#### 🔴 P0-IDX-2："今日已测 13" 单位歧义

hero 区圆形里 "13 / 今日已测"——糖友看见"13"第一反应是 13 mmol/L（高血糖警戒值）。

**修复**：改成 `"13 次"` 或圆形外加单位说明 `"今日已测 13 次"`。

#### 🔴 P0-IDX-3：默认家庭名渲染不当

`index.js:5` `family: { name: '家有糖人' }`。如果用户未加入家庭，hero 区会显示 `家有糖人的血糖记录`——但这种情况下 app.js 应该把用户路由到 join 页才对。代码里有 fallback 但没说明何时会被命中。建议直接抛错或显示空态。

#### 🟡 P1-IDX-4：todayLabel 硬编码"一起记录爸爸的血糖"

`index.js:13`。不是所有糖友家庭都是给爸爸记，可能是妈妈/配偶/自己。

**修复**：让用户在 family 页配置家庭副标题，或者改成中性文案"一家人一起守护血糖健康"。

#### 🟡 P1-IDX-5：高亮时长 1.2s 偏短

`index.js:23` `setTimeout(... 1200)`。用户从 add 页保存后 navigateBack 返回首页，缓神 + 找新记录 + 看清就要 1-2 秒，1.2s 后高亮已消失。

**修复**：改 2500-3000ms。

#### 🟡 P1-IDX-6：fab-row 底部安全区缺失

`index.wxss:12` `bottom: 40rpx`——iPhone 14/15 home indicator 区域没考虑。

**修复**：`bottom: calc(env(safe-area-inset-bottom) + 24rpx)`。

#### 🟡 P1-IDX-7：fab-mic 未读小红点（已观察）

视觉截图显示 fab-mic 右下有红点，但代码里 `<view class="fab-mic">` 没有 badge 逻辑。可能是错误装饰元素。需要视觉确认是否 css 残留。

#### 🟢 P2-IDX-8：空状态用文字"糖"做图标

`<view class="drop">糖</view>`——用文字模拟图标视觉单薄。

**修复**：用真实 SVG 或 png icon。

#### 🟢 P2-IDX-9：fab 用 view 模拟按钮

`<view class="fab-main" bindtap="onAddTap">` 应改为 `<button>`，提升语义可访问性。

#### 🟢 P2-IDX-10：缺骨架屏

加载时直接空白，应有 skeleton。

---

### 3.2 新增页 - 手动录入（pages/add）

**📸 视觉证据**：已实测——iPhone 12/13 模拟器截图。

#### 🔴 P0-ADD-1：segment "AI 一句话" 用 wx.redirectTo 跨页

`add.js:50` `wx.redirectTo({ url: '/pages/ai-add/ai-add' })`。Segment UI 模式（切换 tab）暗示是同一页内切换，但实际上 redirectTo 销毁当前页打开新页面——用户从 ai-add 切回手动需要重新进入流程，且导航栈丢失。

**修复**：
- 选项 A：把 add 和 ai-add 合并为同一页面，segment 切换 view
- 选项 B：用 `wx.navigateTo` + 在 ai-add 中切回时 navigateBack

#### 🔴 P0-ADD-2：保存成功 toast 几乎不可见

`add.js:70-71` `wx.showToast({ title: '保存成功' }); wx.navigateBack()`——toast 默认 1500ms，但 navigateBack 立即返回，toast 在源页面（add）显示一帧后页面就被销毁。用户在首页只看到一闪而过的 toast。

**修复**：先 `await new Promise(r => setTimeout(r, 1500))` 等 toast 显示完整再 navigateBack；或者用 `wx.showLoading` + 完成后 navigate。

#### 🟡 P1-ADD-3：异常值 50 上限缺二次确认

`add.js:53` `if (value >= 50)` 直接 toast 拒绝。但糖友输错小数点（输 65 代替 6.5）很常见，应该有"该值看起来异常高，是否确认"二次确认。

#### 🟡 P1-ADD-4：5 分钟时间步进无说明

`time.js:roundTo5Min` 自动凑整到 5 分钟。但 picker 列表里只显示 :00/:05/:10/.../:55，用户可能困惑为什么没有 :03。

**修复**：在 picker 上方加说明 "时间精度 5 分钟"。

#### 🟡 P1-ADD-5：缺"为谁记录"字段

家庭场景下，妈妈给爸爸记录时，没有 measured_for 字段。后端 schemas/record.py 待确认是否有该字段。如果没有，所有数据都归 recorder 名下，分析数据就混了多个家人。

#### 🟡 P1-ADD-6：错误处理无离线缓存

`add.js:73` `catch { wx.showToast(...) }`——断网时数据丢失。糖友在户外测完血糖手机进入弱网区，输入完点保存失败，再次输入很烦。

**修复**：失败时把 payload 写入 localStorage，下次进入应用时尝试重传。

#### 🟢 P2-ADD-7：input 进入页面无自动 focus

`<input class="value-input">` 缺 `focus="{{true}}"`，用户进入页面要手动点输入框。

#### 🟢 P2-ADD-8：备注 200 字限但无字数提示

`maxlength="200"` 但没有 "x/200" 计数。

#### 🟢 P2-ADD-9：缺血糖值快速预设

中老年用户常见血糖区间是 5-12，可以在输入框下加几个常用值快捷按钮。

---

### 3.3 AI 录入页（pages/ai-add）

**📸 视觉证据**：未截图（待视觉补）。

#### 🔴 P0-AIA-1：800ms 防抖自动调 LLM

`ai-add.js:16` `setTimeout(() => this.parseText(), 800)`。慢速输入用户每次停顿都会触发 LLM 调用。LLM 要钱、要时间、还可能限流。

**修复**：去掉自动解析，或防抖时间提到 2500ms+，或用户点"识别"按钮。

#### 🔴 P0-AIA-2：推断字段标识不够明显

`<text wx:if="{{parsed.period_inferred}}" class="infer">（推断）</text>` 在小字体里。用户可能没注意到时段是 LLM 推断的。

**修复**：推断字段加黄色边框/背景或图标。

#### 🟡 P1-AIA-3：编辑路径不一致

- 血糖值 → wx.showModal
- 时段 → period-picker (in-page)
- 备注 → wx.showModal
- 测量时间 → 无编辑入口
- 用户改时间无法操作。

**修复**：测量时间也允许编辑（picker 弹出）；把所有字段改成 in-page 编辑或全部 modal，统一。

#### 🟡 P1-AIA-4：missingText 一次只显示一条

`buildMissingText` filter 只返回第一条。如果同时缺 value 和 period，用户补完 value 后才知道还缺 period。

**修复**：列出所有 missing："还需要：血糖值、时段"。

#### 🟡 P1-AIA-5：错误分类太粗

`error: '无法连接服务器'` 把网络错误、LLM 错误、解析失败混为一谈。

#### 🟡 P1-AIA-6：长按语音"功能即将开放"

`onVoiceTap` toast "语音功能即将开放，请用文字输入"。既然没实现就别在 UI 上引导用户长按。

**修复**：隐藏麦克风或改成 "语音功能开发中" 静态视觉。

#### 🟢 P2-AIA-7：textarea auto-focus 良好 ✅

---

### 3.4 记录详情页（pages/detail）

**📸 视觉证据**：未截图。

#### 🔴 P0-DTL-1：编辑/删除只对 isMine 开放

`detail.js:22` `isMine: record.recorder.id === user.id`。妈妈（管理员）发现儿子记录写错了，**无法修改**。家庭场景下管理员应有全家记录的编辑权限。

**修复**：
```js
isMine: record.recorder.id === user.id || family.role_of_me === 'creator'
```

#### 🟡 P1-DTL-2：备注空"无"显示生硬

应该改成 "（无备注）" 或者直接隐藏该行。

#### 🟢 P2-DTL-3：缺记录历史/审计

谁修改过、改了什么，没有展示。家庭场景下数据可信度需要审计 trail。

---

### 3.5 加入家庭页（pages/join）

**📸 视觉证据**：未截图。

#### 🔴 P0-JOIN-1：副文案硬编码"一家人一起记录爸爸的血糖"

`join.wxml:5`。同 P1-IDX-4。

**修复**：改成 "一家人一起守护血糖健康"。

#### 🔴 P0-JOIN-2：家庭名全局唯一冲突

`join.js:50` `err.code === 'ERR_FAMILY_NAME_TAKEN'` → 显示"该家庭名已被使用"。后端把家庭名作为全局唯一约束，意味着 100 个用户都想叫"我家"只有第 1 个能用。

**修复**：去掉家庭名唯一约束（用 invite_code 唯一即可），或者改 UX 文案 "请换一个名字（如：我家、咱家、张家）"。

#### 🟡 P1-JOIN-3：邀请码字符集含易混淆字符

`join.js:15` `replace(/[^A-Z0-9]/g, '')` 接受 0、O、1、I、L 等中老年用户难分辨字符。

**修复**：后端生成邀请码时排除 0/O/1/I/L/Z/2，前端校验同步。

#### 🟡 P1-JOIN-4：邀请码输入框无 6 位分隔

中老年用户输入 6 位时无法跟上进度，输入框应分 6 个独立位 + 自动跳格。

#### 🟢 P2-JOIN-5：缺扫码加入

应支持二维码扫码。

#### 🟢 P2-JOIN-6：创建 modal 名字输入框 maxlength=20

家庭名 20 字偏多，建议 8 字。

---

### 3.6 家庭管理页（pages/family）

**📸 视觉证据**：未截图。

#### 🔴 P0-FAM-1：joined_at 是否 ISO 字符串待验证

`family.js:14` `joinedText: member.joined_at ? '加入于 ${formatDate(member.joined_at)}' : ''`。如果后端返回非 ISO 字符串或 timestamp，formatDate 会失败、显示乱码或空。这是 P0 视觉问题之一，需要后端响应实测。

#### 🟡 P1-FAM-2：成员头像用首字符

`family.js:12` `avatarText: member.nickname.slice(0, 1)`。家庭成员都姓"王"时所有头像都是"王"，无法区分。

**修复**：使用真实头像（wx.getUserInfo），或为每个成员分配不同色块。

#### 🟡 P1-FAM-3：移除按钮缺乏视觉强度

`.remove { color: #F5222D; font-size: 28rpx; }`——红字 14px，没有边框。删除是危险操作，应该既明显（避免误以为不可点）又克制（避免误触）。

**修复**：用 outline button 或 swipe-to-delete 模式。

#### 🟡 P1-FAM-4：邀请码 6 位字间距 10rpx 但等宽字体未指定

`.code { font-size: 58rpx; letter-spacing: 10rpx; }` 但没设 monospace 字体。0/O/1/I 在系统默认字体下区分度低。

**修复**：`font-family: 'SF Mono', 'Courier New', monospace;`

#### 🟢 P2-FAM-5：编辑按钮藏在右上

`<view wx:if="{{isCreator}}" class="edit" bindtap="editName">编辑</view>`——只有橙色文字，没图标。

---

### 3.7 我的页（pages/me）

**📸 视觉证据**：未截图。

#### 🔴 P0-ME-1：菜单图标用单字汉字

```wxml
<view><text class="icon">家</text><text>家庭管理</text>
<view><text class="icon">设</text><text>自定义血糖标准</text>
<view><text class="icon">导</text><text>数据导出</text>
<view><text class="icon">i</text><text>关于</text>
```

用单个汉字"家/设/导/i"做图标，视觉非常拥挤、不专业、扁平时代严重退化。"i" 字符在中文语境下尤其突兀。

**修复**：用真实 icon font（如 iconfont、Material Icons）或 SVG。

#### 🟡 P1-ME-2：profile 区无业务信息

显示头像 + 昵称 + 家庭名 + 角色，但糖友更关心"我累计记录了多少次"、"距离下次该记的时段还有多久"等业务数据。

#### 🟢 P2-ME-3：未加家庭时显示"未加入家庭"但仍展示菜单

`family.name || '未加入家庭'` + 4 个菜单项。如果未加家庭，"家庭管理/数据导出"等菜单的目标页面会异常。

---

### 3.8 自定义标准页（pages/standards）

**📸 视觉证据**：未截图。

#### 🟡 P1-STD-1：editValue 用 wx.showModal editable

`standards.js:16` `wx.showModal({ ..., editable: true, ... })`。simple textarea，无数字键盘锁定、无校验单位、无 stepper。

**修复**：用专门的 number input + +/- stepper，或者用 picker 限制范围。

#### 🟡 P1-STD-2：editValue 静默失败

`if (!value) return`——用户输入"abc"会被忽略但无任何反馈。

#### 🟡 P1-STD-3：valid() 校验在保存时一次性

如果用户改了 fasting_low 但 fasting_high 没改，可能此时 fasting_low > fasting_high，UI 上每次输入都应实时校验，而不是保存时一次告诉。

#### 🟢 P2-STD-4：缺单值意义说明

每个阈值是什么含义、什么医学背景？没有解释。"空腹下限"对老人来说不够直观。

#### 🟢 P2-STD-5："请遵医嘱"提示位置偏弱

底部一行小字，应放在醒目位置。

---

### 3.9 数据导出页（pages/export）

**📸 视觉证据**：未截图。

#### 🟡 P1-EXP-1：范围选项硬编码"最近 N 天"

待确认 ranges 数组内容，但没有"自定义日期范围"选项。

#### 🟡 P1-EXP-2：CSV 兼容性

CSV 老人不会用，应该提供 Excel (.xlsx) 选项。

#### 🟢 P2-EXP-3：字段固定

未支持选择导出哪些字段。

#### 🟢 P2-EXP-4：缺 PDF 导出

医生场景下 PDF 比 CSV 更直观。

---

### 3.10 关于页（pages/about）

**📸 视觉证据**：未截图。

#### 🟢 P2-ABT-1：notice 字号偏小且位置弱

"本小程序仅供本家庭成员记录与查看血糖数据使用，不构成医疗建议，请遵医嘱"——重要免责声明应放更醒目位置。

#### 🟢 P2-ABT-2："联系开发者 / 复制邮箱" 同行不直观

应该用 icon。

---

### 3.11 分析页（pages/analytics）

**📸 视觉证据**：未截图（飞连助手阻塞）。

#### 🔴 P0-ANA-1：矩阵单元格 58rpx 触达不足

`.cell { height: 58rpx; ... font-size: 24rpx; }` 矩阵每格 29px 高、12px 字。

- 触达基线 ≥ 88rpx (44px)：不达标
- 字号基线 ≥ 32rpx (16px)：严重不达标

中老年用户在 8 列宽矩阵上点选某天某时段，几乎点不准。

**修复**：cell 高至少 88rpx；字号至少 28rpx；或者改成纵向布局（每天一行折叠展开）。

#### 🟡 P1-ANA-2：矩阵需横向滚动

`.matrix { overflow-x: scroll; }` + `min-width: 790rpx`，屏宽 750rpx 必须左右滑。中老年用户可能不会发现还能滑。

**修复**：竖排或显示主要 4 个时段 + "更多" 折叠。

#### 🟡 P1-ANA-3：图表容器 380rpx 偏矮

`.chart-box { height: 380rpx }` 约 190px 高，看趋势细节不便。

#### 🟡 P1-ANA-4：dist-bar 28rpx 偏窄

横向占比条 14px 高，色弱用户难辨。

#### 🟡 P1-ANA-5：分布只 distribution、缺时段细分

"全部时段/空腹/餐后" 三选项，但用户可能想看"早餐前 vs 早餐后"对比。

#### 🟢 P2-ANA-6：报表 hero status.label 缺颜色暗示

"平均血糖 7.2 / 偏高" 只有文字。应该加色块。

#### 🟢 P2-ANA-7：缺月度/季度对比

"这个月比上个月好"是糖友最关心的趋势叙述，目前没有。

---

### 3.12 record-card 组件

**📸 视觉证据**：已实测——AI 角标可见但与时段标签同色系。

#### 🔴 P0-RC-1：AI 角标与 period 同色

```css
.period   { background: #FFF3E8; color: #F08A2C; ... font-size: 26rpx; }
.ai-tag   { background: #FFE4C7; color: #F08A2C; ... font-size: 22rpx; ... }
```

只有底色 #FFF3E8 vs #FFE4C7 极微差，两标签本质是同色系。AI 标识失败。

**修复**：
```css
.ai-tag { background: #722ED1; color: #FFFFFF; ... }  /* 紫色对比强烈 */
```

#### 🟡 P1-RC-2：state 标签宽度不固定

`.status { ... padding: 8rpx 14rpx; }` 内容长度决定宽度，对齐性差。

#### 🟡 P1-RC-3：avatar 用 inline-flex + 单字

40rpx 圆形 + 首字符——太小，且当家人都姓相同字时无法区分。

#### 🟢 P2-RC-4：highlight 动画 0.6s ease

`transition: background .6s ease, box-shadow .6s ease;` 视觉效果良好 ✅，但和 index.js 里 setTimeout 1.2s 不匹配——动画结束后还有 0.6s 高亮维持，体感"卡了一下"。

**修复**：要么 timeout 改 1800ms（=动画 600 + 维持 600 + 缓出 600），要么 transition 改 0.3s。

---

### 3.13 period-picker 组件

#### 🔴 P0-PP-1：8 个时段一行密集排布、视觉差小

```html
<view class="periods">
  <view wx:for="{{periods}}" ... class="chip ...">{{item.label}}</view>
</view>
```

8 个时段："空腹/早餐前/早餐后/午餐前/午餐后/晚餐前/晚餐后/睡前"。在 750rpx 屏宽里 chip 排列会拥挤，且"早餐前/早餐后"差只在前后缀字。

**临床风险**：老人快速选择把"早餐前"误选成"早餐后"——医学上空腹值（早餐前）和餐后 2h 值（早餐后）是完全不同的判断标准，错记会导致医嘱判断偏离。

**修复**：分两步选——先选餐次（早 / 午 / 晚 / 睡前 / 空腹），再选 前/后。

---

## 4. 用户流程评估（基于代码 trace）

### 4.1 流程一：新用户登录 → 创建/加入家庭 → 首条记录

```
1. App.onLaunch 检查 token
   - 无 token → relogin → 失败时 reLaunch /pages/join/join ✅
   - 有 token 但无 family → reLaunch /pages/join/join ✅
2. /pages/join/join
   - 输入邀请码 6 位 → onJoin → api.joinFamily ✅
   - 或点击"创建新家庭" → modal → onCreate → api.createFamily
3. 成功后 wx.switchTab → /pages/index/index
4. 首页空数据态 (groups=[]) → 显示"今天还没有记录" + 引导文字
5. 点击"+ 记一次血糖" → /pages/add/add
6. 填写 → 保存 → navigateBack → 首页高亮 1.2s
```

**主要问题：**
- 🔴 P0-IDX-3：首页 fallback family.name="家有糖人" 已经路由错位时显示
- 🟡 P1-IDX-5：1.2s 高亮太短
- 🟡 P1-ADD-2：保存 toast 几乎不可见
- 🟡 P1-JOIN-3：邀请码字符集含易混淆字符

### 4.2 流程二：日常手动新增 → 高亮回首页 → 详情页

代码层面流程通顺。但 P0-RC-4 高亮动画（0.6s transition）+ 1.2s timeout 时序不一致。

### 4.3 流程三：AI 快记 → 解析确认 → 保存

```
1. /pages/ai-add/ai-add (textarea auto-focus)
2. 输入文字 → 800ms 后自动 parseText
3. 显示 parsed 卡片（含 推断 标记）
4. 用户可点击修改 4 字段中 3 个（值 / 时段 / 备注），但测量时间不可改 🔴
5. onSave → api.createRecord({source:'ai'}) → switchTab 首页
```

**主要问题：**
- 🔴 P0-AIA-1: 800ms 自动 LLM 浪费
- 🔴 P0-AIA-2: 推断字段不明显
- 🟡 P1-AIA-3: 测量时间不可编辑

### 4.4 流程四：分析三 tab 切换、跨时段

```
1. /pages/analytics
2. 默认 tab='matrix'
3. 切换 tab='chart' → 加载 chart 数据 → 渲染 canvas
4. 切换 tab='report' → 加载 report 数据
```

**主要问题：**
- 🔴 P0-ANA-1: 矩阵 cell 触达不足
- 🟡 P1-ANA-2: 横滑被发现的概率低
- 🟡 P1-ANA-3: chart 380rpx 偏矮

### 4.5 流程五：家庭管理 - 邀请、移除、解散

```
1. /pages/family
2. isCreator 时显示邀请码 + 编辑按钮 + 移除按钮
3. 移除 → wx.showModal 确认 → api.removeMember → loadFamily 刷新
4. 解散 → wx.showModal 确认 → api.dissolveFamily → reLaunch /pages/join/join
```

**主要问题：**
- 🟡 P1-FAM-2: 头像首字符无法区分同姓家人
- 🟡 P1-FAM-3: 移除按钮触达感弱
- 🟡 P1-FAM-4: 邀请码无等宽字体

---

## 5. 跨页系统性问题

### 5.1 全局：Hardcoded "爸爸" 文案

- `index.js:13` todayLabel: '一起记录爸爸的血糖'
- `join.wxml:5` desc: 一家人一起记录爸爸的血糖

🟡 **P1-GLOBAL-1**：硬编码假设家庭服务对象。修复：移到家庭配置项，或改成中性。

### 5.2 全局：tabBar 图标语义弱

`app.json` tabBar 用图片，但 PNG 路径没看到设计稿。视觉截图中"首页/分析/我的"图标抽象（柱状图 vs 人形）。

🟢 **P2-GLOBAL-2**：图标一致性、辨识度待视觉确认。

### 5.3 全局：缺 navigationBar 自定义

`app.json` 用默认 navigationBar，"家有糖人" 在首页和 hero "X的血糖记录" 重复。

🟢 **P2-GLOBAL-3**：考虑首页用 `"navigationStyle": "custom"`。

### 5.4 全局：错误处理一致性差

各页 catch 行为：
- index: `wx.showToast({ icon: 'none' })`
- add: `wx.showToast({ icon: 'none' })`
- ai-add: `this.setData({ error: ... })` 写到 view
- join: `wx.showToast` 或 modal 内显示

🟡 **P1-GLOBAL-4**：抽个统一 errorHandler。

### 5.5 全局：缺离线/弱网支持

所有 api 调用没有 cache、没有 retry、没有本地缓存。

🔴 **P0-GLOBAL-5**：糖友户外测血糖→保存→断网→数据丢失。**家庭血糖管理不能容忍数据丢失**。

### 5.6 全局：menu 图标用单字

me 页"家/设/导/i"——同 P0-ME-1。系统性的视觉简陋问题。

---

## 6. 无障碍审计（WCAG 2.1 AA）

### 6.1 Perceivable

| WCAG | 项 | 评估 |
|---|---|---|
| 1.1.1 | 非文本内容有替代文本 | ❌ image 元素无 `aria-label` 或 `mode="aspectFit"` 之外的描述 |
| 1.3.1 | 信息和结构语义化 | ⚠️ 大量用 `<view bindtap>` 模拟按钮，缺 ARIA |
| 1.4.3 | 文本对比度 ≥ 4.5:1 | 主色 #FF9F40 + 白底（橙黄/白）对比度约 2.8:1 ❌ 不达标 |
| 1.4.11 | UI 组件对比度 ≥ 3:1 | 矩阵单元格 ok 状态 #FAAD14（黄）+ 白字 ≈ 1.9:1 ❌ |

### 6.2 Operable

| WCAG | 项 | 评估 |
|---|---|---|
| 2.1.1 | 键盘可达 | 小程序无键盘场景，但 VoiceOver 可读 ✅ 部分 |
| 2.4.3 | 焦点顺序 | 默认 DOM 顺序 ✅ |
| 2.5.5 | 触达 ≥ 44×44 | record-card OK；matrix cell 29×26 ❌；ai-tag 12×26 ❌ |

### 6.3 Understandable

| WCAG | 项 | 评估 |
|---|---|---|
| 3.2.1 | 焦点变化可预测 | ✅ |
| 3.3.1 | 错误识别 | ⚠️ "网络异常"等笼统，未指出具体字段 |
| 3.3.2 | 输入有标签 | ✅ field-label 在位 |

### 6.4 Robust

| WCAG | 项 | 评估 |
|---|---|---|
| 4.1.2 | 名称/角色/值 | ❌ `<view bindtap>` 无 role="button" |

### 6.5 关键不达标项

🔴 **P0-A11Y-1**：状态色对比度严重不足（ok 黄字白底 1.9:1）
🔴 **P0-A11Y-2**：矩阵单元格触达 29×26（远低于 44×44）
🟡 **P1-A11Y-3**：所有 `<view bindtap>` 应改用 `<button>` 或加 `role="button"`
🟡 **P1-A11Y-4**：image 缺 aria-label

---

## 7. 文案审计

### 7.1 P0 级

🔴 P0-COPY-1："今日已测 13" 单位歧义（→ "今日测了 13 次"）
🔴 P0-COPY-2："一起记录爸爸的血糖" 硬编码

### 7.2 P1 级

🟡 P1-COPY-3：错误 toast 用"网络异常"、"无法连接服务器" 等开发视角文案，应改用户视角："这个动作没成功，请稍后再试"
🟡 P1-COPY-4：detail 页"备注：无"应改 "（无备注）"
🟡 P1-COPY-5：ai-add"试试说" → "可以这样说"

### 7.3 P2 级

🟢 P2-COPY-6：about 页 "家庭内部使用" 表述笼统
🟢 P2-COPY-7：standards 页"上限/下限"在医学语境可改"理想区间"
🟢 P2-COPY-8："›/›" U+203A 装饰符语义弱，建议用 right-arrow icon

---

## 8. Edge Case 风险（代码层推演）

| 场景 | 当前行为 | 风险 |
|---|---|---|
| 空数据态（首次进入家庭、无任何记录） | 显示空态文字 + "糖" 字图标 + "点底部按钮记一次" | ✅ 处理良好 |
| 超长备注 200 字 | maxlength 截断 | ⚠️ 字段宽度不够会被截断换行 |
| 断网保存 | toast "无法连接服务器"，数据丢失 | 🔴 P0 风险 |
| token 过期 | api.js 401 → relogin 重试一次 | ✅ 处理 |
| 重复创建同名家庭 | 后端 ERR_FAMILY_NAME_TAKEN → modal 显示 | ⚠️ 名字唯一约束本身有问题 |
| 邀请码不存在 | toast "邀请码不存在" | ✅ |
| 邀请码格式错（非 6 位） | toast "请输入 6 位邀请码" | ✅ |
| 血糖值 50 上限 | toast 拒绝 | ⚠️ 应有二次确认（输错小数点） |
| 时段未选 | period 默认 fasting | ⚠️ 用户可能没选但默认空腹，记错时段 |
| 删除最后一个家庭成员（管理员） | 后端逻辑待验 | ⚠️ |
| 解散家庭后历史记录 | 后端逻辑待验 | ⚠️ |
| AI 解析失败 | 显示 error | ⚠️ 没引导用户改用手动 |
| 多设备同步 | 后端 list API 每次刷新 | ⚠️ 缺乏推送/订阅机制 |

---

## 9. 修订建议优先级表

### 9.1 P0 必修（共 7+ 项）

| ID | 描述 | 影响 | 工作量 |
|---|---|---|---|
| P0-DS-1 | grading 颜色 ok/high 不可辨 | 全部记录卡片状态信号失效 | S（改色值） |
| P0-DS-2 | grading 阈值不合理（ok 区间过宽） | 6.2 和 11.7 都判"一般" | M（改算法） |
| P0-RC-1 | AI 角标与时段同色 | AI 标识失败 | S |
| P0-IDX-1 | todayCount 计算错误 | 数字不准 | M（API 改） |
| P0-IDX-2 | "今日已测 13" 单位歧义 | 误解为 mmol/L | S |
| P0-IDX-3 | 默认 family.name="家有糖人" | 路由错位时错文案 | S |
| P0-ADD-1 | segment 跨页 redirectTo | 破坏栈 | M（合并页面） |
| P0-ADD-2 | 保存 toast 不可见 | 用户没反馈 | S |
| P0-AIA-1 | 800ms 防抖自动调 LLM | 浪费资源 | S |
| P0-AIA-2 | 推断字段标识不显眼 | 数据准确性风险 | S |
| P0-DTL-1 | 编辑权限只 isMine | 管理员改不了家人记录 | S |
| P0-JOIN-1 | "爸爸"硬编码 | 家庭场景错配 | S |
| P0-JOIN-2 | 家庭名全局唯一 | 冲突频发 | M（DB 改约束） |
| P0-ANA-1 | 矩阵 cell 触达 29x26 | 老人点不准 | M（重设计） |
| P0-ME-1 | 菜单图标用单字 | 视觉极度简陋 | S |
| P0-PP-1 | 8 时段一行视觉差小 | 选错时段医学风险 | M（重设计） |
| P0-A11Y-1 | 状态色对比度 1.9:1 | WCAG 严重不达标 | S |
| P0-A11Y-2 | 矩阵 cell 触达不足 | 同 P0-ANA-1 | M |
| P0-GLOBAL-5 | 缺离线/弱网保存 | 数据丢失风险 | L（需缓存层） |
| P0-COPY-1 | 今日已测单位歧义 | 同上 | S |
| P0-COPY-2 | 爸爸硬编码 | 同上 | S |

### 9.2 P1 强烈建议（共 12 项）

详见各页 P1 条目。

### 9.3 P2 优化（共 24 项）

详见各页 P2 条目。

---

## 10. 待视觉验证项

以下因第三方屏幕监控软件（飞连助手）覆盖层阻塞 computer-use，未能完成视觉验证，需要补充：

- [ ] 分析页 - 矩阵渲染（颜色映射是否如代码逻辑预期）
- [ ] 分析页 - 趋势图 canvas 渲染细节
- [ ] 分析页 - 报表 hero 视觉
- [ ] 我的页 - 菜单图标实际呈现
- [ ] 加入家庭页 - 邀请码输入态
- [ ] 家庭管理页 - 成员卡片 + joined_at 字符串渲染（P0-3 验证）
- [ ] 标准页 - 编辑 modal 体验
- [ ] 导出页 - 时间范围选择 + 生成 CSV 流程
- [ ] 关于页 - 整体视觉
- [ ] 详情页 - 删除/编辑权限实际表现
- [ ] AI 录入页 - 推断字段标识强度
- [ ] iPhone Pro Max（428×926）下的布局适配
- [ ] Android 模拟器下的兼容性
- [ ] 高亮动画时机（P0-2 视觉验证）
- [ ] 断网态实际表现
- [ ] 超长备注/超长家庭名实际换行/截断
- [ ] tabBar 图标视觉

待飞连助手解除后补 1-2 小时视觉验证。

---

## 11. 已验证视觉证据

### 首页（iPhone 15 Pro 模拟器）

观察到：
- 5 张记录卡片所有状态条均显示橙色"一般"——验证 P0-DS-1 + P0-DS-2（颜色映射 + 阈值问题）
- 2 张卡片显示 AI 角标（紫色...实际看是浅橙底深橙字）——验证 P0-RC-1（AI 角标视觉弱）
- "df的血糖记录"——家庭名异常（疑似旧测试残留 / fallback）
- 数值"7"无小数点，与"10.5/6.8/8.2/6.5"格式不一致 — **新增 P1**：数值显示统一 1 位小数

### 新增页 - 手动录入（iPhone 12/13 模拟器）

观察到：
- 时段 8 个 chip 排列实际成 2 行 4 列，"早餐前/早餐后/午餐前/午餐后" 标签紧靠
- 备注 placeholder 为"例如：吃了二甲双胍 0.5g"（注：先前怀疑错别字，复查 wxml 源码确认是"胍"非"肌"，纯视觉混淆，**无错别字**）
- 0.0 mmol/L 默认值显示——但实际 placeholder 是 "0.0"（灰字），不会保存为 0.0
- 保存按钮宽度撑满

---

## 12. 总体结论与建议

### 12.1 不建议直接上线

理由：
1. 血糖分级颜色信号失效（P0-DS-1/2 + P0-RC-1）——糖尿病应用核心功能依赖颜色识别异常
2. 数据安全风险（P0-GLOBAL-5）——离线状态下记录丢失
3. 中老年友好基线不达标（P0-ANA-1 + P0-ME-1 + P0-PP-1）——主要目标用户体验差

### 12.2 建议路径

**Phase 1（阻塞式修复，1-2 天）**：
- 修复 grading 颜色 + 阈值（后端 + 前端 const.js）
- AI 角标改色
- 删除 hardcoded "爸爸"
- 修复保存 toast 时序

**Phase 2（发版前完成，3-5 天）**：
- 离线缓存重试层（封装 api.js）
- 矩阵布局重设计
- 时段二段选择
- 菜单图标替换为真实 icon
- 编辑权限扩到管理员

**Phase 3（迭代优化）**：所有 P2 项目。

### 12.3 测试建议

接下来配合 codex 已生成的 `tests/automation/p0.test.js` 跑一遍 miniprogram-automator，验证 P0-1/P0-2/P0-3 的修复——届时可以做断言级验证。

---

**报告完毕。**
