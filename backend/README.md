# Backend (TypeScript + Express + MySQL / 阿里云 RDS)

- 入口：`src/app.ts`（编译输出到 `dist/app.js`）
- DB Helper：`src/db.ts`（基于 `mysql2/promise` 的连接池）

## API

- `POST /api/register`：用户注册（`email`、`password`、`role`、可选 `username`）。同一邮箱可在不同 `role` 下各注册一次（`(email, role)` 唯一）。
- `POST /api/login`：用户登录（`email`、`password`、可选 `role`），返回 JWT；若同一邮箱在多个角色下已注册，需要额外提供 `role` 以消歧。
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
mysql -h rm-xxxxxxxxxxxx.mysql.rds.aliyuncs.com -P 3306 -u your_db_user -p project1 < schema.sql
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
- `users` 表新增 `public_id`（对外展示用，内部主键仍为自增 `id`）
- 新增 `role_counters` 表，维护两类角色的下一个序号
- 新增触发器 `bi_users_public_id`：插入 `users` 时若未显式提供 `public_id`，按角色自动分配

验证：

```
SELECT id, role, public_id, email FROM users ORDER BY role, id LIMIT 50;
SELECT * FROM role_counters;
```

### 审核字段（导师）

`users` 表包含 `mentor_approved TINYINT(1) NOT NULL DEFAULT 0` 字段，用于控制导师卡片访问权限；审核通过后置为 `1` 才可访问 `/api/mentor/cards`。

迁移示例：

```
ALTER TABLE `users` ADD COLUMN `mentor_approved` TINYINT(1) NOT NULL DEFAULT 0;
```

## 重要变更：邮箱唯一性为 (email, role)

- 旧逻辑：`email` 全局唯一，导致同一邮箱无法以不同角色重复注册
- 新逻辑：允许同一邮箱在 `student` 和 `mentor` 下各注册一次；DB 层对 `(email, role)` 添加唯一约束

迁移说明：
- 新项目直接执行 `schema.sql` 即可完成初始化
- 已存在旧结构的项目：按需执行 `schema.sql` 注释中的索引迁移语句（先删旧 `uniq_users_email`，再建 `uniq_users_email_role`）

