# Backend (TypeScript + Express + MySQL / 阿里云 RDS)

- 入口：`src/app.ts`（编译输出到 `dist/app.js`）
- DB Helper：`src/db.ts`（基于 `mysql2/promise` 的连接池）

## API

- `POST /api/register`：注册/开通角色（`email`、`password`、`role`、可选 `username`）。同一 `email` 只对应一个账号 `userId`；若账号已存在且密码正确，可追加开通另一角色。
- `POST /api/login`：用户登录（`email`、`password`），返回 JWT（默认优先使用 `mentor` 作为 token role），并返回该账号已开通的角色列表（含 `public_id`）。
- `GET /api/mentor/cards`：导师卡片；仅 `role=mentor` 且 `mentor_approved=1` 可访问，否则返回 403 `{ error: '导师审核中' }`。

## 环境变量（已迁移到阿里云 RDS）

复制 `./.env.example` 到 `./.env` 并按你的 RDS 配置修改（不要把真实密码提交到 Git）。

```
PORT=5000
JWT_SECRET=your_jwt_secret_here

# 阿里云 RDS MySQL
DB_HOST=rm-xxxxxxxxxxxx.mysql.rds.aliyuncs.com
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=project1
```

注意：请在阿里云 RDS 控制台配置「白名单/安全组」，放行你的后端服务器出口 IP（或本机 IP）访问 `DB_PORT`。

## 初始化数据库表

执行 `schema.sql` 创建/迁移表结构（从本机或服务器连到 RDS 执行即可）：

```
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < schema.sql
```

示例：

```
mysql -h rm-xxxxxxxxxxxx.mysql.rds.aliyuncs.com -P 3306 -u mentorx_dev -p project1 < schema.sql
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
> 备注：旧的 JS 版本已迁移到 TypeScript 的 `src/`，编译输出在 `dist/`，运行以 `dist/app.js` 为准。

## 连接 MySQL / RDS（日常管理）

登录：

```
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p
```

选择数据库：

```
USE project1;
```

查看表结构：

```
DESCRIBE users;
DESCRIBE user_roles;
```

查看部分数据：

```
SELECT * FROM users;
```

## 角色编号（s#/m#）迁移说明

本仓库的 `schema.sql` 支持为不同角色分配独立的对外编号：
- `student`：`s1, s2, ...`
- `mentor`：`m1, m2, ...`

实现方式：
- `users` 表为账号表（一个人一个 `id`，`email` 仅做唯一约束，不作为主键）
- `user_roles` 表存放角色信息与对外编号 `public_id`（student => s#，mentor => m#）
- 新增 `role_counters` 表，维护两类角色的下一个序号
- 新增触发器 `bi_user_roles_public_id`：插入 `user_roles` 时若未显式提供 `public_id`，按角色自动分配

验证：

```
SELECT u.id, u.email, r.role, r.public_id, r.mentor_approved
FROM users u
JOIN user_roles r ON r.user_id = u.id
ORDER BY u.id, r.role
LIMIT 50;
SELECT * FROM role_counters;
```

### 审核字段（导师）

`mentor_approved` 位于 `user_roles`（仅 `role='mentor'` 时生效），用于控制导师卡片/资料编辑权限；审核通过后置为 `1` 才可访问 `/api/mentor/*` 的受限接口。

示例：

```
UPDATE user_roles SET mentor_approved = 1 WHERE user_id = <userId> AND role = 'mentor';
```

## 重要变更：同一邮箱只有一个 userId

- v1 结构：同一邮箱在 student/mentor 下会生成两条 `users` 记录（两个不同 id），部分逻辑不得不使用 email 做“关联键”。
- v2 结构：`users` 只保留账号维度（一人一条），student/mentor 角色由 `user_roles` 承载，因此你可以同时拥有 `StudentID(s#)` 与 `MentorID(m#)`，但账号 `userId` 始终只有一个。

## 从旧库（v1）升级到新库（v2）

1) 先在阿里云 RDS 做一次备份/快照（强烈建议）。
2) 确认 `.env` 指向你的 RDS，并使用具备 `CREATE/ALTER/TRIGGER` 权限的账号。
3) 执行迁移（会把旧表重命名为 `*_v1`，新表用 v2 结构重建并迁移数据）：

```
cd backend
npm run db:migrate:v2
```

4) 迁移完成后再启动后端：`npm start` / `npm run dev`。

注意：如果同一邮箱在 v1 的 student/mentor 使用过不同密码，迁移后只会保留“最后注册的一条记录”的密码；如遇登录失败，请走一次“重置密码/人工改密码”流程。
