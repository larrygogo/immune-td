# ---------- Builder ----------
# 固定 bun patch 版本，避免 oven/bun:1-alpine latest 随时变化
FROM oven/bun:1.3.13-alpine AS builder
WORKDIR /app

# deps 先装（利用 Docker layer cache）
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 再 copy 源码 + migrations + tsconfig（.dockerignore 已排除无用内容）
COPY . .

# 构建：bun build 输出 dist/server.js；@node-rs/argon2 作为 external（NAPI 原生 addon 无法 bundle）
RUN bun run build

# ---------- Runtime ----------
FROM oven/bun:1.3.13-alpine AS runtime
WORKDIR /app

# 健康检查要用 wget（alpine 自带 busybox wget 基本够用）；顺便装 ca-certificates 备 TLS fetch
RUN apk add --no-cache ca-certificates

# 只 copy 运行时需要的内容：打包产物 + migrations SQL + node_modules（含原生 .node）
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# 默认配置（docker-compose 里可覆盖）
ENV DATABASE_URL=/data/immune-td.db
ENV BIND_HOST=0.0.0.0
ENV BIND_PORT=3100
ENV LOG_LEVEL=info

EXPOSE 3100
VOLUME ["/data"]

# healthcheck：依赖启动期 DB migrate 完成（start-period 10s 留缓冲）
# 用 127.0.0.1 不是 localhost：alpine busybox wget 把 localhost 解析到 ::1 IPv6，
# bun.serve 默认只 bind IPv4 → connection refused 误报 unhealthy。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3100/health || exit 1

CMD ["bun", "run", "./dist/server.js"]
