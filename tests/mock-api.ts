// Exercises extractReceipt/testConnection against a fake FreeLLMAPI server.
// Run with: npx tsx tests/mock-api.ts
import assert from 'node:assert/strict';
import http from 'node:http';
import { extractReceipt, testConnection } from '../src/lib/ai';
import { DEFAULT_SETTINGS } from '../src/lib/settings';

let mode: 'ok' | 'novision' | 'badkey' = 'ok';
let lastBody: any = null;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer freellmapi-test') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'bad key' } }));
    }
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'auto' }, { id: 'gemini-2.5-flash' }] }));
    }
    lastBody = JSON.parse(body);
    if (mode === 'novision') {
      res.writeHead(422, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 'no_vision_model', message: 'no vision' } }));
    }
    res.writeHead(200, { 'content-type': 'application/json', 'x-provider': 'google', 'x-model': 'gemini-2.5-flash' });
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '```json\n' +
                JSON.stringify({
                  store: 'Lulu Hypermarket',
                  date: '2026-11-14',
                  currency: 'AED',
                  items: [
                    { name: 'Basmati Rice 5kg', category: 'Groceries', quantity: 1, unit_price: 39.95, total_price: 39.95 },
                    { name: 'Bananas', category: 'Fruits & Vegetables', quantity: 1.2, unit: 'kg', unit_price: 5.5, total_price: 6.6 },
                  ],
                  subtotal: 46.55,
                  tax: 2.33,
                  total: 48.88,
                }) +
                '\n```',
            },
          },
        ],
      }),
    );
  });
});

server.listen(0, async () => {
  const port = (server.address() as any).port;
  const settings = { ...DEFAULT_SETTINGS, provider: 'freellmapi' as const, baseUrl: `http://127.0.0.1:${port}/v1/`, apiKey: 'freellmapi-test' };
  try {
    assert.match(await testConnection(settings), /2 models/);

    const r = await extractReceipt(settings, { kind: 'image', base64: 'AAAA' });
    assert.equal(r.provider, 'google');
    assert.equal(r.model, 'gemini-2.5-flash');
    assert.equal(r.draft.store, 'Lulu Hypermarket');
    assert.equal(r.draft.items.length, 2);
    assert.equal(r.draft.total, 48.88);
    assert.deepEqual(r.warnings, []);
    assert.equal(lastBody.model, 'auto');
    assert.equal(lastBody.messages[1].content[1].type, 'image_url');
    assert.match(lastBody.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,AAAA$/);
    console.log('  ok   scan succeeds and reads provider headers');

    mode = 'novision';
    await assert.rejects(extractReceipt(settings, { kind: 'image', base64: 'AAAA' }), /No vision model/);
    console.log('  ok   422 no_vision_model gives a helpful message');

    await assert.rejects(extractReceipt({ ...settings, apiKey: 'freellmapi-wrong' }, { kind: 'image', base64: 'AAAA' }), /rejected the API key/);
    console.log('  ok   bad key is explained');

    await assert.rejects(extractReceipt({ ...settings, baseUrl: 'http://127.0.0.1:1/v1' }, { kind: 'image', base64: 'AAAA' }), /Couldn't reach FreeLLMAPI/);
    console.log('  ok   unreachable server is explained');
    console.log('\nAPI tests passed');
  } finally {
    server.close();
  }
});
