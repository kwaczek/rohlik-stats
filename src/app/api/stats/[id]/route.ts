import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate ID format: exactly 12 hex characters
  if (!/^[a-f0-9]{12}$/.test(id)) {
    return NextResponse.json(
      { error: 'Invalid stats ID format' },
      { status: 400 },
    );
  }

  // Fetch from Vercel KV
  const stats = await kv.get(`stats:${id}`);

  if (!stats) {
    return NextResponse.json(
      { error: 'Stats not found' },
      { status: 404 },
    );
  }

  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
