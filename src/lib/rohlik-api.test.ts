import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RohlikAPI,
  InvalidCredentialsError,
  RohlikAPIError,
  type OrderItem,
  type RawOrder,
  type ProductCategory,
} from './rohlik-api';

// ---------------------------------------------------------------------------
// Helpers to build mock Response objects
// ---------------------------------------------------------------------------

function mockHeaders(cookies: string[] = []): Headers {
  const headers = new Headers();
  // We can't mock getSetCookie on real Headers easily, so we create a proxy
  return {
    ...headers,
    get: (name: string) => {
      if (name.toLowerCase() === 'content-type') return 'application/json';
      return null;
    },
    getSetCookie: () => cookies,
  } as unknown as Headers;
}

function jsonResponse(
  body: unknown,
  status = 200,
  cookies: string[] = [],
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: mockHeaders(cookies),
    json: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RohlikAPI', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    // Disable real timers/sleep in tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Helper: advance all pending timers (for sleep calls inside the API)
  async function flushTimers() {
    await vi.runAllTimersAsync();
  }

  // =========================================================================
  // login
  // =========================================================================

  describe('login', () => {
    it('should login successfully and capture cookies', async () => {
      const cookies = [
        'session=abc123; Path=/; HttpOnly',
        'token=xyz789; Path=/',
      ];
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(
          {
            status: 200,
            data: {
              user: { id: 42, name: 'Test User' },
              address: { id: 99 },
            },
          },
          200,
          cookies,
        ),
      );

      const api = new RohlikAPI('test@example.com', 'password123');
      const result = await api.login();

      // Verify correct URL and body
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://www.rohlik.cz/services/frontend-service/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
            name: '',
          }),
        }),
      );

      // Verify return value
      expect(result.userId).toBe(42);
      expect(result.addressId).toBe(99);

      // Verify cookies are sent on subsequent requests by making a dummy GET
      fetchSpy.mockResolvedValueOnce(jsonResponse([]));
      const promise = api.fetchAllDeliveredOrders();
      await flushTimers();
      await promise;

      // The second call (GET delivered orders) should include cookies
      const secondCallArgs = fetchSpy.mock.calls[1];
      expect(secondCallArgs[1]?.headers).toBeDefined();
      const sentCookieHeader = (secondCallArgs[1]?.headers as Record<string, string>)['Cookie'];
      expect(sentCookieHeader).toContain('session=abc123');
      expect(sentCookieHeader).toContain('token=xyz789');
    });

    it('should throw InvalidCredentialsError on 401', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          status: 401,
          messages: [{ content: 'Invalid email or password' }],
        }),
      );

      const api = new RohlikAPI('bad@example.com', 'wrongpass');
      await expect(api.login()).rejects.toThrow(InvalidCredentialsError);
    });

    it('should throw RohlikAPIError on other non-200 status', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          status: 500,
          messages: [{ content: 'Server error' }],
        }),
      );

      const api = new RohlikAPI('test@example.com', 'pass');
      await expect(api.login()).rejects.toThrow(RohlikAPIError);
    });
  });

  // =========================================================================
  // fetchAllDeliveredOrders (pagination)
  // =========================================================================

  describe('fetchAllDeliveredOrders', () => {
    it('should paginate through multiple pages until a short page', async () => {
      const api = new RohlikAPI('test@example.com', 'pass');

      // Build 50 orders for page 1 and 10 for page 2
      const page1: RawOrder[] = Array.from({ length: 50 }, (_, i) => ({
        id: String(i + 1),
        orderTime: '2024-01-01T00:00:00Z',
        priceComposition: { total: { amount: 100 + i } },
      }));

      const page2: RawOrder[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(51 + i),
        orderTime: '2024-02-01T00:00:00Z',
        priceComposition: { total: { amount: 200 + i } },
      }));

      // Mock login
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(
          {
            status: 200,
            data: { user: { id: 1, name: 'U' }, address: { id: 1 } },
          },
          200,
          ['session=s; Path=/'],
        ),
      );

      // Login first to set up cookies
      await api.login();

      // Page 1
      fetchSpy.mockResolvedValueOnce(jsonResponse(page1));
      // Page 2 (short = last page)
      fetchSpy.mockResolvedValueOnce(jsonResponse(page2));

      const promise = api.fetchAllDeliveredOrders();
      await flushTimers();
      const orders = await promise;

      expect(orders).toHaveLength(60);
      expect(orders[0].id).toBe('1');
      expect(orders[59].id).toBe('60');

      // Check pagination URLs (call 0 = login, call 1 = page 1, call 2 = page 2)
      const urls = fetchSpy.mock.calls.map((c: unknown[]) => c[0]);
      expect(urls[1]).toBe(
        'https://www.rohlik.cz/api/v3/orders/delivered?offset=0&limit=50',
      );
      expect(urls[2]).toBe(
        'https://www.rohlik.cz/api/v3/orders/delivered?offset=50&limit=50',
      );
    });
  });

  // =========================================================================
  // getOrderDetail
  // =========================================================================

  describe('getOrderDetail', () => {
    it('should extract items with correct field mapping', async () => {
      const api = new RohlikAPI('test@example.com', 'pass');

      // Login first to set cookies
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(
          {
            status: 200,
            data: { user: { id: 1, name: 'U' }, address: { id: 1 } },
          },
          200,
          ['session=s; Path=/'],
        ),
      );
      await api.login();

      // Mock order detail response
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 1001,
              name: 'Mleko',
              amount: 3,
              priceComposition: {
                total: { amount: 75.9 },
                unit: { amount: 25.3 },
              },
              textualAmount: '3 ks',
            },
            {
              id: 1002,
              name: 'Chleba',
              amount: 1,
              priceComposition: {
                total: { amount: 42.0 },
                unit: { amount: 42.0 },
              },
              textualAmount: '1 ks',
            },
          ],
        }),
      );

      const promise = api.getOrderDetail('order-123');
      await flushTimers();
      const items = await promise;

      expect(items).toHaveLength(2);

      expect(items![0]).toEqual({
        id: 1001,
        name: 'Mleko',
        quantity: 3,
        price: 75.9,
        unitPrice: 25.3,
        textualAmount: '3 ks',
      });

      expect(items![1]).toEqual({
        id: 1002,
        name: 'Chleba',
        quantity: 1,
        price: 42.0,
        unitPrice: 42.0,
        textualAmount: '1 ks',
      });

      // Verify correct URL
      const detailCall = fetchSpy.mock.calls[1];
      expect(detailCall[0]).toBe('https://www.rohlik.cz/api/v3/orders/order-123');
    });
  });

  // =========================================================================
  // getProductCategories
  // =========================================================================

  describe('getProductCategories', () => {
    it('should return categories for a valid product', async () => {
      const api = new RohlikAPI('test@example.com', 'pass');

      // Login
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(
          {
            status: 200,
            data: { user: { id: 1, name: 'U' }, address: { id: 1 } },
          },
          200,
          ['session=s; Path=/'],
        ),
      );
      await api.login();

      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          categories: [
            { level: 1, name: 'Potraviny' },
            { level: 2, name: 'Mlecne vyrobky' },
          ],
        }),
      );

      const promise = api.getProductCategories(12345);
      await flushTimers();
      const cats = await promise;

      expect(cats).toEqual([
        { level: 1, name: 'Potraviny' },
        { level: 2, name: 'Mlecne vyrobky' },
      ]);
    });

    it('should return null for discontinued product (404)', async () => {
      const api = new RohlikAPI('test@example.com', 'pass');

      // Login
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(
          {
            status: 200,
            data: { user: { id: 1, name: 'U' }, address: { id: 1 } },
          },
          200,
          ['session=s; Path=/'],
        ),
      );
      await api.login();

      fetchSpy.mockResolvedValueOnce(jsonResponse(null, 404));

      const promise = api.getProductCategories(99999);
      await flushTimers();
      const cats = await promise;

      expect(cats).toBeNull();
    });
  });

  // =========================================================================
  // logout
  // =========================================================================

  describe('logout', () => {
    it('should clear cookies after logout', async () => {
      const api = new RohlikAPI('test@example.com', 'pass');

      // Login
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(
          {
            status: 200,
            data: { user: { id: 1, name: 'U' }, address: { id: 1 } },
          },
          200,
          ['session=abc; Path=/'],
        ),
      );
      await api.login();

      // Logout (fire and forget)
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 200 }));
      await api.logout();

      // After logout, cookies should be cleared
      // Next fetch should NOT have Cookie header
      fetchSpy.mockResolvedValueOnce(
        jsonResponse(
          {
            status: 200,
            data: { user: { id: 1, name: 'U' }, address: { id: 1 } },
          },
          200,
          ['session=new; Path=/'],
        ),
      );
      await api.login();

      // The login call after logout should not carry old cookies
      const loginAfterLogout = fetchSpy.mock.calls[2]; // 0=login, 1=logout, 2=re-login
      const cookieHeader = (loginAfterLogout[1]?.headers as Record<string, string>)?.['Cookie'];
      expect(cookieHeader).toBeUndefined();
    });
  });
});
