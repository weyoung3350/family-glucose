# 家有糖人

> 家庭共享的血糖记录小程序。一家人共用一份记录，子女配偶都能随时帮长辈记一笔。

[![status](https://img.shields.io/badge/version-v0.1.0-orange)](https://github.com/weyoung3350/family-glucose/releases)
[![license](https://img.shields.io/badge/license-private-lightgrey)](#)

## 项目特点

- **家庭协作**：一份记录全家共用，无需切账号；管理员邀请家人加入
- **双录入方式**：手动录入（5 分钟刻度）+ AI 一句话快记（"早上 9:20 空腹血糖 11.1，吃了二甲双胍"）
- **五档颜色分级**：低 / 理想 / 一般 / 偏高 / 过高，按家庭自定义标准动态判定
- **三视图分析**：按天矩阵 / 趋势曲线 / 周期报表
- **离线暂存**：网络异常时本地排队，连网后自动同步
- **CSV 导出**：用于线下复诊
- **中老年友好**：温暖橙主色、大字号、大按钮、无小图标
- **不收集 PHI**：仅家庭内部使用，数据自托管

## 技术栈

| 层 | 技术 |
|---|---|
| 小程序 | 微信原生（无框架）、SCSS、Canvas 2D |
| 后端 | Python 3.11 + FastAPI + SQLModel |
| 存储 | SQLite |
| AI 解析 | DeepSeek（可选；留空走规则解析器） |
| 部署 | systemd + nginx + 华为云 WAF |

## 目录结构

```
.
├── backend/                        # FastAPI 后端
│   ├── app/                        # 业务代码（routers / services / schemas / models）
│   ├── tests/                      # pytest 单元测试（grading 17 项）
│   ├── deploy/                     # 生产部署脚本（systemd / nginx / backup）
│   └── scripts/{init_db,dev_run}.sh
├── miniprogram/                    # 微信小程序
│   ├── pages/{index,add,detail,...}
│   ├── components/{record-card,glucose-chip,period-picker}
│   ├── utils/{api,offline,time,...}
│   └── images/{icon-*.png,share-card.png,tab-*.png}
├── docs/                           # PRD / 概要设计 / 任务清单 / 验收报告
│   ├── 简化版血糖记录小程序-需求规格说明书.md
│   ├── 概要设计.md
│   ├── 项目对话记录.md             # 决策时间线
│   ├── tasks/                      # 22 份开发任务文档 + Codex prompts
│   └── tasks/_acceptance/          # 三轮 Sprint 验收报告
└── tests/automation/               # 微信开发者工具自动化测试
```

## 快速启动（本机调试）

```bash
# 1. 后端
cd backend
bash scripts/dev_run.sh
# → http://localhost:8080，OpenAPI: http://localhost:8080/docs

# 2. 小程序
# 用微信开发者工具打开 ./miniprogram/
# 详情 → 本地设置 → 勾选「不校验合法域名」
# utils/const.js 设 USE_LOCAL = true
```

详见 [`docs/本机调试指南.md`](docs/本机调试指南.md)。

## 生产部署

详见 [`backend/deploy/README.md`](backend/deploy/README.md)。简要：

```bash
rsync backend/ root@server:/opt/app/glucose-api/
ssh root@server
cd /opt/app/glucose-api
python3.11 -m venv .venv && .venv/bin/pip install -e .
cp .env.example .env && vi .env  # 填 JWT_SECRET / WX_APPID / WX_SECRET
.venv/bin/python scripts/init_db.py
systemctl enable --now glucose-api
cp deploy/nginx.conf.example /etc/nginx/conf.d/glucose-api.conf
nginx -t && systemctl reload nginx
```

## 测试

```bash
# 后端单元测试
cd backend && .venv/bin/pytest tests/ -v
# 17 grading 用例

# 小程序自动化测试
cd tests/automation && node sprint2.test.js
# 11/11 pass
```

## 版本历史

- **v0.1.0**（2026-05-01）：首发上线
  - Sprint 0：颜色分级修复 + grading 阈值优化 + AI 角标 + 文案
  - Sprint 1：家庭名去 unique + 管理员权限 + todayCount 后端化 + 矩阵触达 + 离线缓存 + segment 同页化
  - Sprint 2：时段二段选择 + 大值二次确认 + safe-area + 多项视觉细节

## License

家庭内部使用，未公开发行。

## 致谢

- 设计参考微信小程序「血糖记事本」（功能差异化：家庭协作 + AI 快记）
- 开发使用 [Claude Code](https://claude.com/claude-code) 多 agent 协作 + Codex 验证
