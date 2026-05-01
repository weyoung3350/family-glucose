# 部署指南

> **服务器**：`140.210.130.72`（已部署电子名片 `bwtonvcard`，端口 `8000`，路径 `/opt/app/bwtonvcard/`）
> **本项目**：端口 `8082`，路径 `/opt/app/glucose-api/`，用户 `glucose`，独立 nginx server 块。零冲突。

## 一、初次部署

```bash
# 1. 创建专用用户
sudo useradd -r -s /bin/false glucose

# 2. 准备目录
sudo mkdir -p /opt/app/glucose-api /var/log/glucose-api /var/backups/glucose

# 3. 上传代码（rsync 排除本地脏数据）
rsync -avz \
  --exclude .env \
  --exclude .venv \
  --exclude data/ \
  --exclude __pycache__ \
  --exclude '*.pyc' \
  /Users/dna/Documents/Develop/claude_prj/血糖记录/backend/ \
  <user>@140.210.130.72:/opt/app/glucose-api/

# 4. 服务器侧建 venv 装依赖
ssh <user>@140.210.130.72
cd /opt/app/glucose-api
python3 -m venv .venv
.venv/bin/pip install -e .

# 5. 配置 .env（生产值）
cp .env.example .env
vi .env
# 至少填：
#   APP_ENV=production
#   JWT_SECRET=$(openssl rand -hex 32)
#   WX_APPID=wx19b00df2783d720b
#   WX_SECRET=（填部署时收到的真实 secret）
#   WX_MOCK_OPENID=  ← 必须留空，否则任何人能登录到 mock 账号
#   DEEPSEEK_API_KEY=（可留空，留空则走规则解析器）
#   CORS_ORIGINS=https://servicewechat.com

# 6. 建库
mkdir -p data
.venv/bin/python scripts/init_db.py

# 7. 调主权
sudo chown -R glucose:glucose /opt/app/glucose-api /var/log/glucose-api /var/backups/glucose

# 8. systemd
sudo cp deploy/glucose-api.service.example /etc/systemd/system/glucose-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now glucose-api
sudo systemctl status glucose-api

# 9. 本机自检（不经过 nginx）
curl -s http://127.0.0.1:8082/api/v1/health
# 期望: {"status":"ok","app":"家有糖人","version":"0.1.0","env":"production"}

# 10. nginx
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/glucose-api.conf
sudo nginx -t
sudo systemctl reload nginx

# 11. HTTPS（推荐用现有泛域名证书；否则 certbot）
# 见下文「HTTPS 证书」一节

# 12. 公网验证
curl -s https://glucose-api.bwton.com/api/v1/health

# 13. 微信公众平台 → 开发管理 → 服务器域名 → request 合法域名添加：
#     https://glucose-api.bwton.com
```

## 二、HTTPS 证书

如已有 `*.bwton.com` 泛域名证书（推荐，与 `card.bwton.com` 共用一张证书）：

```bash
# 把现有证书路径加到 nginx server 块顶部：
#     listen 443 ssl http2;
#     ssl_certificate     /etc/nginx/ssl/bwton.com.fullchain.pem;
#     ssl_certificate_key /etc/nginx/ssl/bwton.com.key;
# listen 80 块改成 301 跳转 https
```

无现成证书走 Let's Encrypt：
```bash
sudo certbot --nginx -d glucose-api.bwton.com
```

## 三、升级

```bash
# 本机先打 tag
git tag v0.1.0 && git push --tags

# 服务器
ssh <user>@140.210.130.72
cd /opt/app/glucose-api
sudo systemctl stop glucose-api
# 备份数据库
sudo -u glucose cp data/glucose.db /var/backups/glucose/glucose-$(date +%Y%m%d-%H%M).db
# 拉新代码（或本地 rsync 推过来，记得 --exclude data/）
git pull
.venv/bin/pip install -e .
sudo systemctl start glucose-api
sudo systemctl status glucose-api
curl -s https://glucose-api.bwton.com/api/v1/health
```

**重要**：`rsync` 部署时**必须** `--exclude data/`，否则会把生产 SQLite 清掉（电子名片项目曾因此丢图，我们引以为戒）。

## 四、查看日志

```bash
# systemd 日志（含启动错误）
sudo journalctl -u glucose-api -f

# 应用文件日志
sudo tail -f /var/log/glucose-api/app.log
sudo tail -f /var/log/glucose-api/error.log

# nginx 访问日志
sudo tail -f /var/log/nginx/access.log | grep glucose-api
```

## 五、备份

```bash
# 加到 root 的 crontab
0 3 * * * /opt/app/glucose-api/deploy/backup.sh
# 备份位置 /var/backups/glucose/glucose-YYYYMMDD.db，保留 30 天
```

## 六、回滚

```bash
sudo systemctl stop glucose-api
sudo -u glucose cp /var/backups/glucose/glucose-YYYYMMDD.db data/glucose.db
git checkout <prev-tag>
sudo systemctl start glucose-api
```

## 七、与电子名片项目隔离

| 项 | 电子名片 | 家有糖人 |
|---|---|---|
| 路径 | `/opt/app/bwtonvcard/` | `/opt/app/glucose-api/` |
| 用户 | `bwtonvcard` | `glucose` |
| 端口 | `127.0.0.1:8000` | `127.0.0.1:8082` |
| 域名 | `card.bwton.com` | `glucose-api.bwton.com` |
| nginx 配置 | `/etc/nginx/conf.d/bwtonvcard.conf` | `/etc/nginx/conf.d/glucose-api.conf` |
| systemd | `bwtonvcard.service` | `glucose-api.service` |
| 数据库 | `/opt/app/bwtonvcard/server/data.db` | `/opt/app/glucose-api/data/glucose.db` |
| 日志 | （略） | `/var/log/glucose-api/` |
| 备份 | （略） | `/var/backups/glucose/` |

互不影响，各自启停升级即可。
