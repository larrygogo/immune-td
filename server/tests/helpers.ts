import type { AuthRouterOptions } from '../src/auth/handlers';
import type { Config } from '../src/config';
import { createApp } from '../src/index';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: ':memory:',
    bindHost: '127.0.0.1',
    bindPort: 0,
    corsAllowedOrigins: ['http://localhost:5173'],
    tokenTtlDays: 30,
    anonRetentionDays: 30,
    bodyLimitKb: 500,
    initialAdminUsername: null,
    initialAdminPassword: null,
    logLevel: 'error',
    wechatAppId: null,
    wechatAppSecret: null,
    ...overrides,
  };
}

export function createTestApp(
  overrides: Partial<Config> = {},
  authOptions: AuthRouterOptions = {},
) {
  return createApp(testConfig(overrides), { authOptions });
}
