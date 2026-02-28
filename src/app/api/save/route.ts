import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import * as crypto from 'crypto';

/**
 * Save processed stats and return a permalink ID.
 * Called by the browser after client-side data processing.
 */
export async function POST(req: NextRequest) {
  const stats = await req.json();

  const statsJson = JSON.stringify(stats);
  const hash = crypto
    .createHash('sha256')
    .update(statsJson)
    .digest('hex')
    .slice(0, 12);

  await kv.set(`stats:${hash}`, stats, { ex: 30 * 24 * 60 * 60 });

  return NextResponse.json({ id: hash, url: `/stats/${hash}` });
}
