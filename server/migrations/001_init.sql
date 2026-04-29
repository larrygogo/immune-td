-- users：开放注册，角色二分
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- auth_tokens：可 revoke 的 bearer token
CREATE TABLE auth_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT
);
CREATE INDEX idx_tokens_user ON auth_tokens(user_id);
CREATE INDEX idx_tokens_expires ON auth_tokens(expires_at);

-- sessions：游戏录制
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_id TEXT,
  anon_ip TEXT,
  level_id INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('won', 'lost', 'aborted')),
  stars INTEGER,
  actions_count INTEGER NOT NULL,
  wave_reached INTEGER NOT NULL,
  end_tick INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id, created_at DESC);
CREATE INDEX idx_sessions_device ON sessions(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX idx_sessions_level_outcome ON sessions(level_id, outcome);
CREATE INDEX idx_sessions_created ON sessions(created_at DESC);
CREATE INDEX idx_sessions_anon_ip ON sessions(anon_ip) WHERE anon_ip IS NOT NULL;

-- bug_reports
CREATE TABLE bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_id TEXT,
  anon_ip TEXT,
  ts TEXT NOT NULL,
  level_id INTEGER,
  seed INTEGER,
  phase TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reports_user ON bug_reports(user_id, created_at DESC);
CREATE INDEX idx_reports_device ON bug_reports(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX idx_reports_created ON bug_reports(created_at DESC);

-- 迁移版本（手写 migrator 用；db.ts 引导时已创建，这里幂等）
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
