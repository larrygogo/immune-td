import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@ui/apiClient';

describe('apiClient', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('200 + JSON body：res.json() 取到原对象', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })),
    );
    const res = await apiFetch('/api/x');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it('204 No Content：res.ok=true，body 为空，不抛错（regression）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const res = await apiFetch('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(204);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe('');
  });

  it('304 Not Modified：res.status=304，不抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 304 })),
    );
    const res = await apiFetch('/api/x');
    expect(res.status).toBe(304);
  });

  it('500 错误：状态保留，res.ok=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 500 })),
    );
    const res = await apiFetch('/api/x');
    expect(res.status).toBe(500);
    expect(res.ok).toBe(false);
    expect(await res.text()).toBe('server error');
  });

  it('headers 自动带 X-Device-Id', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/x');
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const init = call[1];
    const headers = new Headers(init.headers);
    expect(headers.get('X-Device-Id')).toBeTruthy();
  });

  it('body=string + 自动加 Content-Type: application/json', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/x', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const init = call[1];
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
});
