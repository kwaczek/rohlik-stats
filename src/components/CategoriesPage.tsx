'use client';

import { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { FilteredData } from '@/lib/stats-types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
}

function fmtD(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
}

interface Props {
  filteredData: FilteredData;
  onShowDetail: (pid: string) => void;
  initialDrill?: string[];
}

const CAT_KEYS = ['c0', 'c1', 'c2'] as const;

export default function CategoriesPage({ filteredData, onShowDetail, initialDrill }: Props) {
  const [catDrill, setCatDrill] = useState<string[]>(initialDrill ?? []);
  const level = catDrill.length;

  const matching = useMemo(() => {
    // Compare category values, treating empty string as "Ostatni"
    const catVal = (v: string) => v || 'Ostatni';
    return Object.entries(filteredData).filter(([, p]) => {
      if (level >= 1 && catVal(p.c0) !== catDrill[0]) return false;
      if (level >= 2 && catVal(p.c1) !== catDrill[1]) return false;
      if (level >= 3 && catVal(p.c2) !== catDrill[2]) return false;
      return true;
    });
  }, [filteredData, catDrill, level]);

  const totalSpend = useMemo(() => matching.reduce((s, [, p]) => s + p.ts, 0), [matching]);
  const totalQty = useMemo(() => matching.reduce((s, [, p]) => s + p.tq, 0), [matching]);
  const totalOrders = useMemo(() => matching.reduce((s, [, p]) => s + p.to, 0), [matching]);

  // Monthly trend data for current category drill
  const monthlyData = useMemo(() => {
    const md: Record<string, number> = {};
    matching.forEach(([, p]) => {
      for (const [m, vals] of Object.entries(p.h)) {
        md[m] = (md[m] || 0) + vals[1];
      }
    });
    return md;
  }, [matching]);

  const sortedMonths = useMemo(() => Object.keys(monthlyData).sort(), [monthlyData]);
  const showTrend = level > 0 && sortedMonths.length > 1;

  const trendChartData = useMemo(() => ({
    labels: sortedMonths,
    datasets: [{
      data: sortedMonths.map((m) => monthlyData[m]),
      borderColor: '#4ade80',
      backgroundColor: 'rgba(74,222,128,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
    }],
  }), [sortedMonths, monthlyData]);

  const trendChartOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: '#8b92a5' as const, font: { size: 10 }, maxRotation: 45 },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: '#8b92a5' as const,
          callback: (v: string | number) => fmt(Number(v)),
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  }), []);

  // Sub-categories at current level
  const catKey = level < 3 ? CAT_KEYS[level] : null;

  const subcategories = useMemo(() => {
    if (!catKey) return [];
    const subs: Record<string, { spend: number; qty: number; orders: number; count: number }> = {};
    matching.forEach(([, p]) => {
      const key = p[catKey] || 'Ostatni';
      if (!subs[key]) subs[key] = { spend: 0, qty: 0, orders: 0, count: 0 };
      subs[key].spend += p.ts;
      subs[key].qty += p.tq;
      subs[key].orders += p.to;
      subs[key].count++;
    });
    return Object.entries(subs).sort((a, b) => b[1].spend - a[1].spend);
  }, [matching, catKey]);

  const maxSpend = subcategories.length > 0 ? subcategories[0][1].spend : 1;

  // Products table at level 3
  const sortedProducts = useMemo(() => {
    if (level < 3) return [];
    return [...matching].sort((a, b) => b[1].ts - a[1].ts);
  }, [matching, level]);

  const handleDrillDown = (name: string) => {
    setCatDrill((prev) => [...prev, name]);
  };

  const handleBreadcrumb = (toLevel: number) => {
    setCatDrill((prev) => prev.slice(0, toLevel));
  };

  const stats = [
    { l: 'Utrata', v: fmt(totalSpend) + ' Kc' },
    { l: 'Polozek koupeno', v: fmt(totalQty) },
    { l: 'Nakupu', v: fmt(totalOrders) },
    { l: 'Unikatnich produktu', v: fmt(matching.length) },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <a onClick={() => handleBreadcrumb(0)}>Kategorie</a>
        {catDrill.map((c, i) => (
          <span key={i}>
            <span> &rsaquo; </span>
            <a onClick={() => handleBreadcrumb(i + 1)}>{c}</a>
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="stats-row">
        {stats.map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-label">{s.l}</div>
            <div className="stat-value">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      {showTrend && (
        <div className="chart-wrap">
          <Line data={trendChartData} options={trendChartOptions} />
        </div>
      )}

      {/* Sub-category grid (levels 0-2) */}
      {level < 3 && catKey && (
        <div className="cat-grid">
          {subcategories.map(([name, s]) => (
            <div
              key={name}
              className="cat-card"
              onClick={() => handleDrillDown(name)}
            >
              <div className="cat-card-name">{name}</div>
              <div className="cat-card-stats">
                <span>{fmt(s.spend)} Kc</span>
                <span>{s.count} produktu</span>
                <span>{fmt(s.qty)}&times; koupeno</span>
              </div>
              <div className="cat-card-bar">
                <div
                  className="cat-card-bar-fill"
                  style={{ width: `${(s.spend / maxSpend * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Products table at level 3 */}
      {level >= 3 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produkt</th>
                <th className="money">Celkem Kc</th>
                <th className="num">Mnozstvi</th>
                <th className="num">Objednavky</th>
                <th className="money">Prum. cena</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map(([pid, p]) => (
                <tr
                  key={pid}
                  onClick={() => onShowDetail(pid)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="product-name">
                    {p.n}<br />
                    <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{p.ta}</span>
                  </td>
                  <td className="money">{fmt(p.ts)}</td>
                  <td className="num">{p.tq}</td>
                  <td className="num">{p.to}</td>
                  <td className="money">{fmtD(p.ap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
