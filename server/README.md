# Immune TD Debug Server

后台服务接收玩家 session 录制 + bugReport 快照，支持用户注册登录。Bun + Hono + SQLite。

## 技术栈

- Bun 1.x + TypeScript strict
- Hono（HTTP + middleware）+ Zod（body validation）
- `bun:sqlite`（WAL 模式）+ `@node-rs/argon2`（密码哈希）
- `hono-rate-limiter`（IP/user 分组限流）+ 每日 cron 清理匿名过期数据

---

## 本地开发

### 方式 A：裸机（快速迭代推荐）

```bash
cd server
bun install
cp .env.example .env
# 编辑 .env，至少设：
#   INITIAL_ADMIN_USERNAME=larry
#   INITIAL_ADMIN_PASSWORD=<你的密码>
bun run dev         # --hot 自动重载
# 访问 http://localhost:3100/health
```

### 方式 B：Docker Compose（模拟生产）

```bash
cd server
cp .env.example .env
# .env 必填：INITIAL_ADMIN_PASSWORD（username 默认 larry）
docker compose up -d --build
docker compose logs -f server
# 访问 http://localhost:3100/health
```

数据持久化在 `./data/immune-td.db`，`docker compose down` 不会丢；
要彻底重置：`docker compose down && rm -rf ./data`。

---

## API Endpoints

- `POST /api/auth/register` — 注册（开放）
- `POST /api/auth/login` — 登录
- `POST /api/auth/logout` — 注销（需 Bearer）
- `GET  /api/me` — 当前用户（需 Bearer）
- `POST /api/sessions` — 上传 session（匿名 / 登录均可，必带 `X-Device-Id`）
- `GET  /api/sessions` / `GET /api/sessions/:id` / `DELETE /api/sessions/:id` — 需登录，player 仅自己 / admin 全部
- `POST /api/bug-reports` — 同上
- `GET  /api/bug-reports` / `GET /api/bug-reports/:id` / `DELETE /api/bug-reports/:id` — 同上
- `GET  /health` — 健康检查

---

## 初始 admin 登录（首次部署）

启动时若 `users` 表为空且 env `INITIAL_ADMIN_USERNAME` + `INITIAL_ADMIN_PASSWORD` 都设了，会自动创建一个 admin 帐号。

```bash
# 验证：
curl -X POST http://localhost:3100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"larry","password":"your-pwd"}'
# 期望返回 { token, user: { ..., role: "admin" } }
```

---

## 修改密码

MVP 没有 change-password API。目前只能绕路：

### 方案 1：容器内手改（推荐）

```bash
# 1. 容器里生成新密码的 argon2id hash（@node-rs/argon2 默认就是 argon2id）
docker compose exec server bun -e '
  const { hash } = await import("@node-rs/argon2");
  console.log(await hash(process.argv[1]));
' "new-password-here"

# 2. 用上一步输出的 hash 更新 users 表
docker compose exec server bun -e '
  const { Database } = await import("bun:sqlite");
  const db = new Database("/data/immune-td.db");
  db.query("UPDATE users SET password_hash = ? WHERE username = ?")
    .run(process.argv[1], process.argv[2]);
  console.log("ok, rows:", db.query("SELECT changes() AS c").get());
' "<粘贴上一步的 hash>" "larry"
```

> `@node-rs/argon2` 的 `hash()` 默认就是 argon2id，和 `src/auth/password.ts` 一致，两边都不用显式传 algorithm。

### 方案 2：全清重建

```bash
docker compose down
rm -rf ./data
# 在 .env 里改 INITIAL_ADMIN_PASSWORD 为新值
docker compose up -d --build
```

**会丢所有 session / bug-report 数据**，只建议本地测试或早期生产用。

---

## 生产部署（Caddy 反代）

假设域名 `api.immune-td.example.com`，VPS 上装了 Docker + Caddy。

### Caddyfile

```
api.immune-td.example.com {
  reverse_proxy localhost:3100
}
```

Caddy `reverse_proxy` 默认会自动附 `X-Forwarded-For` / `X-Real-IP` / `X-Forwarded-Proto`，server 端 `clientIp()` 按 XFF 首段取客户端真实 IP 就够用，无需手动 `header_up`。Caddy 会自动签 Let's Encrypt 证书。`caddy reload` 生效。

### docker-compose.override.yml（生产）

默认 `docker-compose.yml` 绑 `0.0.0.0:3100` 适合本地调试。生产建议用 override 只绑 localhost：

```yaml
# docker-compose.override.yml
services:
  server:
    ports:
      - "127.0.0.1:3100:3100"   # 只监听 localhost，由 Caddy 反代
    environment:
      CORS_ALLOWED_ORIGINS: "https://immune-td.example.com"
      LOG_LEVEL: warn
```

compose 会自动 merge base + override，不用改原 `docker-compose.yml`。

### 部署流程

```bash
# 第一次
git clone <repo> /opt/immune-td
cd /opt/immune-td/server
cp .env.example .env
vim .env          # 至少设 INITIAL_ADMIN_PASSWORD
docker compose up -d --build

# 后续更新
cd /opt/immune-td
git pull
cd server
docker compose up -d --build        # 重新 build 镜像 + 滚动重启
docker compose logs -f server        # 观察启动
```

### 备份

