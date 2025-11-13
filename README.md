
# TradeHub (MVP)

一个面向 **持牌技工** 的免费聚合平台（类似 Craigslist 的垂直版）。
技术栈：**Rust (Axum) + Askama (SSR) + SQLx + SQLite + HTMX + Tailwind**。

## 快速开始

```bash
# 1) 复制环境变量模板
cp .env.example .env

# 2) 运行数据库迁移（需要安装 sqlx-cli）
# cargo install sqlx-cli
sqlx database create
sqlx migrate run

# 3) 启动服务
cargo run
# 访问 http://localhost:8080
```

## 结构
```
tradehub/
├─ Cargo.toml
├─ .env.example
├─ migrations/
│  ├─ 0001_init.sql
│  └─ 0002_fts5.sql
└─ src/
   ├─ main.rs
   ├─ db.rs
   ├─ routes/
   │  └─ mod.rs
   └─ templates/
      ├─ layout.html
      └─ index.html
```

## 下一步
- 加入认证与会话（/auth/*）
- 执照上传与审核（/admin/licenses）
- 列表页/详情页 + 预约与消息
- 部署时可用 Nginx 反代静态资源
