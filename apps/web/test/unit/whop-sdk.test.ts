import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyUserTokenMock = vi.fn();
const whopConstructorMock = vi.fn(() => ({
  verifyUserToken: verifyUserTokenMock,
}));

async function loadModule() {
  vi.doMock('@whop/sdk', () => ({
    Whop: whopConstructorMock,
  }));
  vi.doUnmock('@/lib/whop-sdk');
  return import('@/lib/whop-sdk');
}

describe('whop-sdk authentication', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    verifyUserTokenMock.mockReset();
    whopConstructorMock.mockReset();
  });

  it('returns unauthenticated when no token is provided', async () => {
    const { getRequestContextSDK } = await loadModule();

    const result = await getRequestContextSDK({ headers: new Headers() });

    expect(verifyUserTokenMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      companyId: null,
      userId: null,
      isAuthenticated: false,
    });
  });

  it('returns unauthenticated when SDK verification fails', async () => {
    verifyUserTokenMock.mockResolvedValueOnce(null);
    const { getRequestContextSDK } = await loadModule();

    const headers = new Headers();
    headers.set('x-whop-user-token', 'token-abc');

    const result = await getRequestContextSDK({ headers });

    expect(verifyUserTokenMock).toHaveBeenCalledTimes(1);
    const firstCallHeaders = verifyUserTokenMock.mock.calls[0][0] as Headers;
    expect(firstCallHeaders.get('x-whop-user-token')).toBe('token-abc');
    expect(result.isAuthenticated).toBe(false);
  });

  it('returns authenticated context when SDK verification succeeds', async () => {
    verifyUserTokenMock.mockResolvedValueOnce({
      userId: 'user-1',
      companyId: 'company-1',
    });
    const { getRequestContextSDK } = await loadModule();

    const headers = new Headers();
    headers.set('authorization', 'Bearer good.token');

    const result = await getRequestContextSDK({ headers });

    expect(verifyUserTokenMock).toHaveBeenCalledTimes(1);
    const firstCallHeaders = verifyUserTokenMock.mock.calls[0][0] as Headers;
    expect(firstCallHeaders.get('x-whop-user-token')).toBe('good.token');
    expect(result).toEqual({
      companyId: 'company-1',
      userId: 'user-1',
      isAuthenticated: true,
    });
  });

  it('returns null companyId when token verified but companyId missing', async () => {
    verifyUserTokenMock.mockResolvedValueOnce({
      userId: 'user-1',
      // companyId is missing
    });
    const { getRequestContextSDK } = await loadModule();

    const headers = new Headers();
    headers.set('x-whop-user-token', 'valid-token-no-company');

    const result = await getRequestContextSDK({ headers });

    expect(verifyUserTokenMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      companyId: null,
      userId: 'user-1',
      isAuthenticated: true,
    });
  });

  it('returns unauthenticated when token verified but userId missing', async () => {
    verifyUserTokenMock.mockResolvedValueOnce({
      companyId: 'company-1',
      // userId is missing
    });
    const { getRequestContextSDK } = await loadModule();

    const headers = new Headers();
    headers.set('x-whop-user-token', 'valid-token-no-user');

    const result = await getRequestContextSDK({ headers });

    expect(verifyUserTokenMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      companyId: null,
      userId: null,
      isAuthenticated: false,
    });
  });

  it('never uses app_id as companyId fallback', async () => {
    verifyUserTokenMock.mockResolvedValueOnce({
      userId: 'user-1',
      app_id: 'app_should_not_be_used',
      // companyId and company_id are both missing
    });
    const { getRequestContextSDK } = await loadModule();

    const headers = new Headers();
    headers.set('x-whop-user-token', 'token-with-app-id');

    const result = await getRequestContextSDK({ headers });

    expect(result.companyId).toBeNull();
    expect(result.companyId).not.toBe('app_should_not_be_used');
  });

  it('verifyUserToken helper returns SDK result when token exists', async () => {
    const { verifyUserToken } = await loadModule();

    const nullResult = await verifyUserToken(new Headers());
    expect(nullResult).toBeNull();

    verifyUserTokenMock.mockResolvedValueOnce({
      userId: 'user-2',
      company_id: 'company-2',
    });

    const headers = new Headers();
    headers.set('x-whop-user-token', 'another-token');

    const result = await verifyUserToken(headers);

    expect(verifyUserTokenMock).toHaveBeenCalledTimes(1);
    const firstCallHeaders = verifyUserTokenMock.mock.calls[0][0] as Headers;
    expect(firstCallHeaders.get('x-whop-user-token')).toBe('another-token');
    expect(result).toEqual({
      userId: 'user-2',
      company_id: 'company-2',
    });
  });
});



