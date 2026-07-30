# Project1

## Mentory

Make learning go further.

- 后端文档移至 `backend/README.md`
- 前端（React）文档见 `my-app/README.md`

## 生产环境 ECS 项目目录

生产环境 ECS 上的项目目录为：

```bash
cd /opt/mentory/
```

### 更新后端 `.env` 并重启

在生产环境 ECS 上修改后端环境变量后，需要重启 PM2 进程并更新环境变量：

```bash
cd /opt/mentory/backend
nano .env
# 添加或修改需要的环境变量
# Ctrl+O 回车保存，Ctrl+X 退出
pm2 restart mentory-backend --update-env
```

## 学生首页课程 Tab 与导师排序机制

Mentory 支持导师在个人名片中自定义「可授课课程」，并在学生首页按课程方向（Tab）浏览导师。其核心逻辑如下：

- 导师侧：导师保存名片时，系统会对课程文本做标准化/去重，生成语义表示（embedding），并计算其与每个课程方向 Tab 的相关度（取“最相关”的那条课程），将结果持久化保存。
- 学生侧：学生点击某个课程方向 Tab 后，服务端直接读取该方向的已存相关度对导师列表排序返回，无需实时计算向量相似度。
- “其它课程方向”Tab：不做向量化匹配，而是基于已存相关度做派生计算（例如：当导师对所有已定义方向的最高相关度低于阈值时，才会进入该 Tab，并按“缺口值”从高到低排序）。
- Tab 顺序：课程方向 Tab 的展示顺序支持个性化配置（可在设置中调整），不影响上述排序机制。

### Embedding 模型配置与迁移

当前默认文本向量模型为 `qwen3.7-text-embedding`，默认维度为 `256`。生产环境应显式配置：

```bash
DASHSCOPE_EMBEDDING_MODEL=qwen3.7-text-embedding
DASHSCOPE_EMBEDDING_DIM=256
```

模型或维度变更时，必须在后端停止接收写入的维护窗口内依次执行：

```bash
cd /opt/mentory/backend
npm run db:migrate:embedding-model
npm run embed:courses -- --force
npm run backfill:mentor-courses
pm2 restart mentory-backend --update-env
```

课程方向向量、导师课程向量和预计算方向分数会记录模型与维度；服务只比较同一模型、同一维度的数据，防止迁移期间混用不同向量空间。


## 同步到远端 `main`（强制覆盖本地）

注意：以下操作会丢弃本地改动（包含未提交/已提交但未推送的提交），并删除未跟踪文件/目录。

```bash
git fetch origin
git reset --hard origin/main
git clean -fd
```
