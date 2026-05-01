# F02 · 工具与 API 封装

## 目标
实现前端通用工具：API 请求封装（含 token 注入和 401 重新登录）、颜色档位映射、时段映射、5 分钟取整、相对时间、微信分享辅助。

## 前置依赖
F01

## 上下文
- 概要设计 §6（API 设计）、§9.1-9.2（颜色 / 5 分钟规则）
- PRD §6.1-6.12

## 输入
- 完整 API 列表（概要设计 §6）
- 后端 base URL 通过 globalData 配置

## 输出

```
miniprogram/
└── utils/
    ├── api.js
    ├── color.js
    ├── period.js
    ├── time.js
    ├── share.js
    └── const.js
```

## 详细需求

### utils/const.js
导出与后端一致的枚举：

```javascript
export const PERIODS = [
  { key: "fasting", label: "空腹" },
  { key: "before_breakfast", label: "早餐前" },
  { key: "after_breakfast", label: "早餐后" },
  { key: "before_lunch", label: "午餐前" },
  { key: "after_lunch", label: "午餐后" },
  { key: "before_dinner", label: "晚餐前" },
  { key: "after_dinner", label: "晚餐后" },
  { key: "bedtime", label: "睡前" },
];
export const PERIOD_MAP = Object.fromEntries(PERIODS.map(p => [p.key, p.label]));

export const GRADE_LABELS = { low:"偏低", ideal:"理想", ok:"一般", high:"偏高", vhigh:"过高" };
export const GRADE_COLORS = {
  low:"#4DA3FF", ideal:"#52C41A", ok:"#FAAD14", high:"#FA8C16", vhigh:"#F5222D",
};

export const API_BASE = "https://YOUR_DOMAIN/api/v1"; // 用户部署后改这里
```

### utils/api.js

```javascript
import { API_BASE } from "./const.js";

function request(method, path, { data, query, headers } = {}) {
  const app = getApp();
  let url = API_BASE + path;
  if (query) {
    const qs = Object.entries(query).filter(([_,v])=>v!=null&&v!=='').map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join("&");
    if (qs) url += "?" + qs;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url, method, data,
      header: {
        "Content-Type": "application/json",
        ...(app.globalData.token ? { Authorization: "Bearer " + app.globalData.token } : {}),
        ...headers,
      },
      success: (res) => {
        if (res.statusCode === 401) {
          // 清空 token，跳登录
          app.globalData.token = null;
          wx.removeStorageSync("token");
          relogin().then(() => request(method, path, { data, query, headers })).then(resolve, reject);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const err = res.data && res.data.code ? res.data : { code:"ERR_HTTP", message:"网络异常" };
          reject(err);
        }
      },
      fail: () => reject({ code:"ERR_NETWORK", message:"无法连接服务器" }),
    });
  });
}

async function relogin() {
  const { code } = await wx.login();
  const userInfo = wx.getStorageSync("userInfo") || {};
  const r = await request("POST", "/auth/login", {
    data: { code, nickname: userInfo.nickName, avatar_url: userInfo.avatarUrl }
  });
  const app = getApp();
  app.globalData.token = r.token;
  app.globalData.user = r.user;
  app.globalData.family = r.family;
  wx.setStorageSync("token", r.token);
  wx.setStorageSync("user", r.user);
  wx.setStorageSync("family", r.family);
  return r;
}

export const api = {
  // 鉴权
  login: (data) => request("POST", "/auth/login", { data }),
  // 家庭
  createFamily: (name) => request("POST", "/families", { data: { name } }),
  joinFamily: (invite_code) => request("POST", "/families/join", { data: { invite_code } }),
  getFamily: () => request("GET", "/families/me"),
  updateFamily: (name) => request("PATCH", "/families/me", { data: { name } }),
  removeMember: (uid) => request("DELETE", `/families/me/members/${uid}`),
  leaveFamily: () => request("POST", "/families/me/leave"),
  dissolveFamily: () => request("DELETE", "/families/me"),
  // 标准
  getStandards: () => request("GET", "/families/me/standards"),
  updateStandards: (data) => request("PATCH", "/families/me/standards", { data }),
  // 记录
  listRecords: (query) => request("GET", "/records", { query }),
  getRecord: (id) => request("GET", `/records/${id}`),
  createRecord: (data) => request("POST", "/records", { data }),
  updateRecord: (id, data) => request("PATCH", `/records/${id}`, { data }),
  deleteRecord: (id) => request("DELETE", `/records/${id}`),
  // 分析
  matrix: (q) => request("GET", "/analytics/matrix", { query: q }),
  chart: (q) => request("GET", "/analytics/chart", { query: q }),
  report: (q) => request("GET", "/analytics/report", { query: q }),
  // 导出
  csvUrl: (q) => `${API_BASE}/export/csv?from=${q.from}&to=${q.to}&token=${getApp().globalData.token}`,
  // AI
  parseRecord: (text) => request("POST", "/ai/parse-record", { data: { text } }),
};

export { relogin };
```

