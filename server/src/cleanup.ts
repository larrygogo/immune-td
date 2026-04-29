import type { Database } from 'bun:sqlite';
import { deleteExpiredAnnouncements } from './models/announcement';
import { deleteExpiredMail } from './models/mail';

/**
 * mail / announcement 过期后再保留多少天才物理删（spec § 4.3 / § 4.3）。
 * 7 天回收期：让客诉时还能从 DB 找到原记录。
 */
const MAIL_RETENTION_DAYS_AFTER_EXPIRY = 7;
const ANNOUNCEMENT_RETENTION_DAYS_AFTER_EXPIRY = 7;

/**
 * 每日凌晨 / 启动后 30s 跑一次：删 30 天前的匿名记录 + 过期 auth_token +
 * 过期 7 天的 mail / announcement。
 * 单实例内存定时器（MVP）；多实例部署时应外部 cron 触发唯一实例执行。
 */
export function startCleanupLoop(db: Database, retentionDays: number): () => void {
  const sweep = () => {
    try {
      sweepOnce(db, retentionDays);
    } catch (err) {
      console.error('[cleanup] sweep failed:', err);
    }
  };
  const firstRun = setTimeout(sweep, 30_000);
  const loop = setInterval(sweep, 24 * 60 * 60 * 1000);
  // Bun/Node 的 setTimeout/setInterval 返回 Timer；unref 让它不阻塞进程退出
  // （长跑 server 的其他 handle 会 keep-alive；测试里退出快更友好）
  (firstRun as unknown as { unref?: () => void }).unref?.();
  (loop as unknown as { unref?: () => void }).unref?.();
  // 返回取消函数（测试 / 优雅关闭用）
  return () => {
    clearTimeout(firstRun);
    clearInterval(loop);
  };
}

/**
 * 一次性清理。导出以便单测直接调 / 外部 cron 调用。
 *
 * ⚠️ 所有涉及时间字符串的比较都要 `datetime()` 归一化：
 * - `created_at` 是 SQLite `datetime('now')` 产生（空格分隔，canonical 格式）
 * - `expires_at` 是 JS `toISOString()` 产生（T 分隔 + 毫秒 + Z）
 * - `cutoff` 是 JS `toISOString()` 产生（T 格式）
 *
 * 字符串直接比较 `created_at < cutoff` 时，由于 'T' (0x54) > 空格 (0x20)，
 * 当天后期写入的 created_at（空格格式）会被判小于 cutoff（T 格式）→ 误删
 * 未满保留期的数据。必须用 datetime() 把两种格式归一到同一 canonical 后再比。
 * Task 2 的 token expires_at bug 是同源问题，只是方向相反。
 */
export function sweepOnce(db: Database, retentionDays: number): void {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  db.query(
    'DELETE FROM sessions WHERE user_id IS NULL AND datetime(created_at) < datetime(?)',
  ).run(cutoff);
  db.query(
    'DELETE FROM bug_reports WHERE user_id IS NULL AND datetime(created_at) < datetime(?)',
  ).run(cutoff);
  db.query(`DELETE FROM auth_tokens WHERE datetime(expires_at) < datetime('now')`).run();
  // 邮件 / 公告：过期 7 天后物理删（cascade 删 user_mail_state）
  deleteExpiredMail(db, MAIL_RETENTION_DAYS_AFTER_EXPIRY);
  deleteExpiredAnnouncements(db, ANNOUNCEMENT_RETENTION_DAYS_AFTER_EXPIRY);
}
