'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { FilteredData, FilteredMonthly } from '@/lib/stats-types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const COLORS = [
  '#4ade80', '#3b82f6', '#f59e0b', '#ec4899', '#a78bfa',
  '#ef4444', '#06b6d4', '#f97316', '#8b5cf6', '#14b8a6',
  '#e879f9', '#facc15', '#fb923c', '#34d399', '#60a5fa',
];

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
}

interface Props {
  filteredData: FilteredData;
  filteredMonthly: FilteredMonthly;
  onShowDetail: (pid: string) => void;
  onMonthClick: (month: string) => void;
  onCategoryClick?: (categoryName: string) => void;
}

export default function OverviewPage({ filteredData, filteredMonthly, onShowDetail, onMonthClick, onCategoryClick }: Props) {
  const totalSpend = useMemo(
    () => Object.values(filteredMonthly).reduce((s, v) => s + v[1], 0),
    [filteredMonthly]
  );
  const totalOrders = useMemo(
    () => Object.values(filteredMonthly).reduce((s, v) => s + v[0], 0),
    [filteredMonthly]
  );
  const uniqueProducts = Object.keys(filteredData).length;
  const months = Object.keys(filteredMonthly).length;
  const avgOrder = totalOrders ? totalSpend / totalOrders : 0;
  const avgMonthly = months ? totalSpend / months : 0;

  const sortedMonths = useMemo(
    () => Object.keys(filteredMonthly).sort(),
    [filteredMonthly]
  );

  const monthlyChartData = useMemo(() => ({
    labels: sortedMonths,
    datasets: [{
      data: sortedMonths.map((m) => filteredMonthly[m][1]),
      backgroundColor: 'rgba(74,222,128,0.3)',
      borderColor: '#4ade80',
      borderWidth: 1,
      borderRadius: 4,
    }],
  }), [sortedMonths, filteredMonthly]);

  const monthlyChartOptions = useMemo(() => ({
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
    onClick: (_e: unknown, els: Array<{ index: number }>) => {
      if (els.length) {
        onMonthClick(sortedMonths[els[0].index]);
      }
    },
  }), [sortedMonths, onMonthClick]);

  // Top categories
  const topCats = useMemo(() => {
    const catSpend: Record<string, number> = {};
    for (const p of Object.values(filteredData)) {
      catSpend[p.c0] = (catSpend[p.c0] || 0) + p.ts;
    }
    return Object.entries(catSpend).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filteredData]);

  const catChartData = useMemo(() => ({
    labels: topCats.map((c) => c[0]),
    datasets: [{
      data: topCats.map((c) => c[1]),
      backgroundColor: COLORS.slice(0, 10),
      borderRadius: 4,
    }],
  }), [topCats]);

  const catChartOptions = useMemo(() => ({
    indexAxis: 'y' as const,
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: {
          color: '#8b92a5' as const,
          callback: (v: string | number) => fmt(Number(v)),
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        ticks: { color: '#e4e7ed' as const, font: { size: 11 } },
        grid: { display: false },
      },
    },
    onClick: (_e: unknown, els: Array<{ index: number }>) => {
      if (els.length && onCategoryClick) {
        onCategoryClick(topCats[els[0].index][0]);
      }
    },
  }), [topCats, onCategoryClick]);

  // Top products
  const topProds = useMemo(() => {
    return Object.entries(filteredData)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, 15);
  }, [filteredData]);

  const prodChartData = useMemo(() => ({
    labels: topProds.map((p) => p[1].n.length > 35 ? p[1].n.slice(0, 35) + '\u2026' : p[1].n),
    datasets: [{
      data: topProds.map((p) => p[1].ts),
      backgroundColor: COLORS.slice(0, 15),
      borderRadius: 4,
    }],
  }), [topProds]);

  const prodChartOptions = useMemo(() => ({
    indexAxis: 'y' as const,
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: {
          color: '#8b92a5' as const,
          callback: (v: string | number) => fmt(Number(v)),
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        ticks: { color: '#e4e7ed' as const, font: { size: 10 } },
        grid: { display: false },
      },
    },
    onClick: (_e: unknown, els: Array<{ index: number }>) => {
      if (els.length) {
        onShowDetail(topProds[els[0].index][0]);
      }
    },
  }), [topProds, onShowDetail]);

  const stats = [
    { l: 'Celkova utrata', v: fmt(totalSpend) + ' Kc', s: '' },
    { l: 'Objednavek', v: fmt(totalOrders), s: months ? `za ${months} mesicu` : '' },
    { l: 'Prumer / objednavka', v: fmt(avgOrder) + ' Kc', s: '' },
    { l: 'Prumer / mesic', v: fmt(avgMonthly) + ' Kc', s: '' },
    { l: 'Unikatnich produktu', v: fmt(uniqueProducts), s: '' },
  ];

  return (
    <div>
      <div className="stats-row">
        {stats.map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-label">{s.l}</div>
            <div className="stat-value">{s.v}</div>
            {s.s && <div className="stat-sub">{s.s}</div>}
          </div>
        ))}
      </div>

      <div className="chart-wrap">
        <h3>Mesicni utraty (Kc)</h3>
        <Bar data={monthlyChartData} options={monthlyChartOptions} />
      </div>

      <div className="chart-row">
        <div className="chart-wrap">
          <h3>Top 10 kategorii dle utraty</h3>
          <Bar data={catChartData} options={catChartOptions} />
        </div>
        <div className="chart-wrap">
          <h3>Top 15 produktu dle utraty</h3>
          <Bar data={prodChartData} options={prodChartOptions} />
        </div>
      </div>
    </div>
  );
}
