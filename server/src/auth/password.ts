import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id 哈希密码。用 `@node-rs/argon2` 默认参数：
 * `m≈19456 KiB, t=2, p=1`（OWASP 推荐区间，单次 hash ≈ 50ms）。
 * 如果部署机器内存紧张（< 64MB 可用），显式传 `{ memoryCost: 8192 }` 降一档。
 */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** 校验密码；hash 格式非法 / 空串等 → 当作密码错 */
export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
}
