// Exercises the direct Gemini path against a fake generateContent server.
// Run with: npx tsx tests/mock-gemini.ts
import assert from 'node:assert/strict';
import http from 'node:http';
import { extractViaGemini, testGemini } from '../src/lib/ai';
import { DEFAULT_SETTINGS } from '../src/lib/settings';

let mode: 'ok' | 'quota' | 'thinking' | 'busy-once' | 'no-thinking' = 'ok';
let calls = 0;
let last: { url?: string; body?: any } = {};

const receipt = {
  store: 'Carrefour',
  date: '2026-11-20',
  currency: 'AED',
  items: [{ name: 'Al Ain Water 1.5L x6', category: 'Beverages', quantity: 2, unit_price: 9.5, total_price: 19 }],
  total: 19.95,
  tax: 0.95,
  subtotal: 19,
};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const send = (code: number, obj: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.headers['x-goog-api-key'] !== 'AIza-test') {
      return send(400, { error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } });
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1beta/models')) {
      return send(200, {
        models: [
          { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
        ],
      });
    }
    last = { url: req.url, body: JSON.parse(body) };
    calls++;
    if (mode === 'busy-once' && calls === 1) return send(503, { error: { code: 503, message: 'The model is overloaded', status: 'UNAVAILABLE' } });
    if (mode === 'no-thinking' && last.body.generationConfig.thinkingConfig)
      return send(400, { error: { code: 400, message: 'Thinking level is not supported for this model.', status: 'INVALID_ARGUMENT' } });
    if (mode === 'quota') return send(429, { error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } });
    const parts =
      mode === 'thinking'
        ? [{ text: 'Let me look at this receipt…', thought: true }, { text: JSON.stringify(receipt) }]
        : [{ text: JSON.stringify(receipt) }];
    send(200, { candidates: [{ content: { parts }, finishReason: 'STOP' }], modelVersion: 'gemini-3.6-flash' });
  });
});

server.listen(0, async () => {
  const base = `http://127.0.0.1:${(server.address() as any).port}/v1beta`;
  const settings = { ...DEFAULT_SETTINGS, geminiKey: 'AIza-test' };
  try {
    const r = await extractViaGemini(settings, { kind: 'image', base64: 'QUJD' }, base);
    assert.equal(last.url, '/v1beta/models/gemini-flash-latest:generateContent');
    assert.equal(last.body.contents[0].parts[1].inlineData.data, 'QUJD');
    assert.equal(last.body.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
    assert.equal(last.body.generationConfig.responseMimeType, 'application/json');
    assert.match(last.body.systemInstruction.parts[0].text, /Return ONLY one JSON object/);
    assert.equal(r.draft.store, 'Carrefour');
    assert.equal(r.draft.total, 19.95);
    assert.equal(r.model, 'gemini-3.6-flash');
    assert.equal(r.via, 'Gemini');
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(last.body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
    console.log('  ok   Gemini scan succeeds with the right request shape and low thinking');

    const tx = await extractViaGemini(settings, { kind: 'text', rows: ['CARREFOUR', 'WATER 6X1.5L    19.00', 'TOTAL   19.95'], knownNames: ['Al Ain Water 1.5L x6'] }, base);
    const sent = last.body.contents[0].parts[0].text as string;
    assert.match(sent, /RECEIPT TEXT:\nCARREFOUR\nWATER 6X1\.5L {4}19\.00/);
    assert.match(sent, /Al Ain Water 1\.5L x6/);
    assert.equal(last.body.contents[0].parts.length, 1, 'text mode sends no image');
    assert.equal(tx.draft.items.length, 1);
    console.log('  ok   text mode sends only the OCR text plus known names');

    mode = 'busy-once'; calls = 0;
    const busy = await extractViaGemini(settings, { kind: 'text', rows: ['A', 'B', 'C'] }, base);
    assert.equal(calls, 2);
    assert.equal(busy.draft.store, 'Carrefour');
    console.log('  ok   a busy (503) answer is retried automatically');

    mode = 'no-thinking'; calls = 0;
    await extractViaGemini(settings, { kind: 'text', rows: ['A', 'B', 'C'] }, base);
    assert.equal(calls, 2);
    assert.equal(last.body.generationConfig.thinkingConfig, undefined);
    console.log('  ok   a model that rejects the thinking setting is retried without it');

    mode = 'thinking';
    const t = await extractViaGemini(settings, { kind: 'image', base64: 'QUJD' }, base);
    assert.equal(t.draft.items.length, 1);
    console.log('  ok   thought parts are ignored');

    mode = 'quota';
    calls = 0;
    await assert.rejects(extractViaGemini(settings, { kind: 'image', base64: 'QUJD' }, base), /free limit/);
    console.log('  ok   429 explains the free limit');

    await assert.rejects(extractViaGemini({ ...settings, geminiKey: 'bad' }, { kind: 'image', base64: 'QUJD' }, base), /rejected the API key/);
    console.log('  ok   invalid key is explained');

    await assert.rejects(extractViaGemini({ ...settings, geminiKey: '' }, { kind: 'image', base64: 'QUJD' }, base), /Add your Gemini API key/);
    console.log('  ok   missing key is explained');

    assert.match(await testGemini(settings, base), /works with gemini-flash-latest/);
    await assert.rejects(testGemini({ ...settings, geminiModel: 'gemini-9-ultra' }, base), /isn't in your model list/);
    console.log('  ok   test connection checks the model');
    console.log('\nGemini tests passed');
  } finally {
    server.close();
  }
});
