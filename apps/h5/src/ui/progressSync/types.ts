/**
 * SyncableProgress 的 single source of truth 在 @immune-td/shared 包（packages/shared/）。
 * 前端 type-only import，不引入 Zod runtime 体积。
 *
 * 加字段流程：
 * 1. 改 packages/shared/src/progress-schema.ts 的 Zod schema
 * 2. 同步更新 metaStore 的同步字段 + extract / merge / INITIAL_PROGRESS
 * 3. 若语义变化，bump CURRENT_PAYLOAD_VERSION
 */
export type { SyncableProgress } from '@immune-td/shared';

export const CURRENT_PAYLOAD_VERSION = 1;
