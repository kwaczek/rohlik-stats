export interface ProductStats {
  n: string;       // name
  ta: string;      // textual amount
  c0: string;      // category L1
  c1: string;      // category L2
  c2: string;      // category L3
  ts: number;      // total spend
  tq: number;      // total quantity
  to: number;      // total orders
  ap: number;      // avg price per unit
  mp: number;      // min unit price
  xp: number;      // max unit price
  fd: string;      // first month
  ld: string;      // last month
  h: Record<string, [number, number, number]>; // month -> [qty, spend, orderCount]
}

export interface StatsData {
  p: Record<string, ProductStats>;
  mo: Record<string, [number, number]>; // month -> [orderCount, totalSpend]
}

/** Filtered product — same shape but aggregates may differ from original */
export type FilteredProduct = ProductStats;

export type FilteredData = Record<string, FilteredProduct>;
export type FilteredMonthly = Record<string, [number, number]>;
