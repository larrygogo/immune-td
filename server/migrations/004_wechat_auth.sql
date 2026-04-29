-- M-WX：微信小游戏登录支持
--
-- 设计要点：
-- 1. wechat_openid / wechat_unionid 都是 nullable（H5 用户没有这两个字段）
-- 2. partial unique index 只在非 NULL 时强制唯一（让 H5 用户的 NULL 不互相冲突）
-- 3. 不动 password_hash NOT NULL 约束：wechat 用户用一段随机 argon2 哈希作为占位
--    （永不会通过 username/password 登录命中），保留 schema 整洁
-- 4. unionid 跨小程序 / 公众号稳定，优先级高于 openid（findOrCreate 顺序：unionid → openid → create）

ALTER TABLE users ADD COLUMN wechat_openid TEXT;
ALTER TABLE users ADD COLUMN wechat_unionid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid
  ON users(wechat_openid) WHERE wechat_openid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_unionid
  ON users(wechat_unionid) WHERE wechat_unionid IS NOT NULL;
