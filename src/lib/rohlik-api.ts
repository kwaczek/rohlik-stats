/**
 * Rohlik.cz API Client (TypeScript port)
 *
 * Communicates with Rohlik's reverse-engineered API to fetch order history
 * and product categories. Uses session cookies for authentication.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.rohlik.cz';
const RATE_LIMIT_MS = 200;
const PAGE_SIZE = 50;

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
  Referer: 'https://www.rohlik.cz/',
  Origin: 'https://www.rohlik.cz',
};

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class InvalidCredentialsError extends Error {
  name = 'InvalidCredentialsError' as const;
}

export class RohlikAPIError extends Error {
  name = 'RohlikAPIError' as const;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  unitPrice: number;
  textualAmount: string;
}

export interface RawOrder {
  id: string;
  orderTime: string;
  priceComposition: { total: { amount: number } };
}

export interface ProductCategory {
  level: number;
  name: string;
}

export type ProgressCallback = (
  phase: string,
  current: number,
  total: number,
) => void;

export interface FetchAndProcessAllResult {
  orders: Array<RawOrder & { items: OrderItem[] }>;
  categories: Map<number, ProductCategory[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse Set-Cookie headers into "name=value" pairs suitable for the Cookie
 * request header. Strips attributes like Path, HttpOnly, Secure, etc.
 */
