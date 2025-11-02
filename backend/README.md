# Backend (TypeScript + Express + MySQL)

- Entry point: `src/app.ts` (compiled to `dist/app.js`)
- Routes:
  - `POST /api/register` — 用户注册（email、password、role、可选 username）。同一邮箱可在不同角色各注册一次。
  - `POST /api/login` — 用户登录（email、password[, role]），返回 JWT。若某邮箱在多个角色下已注册，需额外提供 `role` 以消歧。
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

执行 `schema.sql` 创建/迁移表结构：

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
```
mysql -h 127.0.0.1 -P 3306 -u root -p
```

## 选择数据库
```
USE project1;
```

## 查看表结构
```
DESCRIBE users;
```

## 查看部分数据
```
SELECT * FROM users;
```


## 角色编号（s#/m#）迁移说明
本仓库的 `schema.sql` 已支持为不同角色分配独立的对外编号：
- `student` 按顺序分配 `s1, s2, ...`
- `mentor` 按顺序分配 `m1, m2, ...`

实现方式：
- 在 `users` 表新增 `public_id`（唯一，对外显示用），内部主键仍是自增 `id`。
- 新增 `role_counters` 表，分别维护两个角色的下一个序号。
- 新增触发器 `bi_users_public_id`：插入 `users` 时若未显式给出 `public_id`，按角色自动分配。
- 对既有数据会按 `id` 升序回填 `public_id`（学生 `s#`，导师 `m#`），并同步计数器。

运行迁移（可安全重复执行）：
```
mysql -u <user> -p <db_name> < schema.sql
```

验证：
```
SELECT id, role, public_id, email FROM users ORDER BY role, id LIMIT 50;
SELECT * FROM role_counters;
```

接口返回建议：注册成功后可同时返回 `public_id` 给前端展示；查询时按需 `SELECT public_id FROM users WHERE id = ?`。

## 重要变更：邮箱唯一性调整为 (email, role)

- 旧逻辑：`email` 全局唯一，导致同一邮箱无法以不同角色重复注册。
- 新逻辑：允许一个邮箱在 `student` 与 `mentor` 下各注册一次；在 DB 层对 `(email, role)` 施加唯一约束。

迁移说明：
- 新项目直接执行 `schema.sql` 即可完成初始化。
- 已存在旧结构的项目，请按需执行注释中的 `DROP INDEX uniq_users_email ON users;` 和 `CREATE UNIQUE INDEX uniq_users_email_role ON users (email, role);` 以完成索引迁移（若索引不存在可忽略报错）。
