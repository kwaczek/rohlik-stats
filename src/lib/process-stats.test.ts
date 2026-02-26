import { describe, it, expect } from 'vitest';
import { processStats } from './process-stats';
import type { OrderItem } from './rohlik-api';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleOrders: Record<string, { date: string; amount: number; items: OrderItem[] }> = {
  'order-1': {
    date: '2025-01-15',
    amount: 500,
    items: [
      { id: 100, name: 'Mleko', quantity: 2, price: 60, unitPrice: 30, textualAmount: '1 l' },
      { id: 200, name: 'Chleb', quantity: 1, price: 40, unitPrice: 40, textualAmount: '500 g' },
    ],
  },
  'order-2': {
    date: '2025-02-10',
    amount: 300,
    items: [
      { id: 100, name: 'Mleko', quantity: 3, price: 90, unitPrice: 30, textualAmount: '1 l' },
    ],
  },
};

const sampleCategories: Record<string, { l1: string; l2: string; l3: string }> = {
  '100': { l1: 'Mlecne vyrobky', l2: 'Mleko', l3: 'Plnotucne' },
  '200': { l1: 'Pecivo', l2: 'Chleby', l3: '' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processStats', () => {
  const result = processStats(sampleOrders, sampleCategories);

  // =========================================================================
  // 1. Aggregate product stats
  // =========================================================================

  describe('aggregate product stats', () => {
    it('should aggregate Mleko across two orders: tq=5, ts=150, to=2, ap=30', () => {
      const mleko = result.p['100'];
      expect(mleko).toBeDefined();
      expect(mleko.n).toBe('Mleko');
      expect(mleko.tq).toBe(5);
      expect(mleko.ts).toBe(150);
      expect(mleko.to).toBe(2);
      expect(mleko.ap).toBe(30);
    });

    it('should aggregate Chleb from single order: tq=1, ts=40, to=1, ap=40', () => {
      const chleb = result.p['200'];
      expect(chleb).toBeDefined();
      expect(chleb.n).toBe('Chleb');
      expect(chleb.tq).toBe(1);
      expect(chleb.ts).toBe(40);
      expect(chleb.to).toBe(1);
      expect(chleb.ap).toBe(40);
    });
  });

  // =========================================================================
  // 2. Monthly history
  // =========================================================================

  describe('monthly history', () => {
    it('should have Mleko Jan=[2,60,1], Feb=[3,90,1]', () => {
      const mleko = result.p['100'];
      expect(mleko.h['2025-01']).toEqual([2, 60, 1]);
      expect(mleko.h['2025-02']).toEqual([3, 90, 1]);
    });

    it('should have Chleb Jan=[1,40,1] only', () => {
      const chleb = result.p['200'];
      expect(chleb.h['2025-01']).toEqual([1, 40, 1]);
      expect(chleb.h['2025-02']).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. Monthly orders (mo)
  // =========================================================================

  describe('monthly orders', () => {
    it('should have Jan=[1,500], Feb=[1,300]', () => {
      expect(result.mo['2025-01']).toEqual([1, 500]);
      expect(result.mo['2025-02']).toEqual([1, 300]);
    });
  });

  // =========================================================================
  // 4. Min/max prices
  // =========================================================================

  describe('min/max prices', () => {
    it('should track min and max unit prices for Mleko (both 30)', () => {
      const mleko = result.p['100'];
      expect(mleko.mp).toBe(30);
      expect(mleko.xp).toBe(30);
    });

    it('should track min and max unit prices for Chleb (both 40)', () => {
      const chleb = result.p['200'];
      expect(chleb.mp).toBe(40);
      expect(chleb.xp).toBe(40);
    });
  });

  // =========================================================================
  // 5. First/last dates
  // =========================================================================

  describe('first/last dates', () => {
    it('should have Mleko fd=2025-01, ld=2025-02', () => {
      const mleko = result.p['100'];
      expect(mleko.fd).toBe('2025-01');
      expect(mleko.ld).toBe('2025-02');
    });

    it('should have Chleb fd=2025-01, ld=2025-01', () => {
      const chleb = result.p['200'];
      expect(chleb.fd).toBe('2025-01');
      expect(chleb.ld).toBe('2025-01');
    });
  });

  // =========================================================================
  // 6. Products with no category → 'Uncategorized'
  // =========================================================================

  describe('uncategorized products', () => {
    it('should assign Uncategorized when product ID is not in categories', () => {
      const orders: Record<string, { date: string; amount: number; items: OrderItem[] }> = {
        'order-x': {
          date: '2025-03-01',
          amount: 100,
          items: [
            { id: 999, name: 'Mystery', quantity: 1, price: 100, unitPrice: 100, textualAmount: '1 ks' },
          ],
        },
      };

      const res = processStats(orders, {});
      const mystery = res.p['999'];
      expect(mystery.c0).toBe('Uncategorized');
      expect(mystery.c1).toBe('');
      expect(mystery.c2).toBe('');
    });
  });

  // =========================================================================
  // 7. Multiple items of same product in same order → 1 order count
  // =========================================================================

  describe('duplicate product in same order', () => {
    it('should count as 1 order even if product appears multiple times in the same order', () => {
      const orders: Record<string, { date: string; amount: number; items: OrderItem[] }> = {
        'order-dup': {
          date: '2025-04-01',
          amount: 200,
          items: [
            { id: 300, name: 'Jogurt', quantity: 2, price: 60, unitPrice: 30, textualAmount: '150 g' },
            { id: 300, name: 'Jogurt', quantity: 1, price: 35, unitPrice: 35, textualAmount: '150 g' },
          ],
        },
      };

      const res = processStats(orders, {});
      const jogurt = res.p['300'];

      // to should be 1 (one order), not 2
      expect(jogurt.to).toBe(1);

      // tq should be accumulated: 2 + 1 = 3
      expect(jogurt.tq).toBe(3);

      // ts should be accumulated: 60 + 35 = 95
      expect(jogurt.ts).toBe(95);

      // monthly h order count should also be 1
      expect(jogurt.h['2025-04'][2]).toBe(1);

      // min/max prices: 30 and 35
      expect(jogurt.mp).toBe(30);
      expect(jogurt.xp).toBe(35);
    });
  });

  // =========================================================================
  // 8. Category mapping
  // =========================================================================

  describe('category mapping', () => {
    it('should map category levels correctly', () => {
      const mleko = result.p['100'];
      expect(mleko.c0).toBe('Mlecne vyrobky');
      expect(mleko.c1).toBe('Mleko');
      expect(mleko.c2).toBe('Plnotucne');
    });

    it('should handle empty l3', () => {
      const chleb = result.p['200'];
      expect(chleb.c0).toBe('Pecivo');
      expect(chleb.c1).toBe('Chleby');
      expect(chleb.c2).toBe('');
    });
  });

  // =========================================================================
  // 9. Textual amount
  // =========================================================================

  describe('textual amount', () => {
    it('should preserve textual amount from order items', () => {
      expect(result.p['100'].ta).toBe('1 l');
      expect(result.p['200'].ta).toBe('500 g');
    });
  });

  // =========================================================================
  // 10. Edge case: empty orders
  // =========================================================================

  describe('edge cases', () => {
    it('should return empty stats for empty orders', () => {
      const res = processStats({}, {});
      expect(Object.keys(res.p)).toHaveLength(0);
      expect(Object.keys(res.mo)).toHaveLength(0);
    });

    it('should handle unitPrice fallback to price/quantity', () => {
      const orders: Record<string, { date: string; amount: number; items: OrderItem[] }> = {
        'order-f': {
          date: '2025-05-01',
          amount: 100,
          items: [
            { id: 400, name: 'Neco', quantity: 4, price: 100, unitPrice: 0, textualAmount: '1 kg' },
          ],
        },
      };

      const res = processStats(orders, {});
      // unitPrice=0 → fallback to price/quantity = 100/4 = 25
      expect(res.p['400'].mp).toBe(25);
      expect(res.p['400'].xp).toBe(25);
    });

    it('should round ts, ap, mp, xp to 2 decimals', () => {
      const orders: Record<string, { date: string; amount: number; items: OrderItem[] }> = {
        'order-r': {
          date: '2025-06-01',
          amount: 100,
          items: [
            { id: 500, name: 'Rounding', quantity: 3, price: 10.005, unitPrice: 3.335, textualAmount: '1 ks' },
          ],
        },
      };

      const res = processStats(orders, {});
      const p = res.p['500'];
      // ts should be rounded: 10.005 -> 10.01 (or 10 depending on IEEE)
      expect(p.ts).toBe(Math.round(10.005 * 100) / 100);
      // ap = ts / tq
      expect(p.ap).toBe(Math.round((10.005 / 3) * 100) / 100);
    });
  });
});
