-- A1：公告系统
--
-- 设计要点（见 docs/superpowers/specs/2026-04-28-announcement-system-design.md）：
-- 1. 单表，不需要 user_announcement_read（client 端记 seenAnnouncementIds，匿名用户也支持）
-- 2. priority desc + published_at desc 排序，索引覆盖列表 query
-- 3. CHECK 约束限制 admin 误发超长内容（与 mail 同上限）

CREATE TABLE announcement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  CHECK(length(title) <= 100 AND length(content) <= 4000)
);
CREATE INDEX idx_announcement_active ON announcement(expires_at, priority DESC);
