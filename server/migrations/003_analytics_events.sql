-- analytics_events：通用埋点事件流。
-- props 字段存 JSON 文本（schema 由 server/src/shared/analytics-schema.ts 收敛）；
-- server_ts 为权威时钟（client_ts 仅参考，因玩家本地时钟可能偏差很大）。
CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,                       -- 服务端生成 UUID v4
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  props TEXT NOT NULL,                       -- JSON
  client_ts INTEGER NOT NULL,                -- ms epoch（客户端时钟）
  server_ts INTEGER NOT NULL,                -- ms epoch（入库权威时刻）
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL
);

-- 主要查询索引（参考 spec §6.1）：
-- - 按事件类型 + 时间窗（漏斗 / 失败热图）
CREATE INDEX idx_events_name_ts ON analytics_events(event_name, server_ts);
-- - 按用户 + 时间（玩家轨迹）
CREATE INDEX idx_events_user_ts ON analytics_events(user_id, server_ts);
-- - 按 session（一局完整事件流，关联 sessionRecording 回放）
CREATE INDEX idx_events_session ON analytics_events(session_id);
-- - 按设备（匿名玩家追踪 + 数据保留清理）
CREATE INDEX idx_events_device ON analytics_events(device_id);
