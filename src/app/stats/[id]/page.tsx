import Dashboard from '@/components/Dashboard';
import { kv } from '@/lib/kv';
import { notFound } from 'next/navigation';
import type { StatsData } from '@/lib/stats-types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StatsPage({ params }: Props) {
  const { id } = await params;
  if (!id || !/^[a-f0-9]{12}$/.test(id)) notFound();
  const raw = await kv.get<StatsData>(`stats:${id}`);
  if (!raw) notFound();
  return (
    <div className="app">
      <Dashboard data={raw} />
    </div>
  );
}
