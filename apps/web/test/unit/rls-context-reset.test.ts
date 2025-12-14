import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockPool() {
  const queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const releaseMock = vi.fn();
  const mockClient = {
    query: queryMock,
    release: releaseMock,
  } as any;

  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    on: vi.fn(),
    end: vi.fn(),
  } as any;

  return { mockPool, mockClient, queryMock, releaseMock };
}

describe('sqlWithRLS.transaction context reset', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('resets company context after a successful transaction', async () => {
    const { mockPool, mockClient, queryMock } = createMockPool();

    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    vi.doMock('pg', () => ({ Pool: vi.fn(() => mockPool), PoolClient: class {} }));

    const dbRls = await import('@/lib/db-rls');
    await dbRls.initDbWithRLS();
    // initDbWithRLS performs a connection test; reset call history to assert only transaction behavior
    mockPool.connect.mockClear();
    queryMock.mockClear();
    mockClient.release.mockClear();

    await dbRls.sqlWithRLS.transaction(
      async (client) => {
        await client.query('SELECT 1');
      },
      { companyId: 'company-123', enforceCompanyContext: false }
    );

    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls.map((call) => call[0])).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'SELECT 1',
      'COMMIT',
      'RESET app.current_company_id',
    ]);
  });

  it('resets company context even when the transaction throws', async () => {
    const { mockPool, mockClient, queryMock } = createMockPool();

    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    vi.doMock('pg', () => ({ Pool: vi.fn(() => mockPool), PoolClient: class {} }));

    const dbRls = await import('@/lib/db-rls');
    await dbRls.initDbWithRLS();
    // initDbWithRLS performs a connection test; reset call history to assert only transaction behavior
    mockPool.connect.mockClear();
    queryMock.mockClear();
    mockClient.release.mockClear();

    await expect(
      dbRls.sqlWithRLS.transaction(
        async (client) => {
          await client.query('SELECT during_tx');
          throw new Error('boom');
        },
        { companyId: 'company-123', enforceCompanyContext: false }
      )
    ).rejects.toThrow('boom');

    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls.map((call) => call[0])).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'SELECT during_tx',
      'ROLLBACK',
      'RESET app.current_company_id',
    ]);
  });
});



