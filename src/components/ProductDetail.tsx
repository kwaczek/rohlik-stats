'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  LineController,
  BarController,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { Line } from 'react-chartjs-2';
import type { ProductStats, FilteredProduct } from '@/lib/stats-types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  LineController,
  BarController,
  Filler,
  Tooltip,
  Legend
);

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
}

function fmtD(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
}

interface Props {
  product: ProductStats;
  filtered: FilteredProduct;
  onBack: () => void;
}

export default function ProductDetail({ product, filtered, onBack }: Props) {
  const fp = filtered;

  const sortedMonths = useMemo(
    () => Object.keys(fp.h).sort(),
    [fp.h]
  );

  const stats = [
    { l: 'Celkova utrata', v: fmt(fp.ts) + ' Kc' },
    { l: 'Celkem koupeno', v: fmt(fp.tq) + '\u00d7' },
    { l: 'Objednavek', v: fmt(fp.to) },
    { l: 'Prumerna cena', v: fmtD(fp.ap) + ' Kc' },
    { l: 'Min cena', v: fmtD(fp.mp) + ' Kc' },
    { l: 'Max cena', v: fmtD(fp.xp) + ' Kc' },
    { l: 'Poprve', v: product.fd || '' },
    { l: 'Naposledy', v: product.ld || '' },
  ];

  // Monthly purchase chart — dual axis: bars (spend, left Y) + line (quantity, right Y)
  const detailChartData = useMemo(() => ({
    labels: sortedMonths,
    datasets: [
      {
        type: 'bar' as const,
        data: sortedMonths.map((m) => fp.h[m][1]),
        backgroundColor: 'rgba(74,222,128,0.3)',
        borderColor: '#4ade80',
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: 'y',
      },
      {
        type: 'line' as const,
        data: sortedMonths.map((m) => fp.h[m][0]),
        borderColor: '#3b82f6',
        pointRadius: 3,
        yAxisID: 'y1',
        tension: 0.3,
      },
    ],
  }), [sortedMonths, fp.h]);

  const detailChartOptions = useMemo(() => ({
    responsive: true,
    plugins: {
      legend: {
        labels: { color: '#8b92a5' },
        display: true,
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (ctx: { datasetIndex: number; raw: unknown }) =>
            ctx.datasetIndex === 0
              ? fmt(Number(ctx.raw)) + ' Kc'
              : ctx.raw + '\u00d7',
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#8b92a5' as const, font: { size: 10 }, maxRotation: 45 },
        grid: { display: false },
      },
      y: {
        position: 'left' as const,
        ticks: {
          color: '#4ade80' as const,
          callback: (v: string | number) => fmt(Number(v)),
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y1: {
        position: 'right' as const,
        ticks: { color: '#3b82f6' as const },
        grid: { display: false },
      },
    },
  }), []);

  // Price trend chart
  const priceData = useMemo(
    () => sortedMonths.map((m) => {
      const h = fp.h[m];
      return Math.round((h[1] / h[0]) * 100) / 100;
    }),
    [sortedMonths, fp.h]
  );

  const priceChartData = useMemo(() => ({
    labels: sortedMonths,
    datasets: [{
      data: priceData,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245,158,11,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
    }],
  }), [sortedMonths, priceData]);

  const priceChartOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: '#8b92a5' as const, font: { size: 10 }, maxRotation: 45 },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: '#f59e0b' as const,
          callback: (v: string | number) => fmtD(Number(v)) + ' Kc',
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  }), []);

  return (
    <div>
      <div className="detail-back" onClick={onBack}>
        &larr; Zpet
      </div>

      <div className="detail-header">
        <h2>{product.n}</h2>
        <div className="detail-cats">
          <span className="cat-badge">{product.c0}</span>
          {product.c1 && <span className="cat-badge">{product.c1}</span>}
          {product.c2 && <span className="cat-badge">{product.c2}</span>}
        </div>
        <div style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '4px' }}>
          {product.ta}
        </div>
      </div>

      <div className="detail-stats">
        {stats.map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-label">{s.l}</div>
            <div className="stat-value" style={{ fontSize: '18px' }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="chart-wrap">
        <h3>Historie nakupu</h3>
        <Chart type="bar" data={detailChartData} options={detailChartOptions} />
      </div>

      <div className="chart-wrap">
        <h3>Vyvoj ceny</h3>
        <Line data={priceChartData} options={priceChartOptions} />
      </div>
    </div>
  );
}