### utils/color.js
```javascript
import { GRADE_COLORS, GRADE_LABELS } from "./const.js";
export function statusOf(record) {
  return record.status; // 后端已经算好
}
export function colorOf(level) { return GRADE_COLORS[level] || "#86909C"; }
export function labelOf(level) { return GRADE_LABELS[level] || ""; }
```

### utils/period.js
```javascript
import { PERIOD_MAP, PERIODS } from "./const.js";
export const periods = PERIODS;
export function periodLabel(key) { return PERIOD_MAP[key] || key; }
export function shortLabel(key) {
  return ({ before_breakfast:"早前", after_breakfast:"早后", before_lunch:"午前",
    after_lunch:"午后", before_dinner:"晚前", after_dinner:"晚后" })[key]
    || PERIOD_MAP[key];
}
```

### utils/time.js
```javascript
export function roundTo5Min(date) {
  const d = new Date(date.getTime());
  const m = d.getMinutes();
  let nm = Math.floor(m / 5) * 5;
  if (m % 5 >= 3) nm += 5;
  if (nm === 60) {
    d.setHours(d.getHours() + 1);
    nm = 0;
  }
  d.setMinutes(nm, 0, 0);
  return d;
}

export function formatDate(d, fmt="YYYY-MM-DD HH:mm") {
  const pad = (n) => String(n).padStart(2, "0");
  return fmt.replace("YYYY", d.getFullYear())
    .replace("MM", pad(d.getMonth()+1))
    .replace("DD", pad(d.getDate()))
    .replace("HH", pad(d.getHours()))
    .replace("mm", pad(d.getMinutes()));
}

export function relative(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  const that = new Date(d); const date0 = new Date(d); date0.setHours(0,0,0,0);
  const diff = Math.round((today - date0) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  return formatDate(that, "YYYY-MM-DD");
}

export function timeLabel(d) {
  return formatDate(new Date(d), "HH:mm");
}
```

### utils/share.js
```javascript
export function shareInviteCode(family) {
  // 用 button open-type=share 触发，这里只构造 onShareAppMessage 的内容
  return {
    title: `加入 "${family.name}"，一起记录爸爸的血糖`,
    path: `/pages/join/join?code=${family.invite_code}`,
    imageUrl: "" // 可选海报图，留空走默认截图
  };
}
```

## 验收标准

- [ ] 在控制台 `require("/utils/period.js").periodLabel("after_breakfast")` 返回 "早餐后"
- [ ] roundTo5Min 单元测试：09:23 → 09:25, 09:22 → 09:20, 09:00 → 09:00, 09:58 → 10:00
- [ ] 调 `api.listRecords({ from:"2026-04-01", to:"2026-04-29" })` 在网络 panel 看到正确的 GET 请求和 Authorization header
- [ ] 模拟 401 响应（mock），自动 re-login 并重试一次
- [ ] `api.csvUrl({from,to})` 拼出的 URL 含正确的 query 参数和 token

## 不在范围内
- 任何具体页面的 UI（F03+ 处理）
- 全局错误 toast（F03 看怎么消费 reject 后再决定是否抽取统一组件）
