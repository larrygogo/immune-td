-- M1：站内信（游戏邮箱）系统
--
-- 设计要点（见 docs/superpowers/specs/2026-04-28-mailbox-system-design.md）：
-- 1. 双表：mail（内容） + user_mail_state（每用户状态），避免广播邮件 N×M 笛卡尔积
-- 2. 广播邮件：target_user_id IS NULL；定向邮件：target_user_id 指定
-- 3. user_mail_state 三个时间戳软删/已读/已领；都为 NULL 表示「未读未领未删」默认态
-- 4. CHECK 约束防止 admin 发超长内容（subject 100 / content 4000 字符上限）
-- 5. 收件箱 query 用 LEFT JOIN（user_mail_state 行可能不存在）

CREATE TABLE mail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL 表示广播
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  rewards TEXT,                                                   -- JSON，nullable
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  CHECK(length(subject) <= 100 AND length(content) <= 4000)
);
CREATE INDEX idx_mail_target ON mail(target_user_id, expires_at);
CREATE INDEX idx_mail_expires ON mail(expires_at);

-- 用户对邮件的状态（每条邮件 + 每个 user 一行；首次交互前不存在）
CREATE TABLE user_mail_state (
  mail_id INTEGER NOT NULL REFERENCES mail(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT,
  claimed_at TEXT,
  deleted_at TEXT,
  PRIMARY KEY (mail_id, user_id)
);
CREATE INDEX idx_user_mail_user ON user_mail_state(user_id);
