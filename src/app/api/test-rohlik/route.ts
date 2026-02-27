export const preferredRegion = 'fra1';

export async function GET() {
  try {
    const res = await fetch('https://www.rohlik.cz/services/frontend-service/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'cs-CZ,cs;q=0.9',
        'Referer': 'https://www.rohlik.cz/',
        'Origin': 'https://www.rohlik.cz',
      },
      body: JSON.stringify({ email: 'test@test.cz', password: 'test', name: '' }),
    });

    const text = await res.text();
    return new Response(JSON.stringify({
      status: res.status,
      contentType: res.headers.get('content-type'),
      bodyPreview: text.substring(0, 500),
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
