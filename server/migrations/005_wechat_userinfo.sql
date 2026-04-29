-- M-WX 强登录扩展：微信用户资料（昵称 + 头像）
--
-- 设计要点：
-- 1. 两列都 nullable —— wechat 用户首次 wechat-login 时还没授权 userInfo，
--    后续走独立 /api/auth/wechat-bind-userinfo 端点回填
-- 2. H5 用户永远 NULL，无副作用
-- 3. avatar 字段存 wx 返回的 avatarUrl（http URL；不下载到 server 也不限制长度，
--    wx 偶现极长签名 URL，TEXT 不限制长度才安全）
-- 4. 不建索引：这两列没查询场景，仅作为 user 资料展示

ALTER TABLE users ADD COLUMN wechat_nickname TEXT;
ALTER TABLE users ADD COLUMN wechat_avatar TEXT;
