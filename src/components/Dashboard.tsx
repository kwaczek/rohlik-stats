'use client';

import { useState, useMemo, useCallback } from 'react';
import type { StatsData, FilteredData, FilteredMonthly, ProductStats } from '@/lib/stats-types';
import OverviewPage from './OverviewPage';
import CategoriesPage from './CategoriesPage';
import ProductsPage from './ProductsPage';
import ProductDetail from './ProductDetail';

type Tab = 'overview' | 'categories' | 'products';

interface Props {
  data: StatsData;
}

export default function Dashboard({ data }: Props) {
  const { p: products, mo: monthlyOrders } = data;

  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [activeQuick, setActiveQuick] = useState<string | null>(null);
  const [detailPid, setDetailPid] = useState<string | null>(null);
  const [prevTab, setPrevTab] = useState<Tab>('products');

  const filteredData: FilteredData = useMemo(() => {
    const filtered: FilteredData = {};
    for (const [pid, p] of Object.entries(products)) {
      let tq = 0, ts = 0, to = 0;
      const h: Record<string, [number, number, number]> = {};
      let fd: string | null = null;
      let ld: string | null = null;
      for (const [m, vals] of Object.entries(p.h)) {
        if (dateFrom && m < dateFrom.slice(0, 7)) continue;
        if (dateTo && m > dateTo.slice(0, 7)) continue;
        tq += vals[0];
        ts += vals[1];
        to += vals[2];
        h[m] = vals;
        if (!fd || m < fd) fd = m;
        if (!ld || m > ld) ld = m;
      }
      if (tq > 0) {
        filtered[pid] = { ...p, tq, ts: Math.round(ts * 100) / 100, to, h, fd: fd!, ld: ld! };
      }
    }
    return filtered;
  }, [products, dateFrom, dateTo]);

  const filteredMonthly: FilteredMonthly = useMemo(() => {
    const fm: FilteredMonthly = {};
    for (const [m, vals] of Object.entries(monthlyOrders)) {
      if (dateFrom && m < dateFrom.slice(0, 7)) continue;
      if (dateTo && m > dateTo.slice(0, 7)) continue;
      fm[m] = vals;
    }
    return fm;
  }, [monthlyOrders, dateFrom, dateTo]);

  const applyFilter = useCallback((from: string | null, to: string | null) => {
    setDateFrom(from);
    setDateTo(to);
    setDateFromInput(from || '');
    setDateToInput(to || '');
  }, []);

  const handleQuickRange = useCallback((range: string) => {
    setActiveQuick(range);
    if (range === 'all') {
      applyFilter(null, null);
      return;
    }
    const now = new Date();
    const toStr = now.toISOString().slice(0, 10);
    let from: Date;
    if (range === '1y') from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    else if (range === '6m') from = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    else from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    applyFilter(from.toISOString().slice(0, 10), toStr);
  }, [applyFilter]);

  const handleApplyFilter = useCallback(() => {
    setActiveQuick(null);
    setDateFrom(dateFromInput || null);
    setDateTo(dateToInput || null);
  }, [dateFromInput, dateToInput]);

  const handleMonthClick = useCallback((month: string) => {
    const from = month + '-01';
    const d = new Date(month + '-01');
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    const to = d.toISOString().slice(0, 10);
    setActiveQuick(null);
    applyFilter(from, to);
  }, [applyFilter]);

  const showDetail = useCallback((pid: string) => {
    setPrevTab(activeTab);
    setDetailPid(pid);
  }, [activeTab]);

  const goBackFromDetail = useCallback(() => {
    setDetailPid(null);
  }, []);

  const [categoryDrill, setCategoryDrill] = useState<string[] | undefined>(undefined);

  const handleTabSwitch = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setDetailPid(null);
    if (tab !== 'categories') setCategoryDrill(undefined);
  }, []);

  const handleCategoryClick = useCallback((categoryName: string) => {
    setCategoryDrill([categoryName]);
    setActiveTab('categories');
    setDetailPid(null);
  }, []);

  // When showing product detail
  if (detailPid) {
    const product = products[detailPid];
    const filtered = filteredData[detailPid] || product;
    return (
      <>
        <div className="header">
          <h1>Rohlik<span>.cz</span> Stats</h1>
          <div className="date-filters">
            {(['all', '1y', '6m', '3m'] as const).map((r) => (
              <button
                key={r}
                className={`quick-btn${activeQuick === r ? ' active' : ''}`}
                onClick={() => handleQuickRange(r)}
              >
                {r === 'all' ? 'Vse' : r === '1y' ? '1 rok' : r === '6m' ? '6 mes' : '3 mes'}
              </button>
            ))}
            <label>Od</label>
            <input
              type="date"
              value={dateFromInput}
              onChange={(e) => setDateFromInput(e.target.value)}
            />
            <label>Do</label>
            <input
              type="date"
              value={dateToInput}
              onChange={(e) => setDateToInput(e.target.value)}
            />
            <button
              className="quick-btn"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              onClick={handleApplyFilter}
            >
              Filtrovat
            </button>
          </div>
        </div>
        <ProductDetail
          product={product}
          filtered={filtered}
          onBack={goBackFromDetail}
        />
      </>
    );
  }

  return (
    <>
      <div className="header">
        <h1>Rohlik<span>.cz</span> Stats</h1>
        <div className="date-filters">
          {(['all', '1y', '6m', '3m'] as const).map((r) => (
            <button
              key={r}
              className={`quick-btn${activeQuick === r ? ' active' : ''}`}
              onClick={() => handleQuickRange(r)}
            >
              {r === 'all' ? 'Vse' : r === '1y' ? '1 rok' : r === '6m' ? '6 mes' : '3 mes'}
            </button>
          ))}
          <label>Od</label>
          <input
            type="date"
            value={dateFromInput}
            onChange={(e) => setDateFromInput(e.target.value)}
          />
          <label>Do</label>
          <input
            type="date"
            value={dateToInput}
            onChange={(e) => setDateToInput(e.target.value)}
          />
          <button
            className="quick-btn"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
            onClick={handleApplyFilter}
          >
            Filtrovat
          </button>
        </div>
      </div>

      <div className="tabs">
        {([
          ['overview', 'Prehled'],
          ['categories', 'Kategorie'],
          ['products', 'Produkty'],
        ] as const).map(([key, label]) => (
          <div
            key={key}
            className={`tab${activeTab === key ? ' active' : ''}`}
            onClick={() => handleTabSwitch(key as Tab)}
          >
            {label}
          </div>
        ))}
      </div>

      {activeTab === 'overview' && (
        <OverviewPage
          filteredData={filteredData}
          filteredMonthly={filteredMonthly}
          onShowDetail={showDetail}
          onMonthClick={handleMonthClick}
          onCategoryClick={handleCategoryClick}
        />
      )}
      {activeTab === 'categories' && (
        <CategoriesPage
          filteredData={filteredData}
          onShowDetail={showDetail}
          key={categoryDrill?.join('/') ?? 'default'}
          initialDrill={categoryDrill}
        />
      )}
      {activeTab === 'products' && (
        <ProductsPage
          filteredData={filteredData}
          onShowDetail={showDetail}
        />
      )}
    </>
  );
}
