#!/usr/bin/env bash
# 本机一键启动后端：检查环境 → 建 venv → 装依赖 → 生成 .env(若无) → 建表 → 启 uvicorn
# 用法：cd backend && bash scripts/dev_run.sh

set -e
cd "$(dirname "$0")/.."

# 1. 检查 Python 3.11+
if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ 没找到 python3"
  exit 1
fi
PYV=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYMAJOR=$(python3 -c 'import sys; print(sys.version_info.major)')
PYMINOR=$(python3 -c 'import sys; print(sys.version_info.minor)')
if [ "$PYMAJOR" -lt 3 ] || { [ "$PYMAJOR" -eq 3 ] && [ "$PYMINOR" -lt 11 ]; }; then
  echo "✗ 需要 Python 3.11+，当前 $PYV"
  echo "  brew install python@3.11 然后用 python3.11 重新跑"
  exit 1
fi
echo "✓ Python $PYV"

# 2. 创建/激活 venv
if [ ! -d ".venv" ]; then
  echo "→ 创建 venv (.venv)"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
echo "✓ venv 已激活"

# 3. 安装依赖
if [ ! -f ".venv/.deps_installed" ]; then
  echo "→ 安装依赖"
  pip install -e ".[dev]" --quiet
  touch .venv/.deps_installed
  echo "✓ 依赖已装"
else
  echo "✓ 依赖已就位"
fi

# 4. 生成 .env(若无)
if [ ! -f ".env" ]; then
  echo "→ 生成 .env（开发模式）"
  JWT=$(python3 -c "import secrets;print(secrets.token_hex(32))")
  cat > .env <<EOF
APP_NAME=家有糖人
APP_ENV=development
JWT_SECRET=$JWT
JWT_TTL_DAYS=30

# 微信小程序 AppID/Secret —— 本机调试可留空，登录走 mock
WX_APPID=
WX_SECRET=
# 开发模式下：APP_ENV=development 且 WX_MOCK_OPENID 非空时，
# /auth/login 不会调真实微信，直接返回这个 openid。
# 配多个家人：在不同的微信号里改这个值后重启服务，或改用一个动态 mock。
WX_MOCK_OPENID=local_dev_mama

# AI 解析：本机先用规则解析器，等申请到 DeepSeek key 再换
LLM_PROVIDER=none
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
LLM_TIMEOUT_SEC=5

DATABASE_URL=sqlite:///./data/glucose.db
LOG_LEVEL=INFO
# 本机调试加 localhost / 127.0.0.1 / 微信开发者工具的本地 host
CORS_ORIGINS=https://servicewechat.com,http://localhost,http://127.0.0.1,http://localhost:8080
EOF
  echo "✓ .env 已生成（含随机 JWT_SECRET），可按需修改 WX_MOCK_OPENID 模拟不同家人"
else
  echo "✓ .env 已存在"
fi

# 5. 建表
if [ ! -f "data/glucose.db" ]; then
  echo "→ 初始化数据库"
  python3 scripts/init_db.py
fi
echo "✓ 数据库就位 (data/glucose.db)"

# 6. 启动 uvicorn
echo ""
echo "════════════════════════════════════════════════════════"
echo " 后端启动：http://localhost:8080"
echo " 健康检查：curl http://localhost:8080/api/v1/health"
echo " 文档：    http://localhost:8080/docs"
echo " 按 Ctrl+C 停止"
echo "════════════════════════════════════════════════════════"
exec uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
