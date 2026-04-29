-- user_progress：每个用户一行，存 SyncableProgress JSON blob
-- payload_version 随客户端演进；服务端只校验 Zod schema，不解析字段
CREATE TABLE user_progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  payload_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