```bash
# 宿主机 crontab -e：每日凌晨 3 点导出 + gzip
0 3 * * * cd /opt/immune-td/server && sqlite3 ./data/immune-td.db .dump | gzip > /backups/immune-td-$(date +\%F).sql.gz

# 每周清理 30 天前的备份
30 3 * * 0 find /backups -name "immune-td-*.sql.gz" -mtime +30 -delete
```

恢复：

```bash
docker compose down
gunzip -c /backups/immune-td-2026-04-23.sql.gz | sqlite3 ./data/immune-td.db
docker compose up -d
```

---

## 监控

- `GET /health` 返 `{status, db, uptime_sec, version}` — 可挂 Uptime Robot / BetterUptime
- Bun 进程日志走 `docker compose logs`；生产建议配置 docker logging driver（`json-file` max-size 轮转 或 导 Loki / CloudWatch）

Dockerfile 里已加 `HEALTHCHECK`（30s 轮询 `/health`），`docker ps` 可直接看 healthy 状态。

---

## 玩家行为追溯（SQL Cookbook）

`analytics_events` 是「玩家关键操作」的权威时序流。`props` 是 JSON 文本，用 SQLite 内置 `json_extract()` 提字段。所有查询按 `server_ts` 排序（client_ts 仅参考）。

### 单玩家完整时间线（道具购买/解锁/装备/设置全收）

```sql
SELECT datetime(server_ts/1000, 'unixepoch', 'localtime') AS ts,
       event_name, props
  FROM analytics_events
 WHERE user_id = ?1
   AND event_name IN (
     'research_purchase','research_reset','meta_unlock','stars_update',
     'loadout_change','setting_change',
     'tower_place','tower_upgrade','tower_sold'
   )
 ORDER BY server_ts;
```

### 「玩家研究点花到哪了」溯源

```sql
SELECT datetime(server_ts/1000, 'unixepoch', 'localtime') AS ts,
       json_extract(props, '$.id')        AS research_id,
       json_extract(props, '$.cost')      AS cost,
       json_extract(props, '$.rp_before') AS rp_before,
       json_extract(props, '$.rp_after')  AS rp_after
  FROM analytics_events
 WHERE user_id = ?1 AND event_name = 'research_purchase'
 ORDER BY server_ts;
```

### 「玩家什么时候解锁的某个塔/关卡」

```sql
SELECT datetime(server_ts/1000, 'unixepoch', 'localtime') AS ts,
       json_extract(props, '$.type') AS type,
       json_extract(props, '$.id')   AS id
  FROM analytics_events
 WHERE user_id = ?1 AND event_name = 'meta_unlock'
 ORDER BY server_ts;
```

### 「关卡 N 通关分布」（按星级聚合）

```sql
SELECT json_extract(props, '$.stars_after') AS stars,
       COUNT(*) AS players
  FROM analytics_events
 WHERE event_name = 'stars_update'
   AND json_extract(props, '$.level_id') = ?1
   AND json_extract(props, '$.mode') = 'normal'
 GROUP BY stars;
```

### 「平均第几关换 loadout」

```sql
SELECT json_extract(props, '$.level_id') AS level_id,
       COUNT(DISTINCT user_id)           AS players_changed
  FROM analytics_events
 WHERE event_name = 'loadout_change'
 GROUP BY level_id ORDER BY level_id;
```

### 「某局战斗的所有放/升/拆塔」（关联 session 录像 ID）

```sql
SELECT datetime(server_ts/1000, 'unixepoch', 'localtime') AS ts,
       event_name, props
  FROM analytics_events
 WHERE session_id = ?1
   AND event_name IN ('tower_place','tower_upgrade','tower_sold')
 ORDER BY server_ts;
```

> **配合回放**：`sessions` 表的录像（按 session_id）能完整重放战斗；analytics 这条 SQL 则给"经济决策汇总视图"。两者互补。

### 匿名玩家追溯（按 device_id）

匿名玩家 `user_id IS NULL`，按 `device_id` 串联。匿名数据 30 天自动清理。

```sql
SELECT datetime(server_ts/1000, 'unixepoch', 'localtime') AS ts,
       event_name, props
  FROM analytics_events
 WHERE device_id = ?1 AND user_id IS NULL
 ORDER BY server_ts;
```

> 拆塔被啃死（DOT 致死）不是玩家操作，不发 `tower_sold` 埋点；查回放（`sessions` 表）看 `TOWER_DESTROYED` 事件。

---

## Tech Debt / 二期

### 功能
- 邮箱验证 / 忘记密码（需邮件服务）
- OAuth / 邀请码 / 2FA
- change-password / password-reset endpoint
- Admin Web dashboard（目前查询只能 curl 或 SQL）
- Rate limit 切 Redis store（多实例部署时）

### 生产加固
- Dockerfile: runtime stage prune devDependencies（builder 的 `bun install` 含 bun-types / typescript，runtime 无需）→ 镜像减小 + 减少 attack surface
- SIGTERM graceful shutdown：`src/index.ts` 加 signal handler 调 `stopCleanup()` + 优雅 close HTTP + WAL flush，避免 `docker stop` 粗暴截断事务（WAL 模式能恢复但每次 deploy 日志有 recovery）
- Docker non-root user：runtime 切 `USER bun`，`/data` volume 挂载 entrypoint 里 chown（当前以 root 跑，MVP 可接受）

---

## 设计文档

- Spec: `../docs/superpowers/specs/2026-04-23-debug-server-and-user-system.md`
- Plan: `../docs/superpowers/plans/2026-04-23-debug-server-and-user-system.md`
