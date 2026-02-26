import { NextRequest } from 'next/server';
import { kv } from '@/lib/kv';
import { RohlikAPI, InvalidCredentialsError } from '@/lib/rohlik-api';
import { processStats } from '@/lib/process-stats';
import * as crypto from 'crypto';

export const runtime = 'nodejs'; // Need Node.js for cookie support
export const maxDuration = 300; // 5 min timeout (Vercel Pro)

/**
 * Transform raw API result into the shape processStats expects.
 */
function transformForProcessing(
  orders: Awaited<ReturnType<RohlikAPI['fetchAndProcessAll']>>['orders'],
  categories: Awaited<ReturnType<RohlikAPI['fetchAndProcessAll']>>['categories'],
) {
  // Convert orders array to Record<string, { date, amount, items }>
  const ordersRecord: Record<
    string,
    { date: string; amount: number; items: typeof orders[number]['items'] }
  > = {};
  for (const order of orders) {
    ordersRecord[order.id] = {
      date: order.orderTime,
      amount: order.priceComposition.total.amount,
      items: order.items,
    };
  }

  // Convert Map<number, ProductCategory[]> to Record<string, { l1, l2, l3 }>
  const categoriesRecord: Record<string, { l1: string; l2: string; l3: string }> = {};
  for (const [productId, cats] of categories.entries()) {
    const l1 = cats.find((c) => c.level === 1)?.name ?? '';
    const l2 = cats.find((c) => c.level === 2)?.name ?? '';
    const l3 = cats.find((c) => c.level === 3)?.name ?? '';
    categoriesRecord[String(productId)] = { l1, l2, l3 };
  }

  return { orders: ordersRecord, categories: categoriesRecord };
}

export async function POST(req: NextRequest) {
  const { email, password } = (await req.json()) as {
    email: string;
    password: string;
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: Record<string, unknown>) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        const api = new RohlikAPI(email, password);

        // Fetch all data with progress reporting
        const result = await api.fetchAndProcessAll(
          (phase, current, total) => {
            let message = '';
            switch (phase) {
              case 'fetch_orders':
                message = `Stahovani objednavek: ${current}`;
                break;
              case 'enrich_orders':
                message = `Zpracovani objednavek: ${current}/${total}`;
                break;
              case 'fetch_categories':
                message = `Stahovani kategorii: ${current}/${total}`;
                break;
              default:
                message = phase;
            }
            sendEvent('progress', { phase, current, total, message });
          },
        );

        // Process stats
        sendEvent('progress', {
          phase: 'processing',
          current: 0,
          total: 0,
          message: 'Zpracovani statistik...',
        });

        const { orders, categories } = transformForProcessing(
          result.orders,
          result.categories,
        );
        const stats = processStats(orders, categories);

        // Generate hash from stats JSON
        const statsJson = JSON.stringify(stats);
        const hash = crypto
          .createHash('sha256')
          .update(statsJson)
          .digest('hex')
          .slice(0, 12);

        // Store in Vercel KV with 30-day TTL
        sendEvent('progress', {
          phase: 'saving',
          current: 0,
          total: 0,
          message: 'Ukladani...',
        });

        await kv.set(`stats:${hash}`, stats, { ex: 30 * 24 * 60 * 60 });

        // Send completion event
        sendEvent('complete', { id: hash, url: `/stats/${hash}` });
      } catch (error) {
        if (error instanceof InvalidCredentialsError) {
          sendEvent('error', {
            message:
              'Neplatne prihlasovaci udaje. Zkontrolujte prosim svuj email a heslo.',
          });
        } else {
          sendEvent('error', {
            message: 'Doslo k neocekavane chybe. Zkuste to prosim znovu.',
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
