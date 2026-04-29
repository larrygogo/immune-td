-- nickname 设计 spec § 3.1
-- 两列均 nullable —— 现有 H5 老用户、所有 wx 用户都先 NULL；登录后由
-- POST /api/auth/nickname 端点回填。
-- partial UNIQUE index `WHERE nickname IS NOT NULL` —— 大量 NULL 不撞车。
-- COLLATE NOCASE —— 防止 'Larry' / 'larry' 撞名。

ALTER TABLE users ADD COLUMN nickname TEXT;
ALTER TABLE users ADD COLUMN nickname_set_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_uniq
  ON users(nickname COLLATE NOCASE)
  WHERE nickname IS NOT NULL;
