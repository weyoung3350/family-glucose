# 家有糖人后端

家有糖人微信小程序的 FastAPI 后端服务。

## 安装

```bash
cd backend
pip install -e ".[dev]"
```

## 配置

```bash
cp .env.example .env
```

然后按实际环境编辑 `.env`。

## 启动

```bash
uvicorn app.main:app --reload --port 8080
```

## 验证

```bash
curl http://localhost:8080/api/v1/health
```
