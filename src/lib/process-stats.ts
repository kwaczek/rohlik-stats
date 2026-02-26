/**
 * Data Processing Pipeline
 *
 * Transforms raw order data + product categories into a compact, dashboard-ready
 * StatsData structure. The output is stored in Vercel KV and consumed by the
 * frontend dashboard components.
 */

import type { OrderItem } from './rohlik-api';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ProductStats {
  n: string;       // product name
  ta: string;      // textual amount (e.g., "500 g")
  c0: string;      // category L1
  c1: string;      // category L2
  c2: string;      // category L3
  ts: number;      // total spend (rounded to 2 decimals)
  tq: number;      // total quantity bought
  to: number;      // total number of orders containing this product
  ap: number;      // average price per unit (ts/tq, rounded to 2 decimals)
  mp: number;      // min unit price seen
  xp: number;      // max unit price seen
  fd: string;      // first month (YYYY-MM)
  ld: string;      // last month (YYYY-MM)
  h: Record<string, [number, number, number]>; // month -> [quantity, spend, orderCount]
}

export interface StatsData {
  p: Record<string, ProductStats>;  // key is product ID
  mo: Record<string, [number, number]>; // month -> [orderCount, totalOrderSpend]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round a number to 2 decimal places. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Extract YYYY-MM from a YYYY-MM-DD date string. */
function toMonth(date: string): string {
  return date.slice(0, 7);
}

/**
 * Determine the effective unit price for an item.
 * Uses unitPrice if positive, otherwise falls back to price / quantity.
 */
function effectiveUnitPrice(item: OrderItem): number {
  if (item.unitPrice > 0) return item.unitPrice;
  if (item.quantity > 0) return item.price / item.quantity;
  return 0;
}

// ---------------------------------------------------------------------------
// Default category for products not found in the categories map
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORY = { l1: 'Uncategorized', l2: '', l3: '' };

// ---------------------------------------------------------------------------
// Main processing function
// ---------------------------------------------------------------------------

export function processStats(
  orders: Record<string, { date: string; amount: number; items: OrderItem[] }>,
  categories: Record<string, { l1: string; l2: string; l3: string }>,
): StatsData {
  const p: Record<string, ProductStats> = {};
  const mo: Record<string, [number, number]> = {};

  for (const order of Object.values(orders)) {
    const month = toMonth(order.date);

    // -- Update monthly order stats ------------------------------------------
    if (!mo[month]) {
      mo[month] = [0, 0];
    }
    mo[month][0] += 1;
    mo[month][1] += order.amount;

    // Track which products we've already counted for this order (for `to` and
    // per-month order count in `h`), so that duplicate product lines in the
    // same order are only counted once.
    const seenProductsInOrder = new Set<string>();

    // -- Process each item in the order --------------------------------------
    for (const item of order.items) {
      const pid = String(item.id);
      const cat = categories[pid] ?? DEFAULT_CATEGORY;
      const unitPrice = effectiveUnitPrice(item);

      if (!p[pid]) {
        // Initialise a new product entry
        p[pid] = {
          n: item.name,
          ta: item.textualAmount,
          c0: cat.l1,
          c1: cat.l2,
          c2: cat.l3,
          ts: 0,
          tq: 0,
          to: 0,
          ap: 0,
          mp: Infinity,
          xp: -Infinity,
          fd: month,
          ld: month,
          h: {},
        };
      }

      const prod = p[pid];

      // Accumulate totals
      prod.tq += item.quantity;
      prod.ts += item.price;

      // Track min/max unit price
      if (unitPrice < prod.mp) prod.mp = unitPrice;
      if (unitPrice > prod.xp) prod.xp = unitPrice;

      // Update first/last month
      if (month < prod.fd) prod.fd = month;
      if (month > prod.ld) prod.ld = month;

      // Monthly history
      if (!prod.h[month]) {
        prod.h[month] = [0, 0, 0];
      }
      prod.h[month][0] += item.quantity;
      prod.h[month][1] += item.price;

      // Once-per-order counters
      if (!seenProductsInOrder.has(pid)) {
        seenProductsInOrder.add(pid);
        prod.to += 1;
        prod.h[month][2] += 1;
      }
    }
  }

  // -- Post-processing: rounding & edge cases --------------------------------
  for (const prod of Object.values(p)) {
    prod.ts = r2(prod.ts);
    prod.ap = prod.tq > 0 ? r2(prod.ts / prod.tq) : 0;

    // Handle Infinity edge cases (no prices seen)
    if (!isFinite(prod.mp)) prod.mp = 0;
    if (!isFinite(prod.xp)) prod.xp = 0;

    prod.mp = r2(prod.mp);
    prod.xp = r2(prod.xp);

    // Round monthly spend values
    for (const month of Object.keys(prod.h)) {
      prod.h[month][1] = r2(prod.h[month][1]);
    }
  }

  return { p, mo };
}
