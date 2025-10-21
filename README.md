# Project1

## Backend (TypeScript + Express + MySQL)

- Entry point: `backend/src/app.ts` (compiled to `backend/dist/app.js`)
- Routes:
  - `POST /api/register` — 用户注册（email、password、role、可选 username）
  - `POST /api/login` — 用户登录（email、password），返回 JWT
- DB Helper: `backend/db.js`（MySQL 连接池，基于 `mysql2/promise`）

### 环境变量

复制 `backend/.env.example` 到 `backend/.env` 并按需修改：

```
PORT=5000
JWT_SECRET=your_jwt_secret_here
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=project1
```

### 初始化数据库表

执行 `backend/schema.sql` 创建 `users` 表：

```
mysql -u <user> -p <db_name> < backend/schema.sql
```

### 安装与启动（后端）

```
cd backend
npm install
npm run build
npm start
```

开发模式（热启动）可使用：

```
npm run dev
```

默认监听 `http://localhost:5000`，已启用 CORS，方便前端联调。

> 备注：旧的 JS 版本文件已迁移到 TypeScript 的 `src/` 目录，编译输出在 `dist/`，运行以 `dist/app.js` 为准。