function parseCookies(setCookieHeaders: string[]): string[] {
  return setCookieHeaders.map((header) => {
    // The first segment before ";" is "name=value"
    return header.split(';')[0].trim();
  });
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

export class RohlikAPI {
  private email: string;
  private password: string;
  private cookies: string[] = [];

  constructor(email: string, password: string) {
    this.email = email;
    this.password = password;
  }

  // -----------------------------------------------------------------------
  // Internal fetch wrapper — attaches cookies and content-type
  // -----------------------------------------------------------------------

  private async request<T>(
    url: string,
    options: RequestInit = {},
  ): Promise<{ data: T; response: Response }> {
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.cookies.length > 0) {
      headers['Cookie'] = this.cookies.join('; ');
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    return { data: (await response.json()) as T, response };
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  async login(): Promise<{ userId: number; addressId: number }> {
    const url = `${BASE_URL}/services/frontend-service/login`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: this.email,
        password: this.password,
        name: '',
      }),
    });

    // Capture cookies from Set-Cookie headers
    const setCookieHeaders = response.headers.getSetCookie();
    if (setCookieHeaders.length > 0) {
      this.cookies = parseCookies(setCookieHeaders);
    }

    const body = (await response.json()) as {
      status: number;
      messages?: Array<{ content: string }>;
      data?: {
        user?: { id: number; name: string };
        address?: { id: number };
      };
    };

    if (body.status === 401) {
      throw new InvalidCredentialsError(
        body.messages?.[0]?.content ?? 'Invalid credentials',
      );
    }

    if (body.status !== 200) {
      throw new RohlikAPIError(
        body.messages?.[0]?.content ?? `Login failed with status ${body.status}`,
      );
    }

    return {
      userId: body.data?.user?.id ?? 0,
      addressId: body.data?.address?.id ?? 0,
    };
  }

  async logout(): Promise<void> {
    const url = `${BASE_URL}/services/frontend-service/logout`;
    try {
      await this.request(url, { method: 'POST' });
    } catch {
      // Fire and forget — ignore errors
    }
    this.cookies = [];
  }

  // -----------------------------------------------------------------------
  // Order fetching
  // -----------------------------------------------------------------------

  /**
   * Fetch a single page of delivered orders.
   */
  private async fetchDeliveredOrdersPage(
    offset: number,
    limit: number,
  ): Promise<RawOrder[]> {
    const url = `${BASE_URL}/api/v3/orders/delivered?offset=${offset}&limit=${limit}`;
    const { data } = await this.request<RawOrder[]>(url);
    return data;
  }

  /**
   * Paginate through ALL delivered orders.
   * Must be called after login().
   */
  async fetchAllDeliveredOrders(
    onProgress?: ProgressCallback,
  ): Promise<RawOrder[]> {
    const allOrders: RawOrder[] = [];
    let offset = 0;

    while (true) {
      const page = await this.fetchDeliveredOrdersPage(offset, PAGE_SIZE);
      if (!page || page.length === 0) break;

      allOrders.push(...page);
      onProgress?.('fetch_orders', allOrders.length, -1);

      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      await sleep(RATE_LIMIT_MS);
    }

    return allOrders;
  }

  /**
   * Fetch detail for a single order. Returns the list of items.
   * Must be called after login().
   */
  async getOrderDetail(orderId: string): Promise<OrderItem[] | null> {
    const url = `${BASE_URL}/api/v3/orders/${orderId}`;
    await sleep(RATE_LIMIT_MS);

    const { data } = await this.request<{
      items?: Array<{
        id: number;
        name: string;
        amount: number;
        priceComposition: {
          total: { amount: number };
          unit: { amount: number };
        };
        textualAmount: string;
      }>;
    }>(url);

    if (!data.items) return null;

    return data.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.amount,
      price: item.priceComposition.total.amount,
      unitPrice: item.priceComposition.unit.amount,
      textualAmount: item.textualAmount,
    }));
  }

  // -----------------------------------------------------------------------
  // Product info
  // -----------------------------------------------------------------------

  /**
   * Fetch category hierarchy for a product.
   * Returns null for 404 (product discontinued).
   */
  async getProductCategories(
    productId: number,
  ): Promise<ProductCategory[] | null> {
    const url = `${BASE_URL}/api/v1/products/${productId}/categories`;
    await sleep(RATE_LIMIT_MS);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.cookies.length > 0) {
      headers['Cookie'] = this.cookies.join('; ');
    }

    const response = await fetch(url, { headers });

    if (response.status === 404) {
      return null;
    }

    const data = (await response.json()) as {
      categories: ProductCategory[];
    };

    return data.categories ?? [];
  }

  // -----------------------------------------------------------------------
  // Orchestrator
  // -----------------------------------------------------------------------

  /**
   * Fetch and process all data in a single session:
   * 1. Login
   * 2. Paginate all delivered orders
   * 3. Fetch detail (items) for each order
   * 4. Collect unique product IDs
   * 5. Fetch categories for each product
   * 6. Logout
   */
  async fetchAndProcessAll(
    onProgress?: ProgressCallback,
  ): Promise<FetchAndProcessAllResult> {
    // 1. Login
    await this.login();

    try {
      // 2. Fetch all delivered orders (paginated)
      const rawOrders = await this.fetchAllDeliveredOrders(onProgress);
      onProgress?.('fetch_orders', rawOrders.length, rawOrders.length);

      // 3. Enrich each order with items
      const enrichedOrders: Array<RawOrder & { items: OrderItem[] }> = [];
      for (let i = 0; i < rawOrders.length; i++) {
        const order = rawOrders[i];
        onProgress?.('enrich_orders', i + 1, rawOrders.length);
        const items = await this.getOrderDetail(order.id);
        enrichedOrders.push({
          ...order,
          items: items ?? [],
        });
      }

      // 4. Collect unique product IDs
      const productIds = new Set<number>();
      for (const order of enrichedOrders) {
        for (const item of order.items) {
          productIds.add(item.id);
        }
      }

      // 5. Fetch categories for each product
      const categories = new Map<number, ProductCategory[]>();
      const productIdArray = Array.from(productIds);
      for (let i = 0; i < productIdArray.length; i++) {
        const pid = productIdArray[i];
        onProgress?.('fetch_categories', i + 1, productIdArray.length);
        const cats = await this.getProductCategories(pid);
        if (cats === null) {
          // Discontinued product
          categories.set(pid, [{ level: 1, name: 'Discontinued' }]);
        } else if (cats.length > 0) {
          categories.set(pid, cats);
        }
      }

      return { orders: enrichedOrders, categories };
    } finally {
      // 6. Always logout
      await this.logout();
    }
  }
}
