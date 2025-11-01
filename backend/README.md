# Backend (TypeScript + Express + MySQL)

- Entry point: `src/app.ts` (compiled to `dist/app.js`)
- Routes:
  - `POST /api/register` — 用户注册（email、password、role、可选 username）
  - `POST /api/login` — 用户登录（email、password），返回 JWT
- DB Helper: `src/db.ts`（MySQL 连接池，基于 `mysql2/promise`）

## 环境变量

复制 `./.env.example` 到 `./.env` 并按需修改：

```
PORT=5000
JWT_SECRET=your_jwt_secret_here
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=project1
```

## 初始化数据库表

执行 `schema.sql` 创建 `users` 表：

```
mysql -u <user> -p <db_name> < schema.sql
```

## 安装与启动

```
cd backend
npm install
npm run build
npm start
```

开发模式（热启动）：

```
npm run dev
```

默认监听 `http://localhost:5000`，已启用 CORS，方便前端联调。

> 备注：旧的 JS 版本文件已迁移到 TypeScript 的 `src/` 目录，编译输出在 `dist/`，运行以 `dist/app.js` 为准。


# 登录 MySQL日常管理

## 登录 MySQL
mysql -h 127.0.0.1 -P 3306 -u root -p

## 选择数据库
USE project1;

## 查看表结构
DESCRIBE users;

## 查看部分数据
SELECT * FROM users;
