'use client';

import { useState, useMemo } from 'react';
import type { FilteredData } from '@/lib/stats-types';

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
}

function fmtD(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
}

const PER_PAGE = 30;

const SORT_OPTIONS = [
  { value: 'ts-desc', label: 'Dle utraty \u2193' },
  { value: 'ts-asc', label: 'Dle utraty \u2191' },
  { value: 'tq-desc', label: 'Dle mnozstvi \u2193' },
  { value: 'tq-asc', label: 'Dle mnozstvi \u2191' },
  { value: 'to-desc', label: 'Dle objednavek \u2193' },
  { value: 'n-asc', label: 'Dle nazvu A\u2192Z' },
  { value: 'ap-desc', label: 'Dle ceny \u2193' },
  { value: 'ld-desc', label: 'Naposledy koupeno \u2193' },
];

interface Props {
  filteredData: FilteredData;
  onShowDetail: (pid: string) => void;
}

export default function ProductsPage({ filteredData, onShowDetail }: Props) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [sortBy, setSortBy] = useState('ts-desc');
  const [page, setPage] = useState(0);

  const allCats = useMemo(() => {
    return [...new Set(Object.values(filteredData).map((p) => p.c0))].sort();
  }, [filteredData]);

  const [sortKey, sortDir] = sortBy.split('-') as [string, string];

  const filteredItems = useMemo(() => {
    const searchLower = search.toLowerCase();
    let items = Object.entries(filteredData).filter(([, p]) => {
      if (searchLower && !p.n.toLowerCase().includes(searchLower)) return false;
      if (catFilter && p.c0 !== catFilter) return false;
      return true;
    });

    items.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const va = sortKey === 'n' ? a[1].n.toLowerCase() : (a[1] as any)[sortKey] as number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vb = sortKey === 'n' ? b[1].n.toLowerCase() : (b[1] as any)[sortKey] as number;
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    return items;
  }, [filteredData, search, catFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredItems.length / PER_PAGE);
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const pageItems = filteredItems.slice(currentPage * PER_PAGE, (currentPage + 1) * PER_PAGE);

  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const handleCatFilterChange = (value: string) => {
    setCatFilter(value);
    setPage(0);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    setPage(0);
  };

  return (
    <div>
      <div className="table-controls">
        <input
          className="search-input"
          placeholder="Hledat produkt..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <select
          className="cat-select"
          value={catFilter}
          onChange={(e) => handleCatFilterChange(e.target.value)}
        >
          <option value="">Vsechny kategorie</option>
          {allCats.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className="cat-select"
          value={sortBy}
          onChange={(e) => handleSortChange(e.target.value)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Kategorie</th>
              <th>Mnozstvi</th>
              <th>Objednavky</th>
              <th className="money">Celkem Kc</th>
              <th className="money">Prum. cena</th>
              <th>Naposledy</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(([pid, p]) => (
              <tr
                key={pid}
                onClick={() => onShowDetail(pid)}
                style={{ cursor: 'pointer' }}
              >
                <td className="product-name">
                  {p.n}<br />
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{p.ta}</span>
                </td>
                <td><span className="cat-badge">{p.c0}</span></td>
                <td className="num">{p.tq}</td>
                <td className="num">{p.to}</td>
                <td className="money">{fmt(p.ts)}</td>
                <td className="money">{fmtD(p.ap)}</td>
                <td style={{ fontSize: '12px', color: 'var(--text2)' }}>{p.ld || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="page-info">{filteredItems.length} produktu</span>
        {totalPages > 1 && (
          <>
            {currentPage > 0 && (
              <button className="page-btn" onClick={() => setPage(0)}>&laquo;</button>
            )}
            {currentPage > 0 && (
              <button className="page-btn" onClick={() => setPage((p) => p - 1)}>&lsaquo;</button>
            )}
            <span className="page-info">{currentPage + 1} / {totalPages}</span>
            {currentPage < totalPages - 1 && (
              <button className="page-btn" onClick={() => setPage((p) => p + 1)}>&rsaquo;</button>
            )}
            {currentPage < totalPages - 1 && (
              <button className="page-btn" onClick={() => setPage(totalPages - 1)}>&raquo;</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
