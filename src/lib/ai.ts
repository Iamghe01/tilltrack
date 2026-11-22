// Receipt reading through FreeLLMAPI (an OpenAI-compatible /v1 endpoint).
// A photo goes in as an image_url content part, and the router sends it
// to whichever vision-capable free model is available.

import { CATEGORIES, normalizeCategory } from './categories';
import type { DraftItem, DraftReceipt } from './db';
import type { Settings } from './settings';
import { round2, toISODate } from './stats';

export interface ExtractionResult {
  draft: DraftReceipt;
  warnings: string[];
  provider: string | null;
  model: string | null;
  via: string; // "Gemini" or "FreeLLMAPI"
}

export class AiError extends Error {
  constructor(message: string, public hint?: string) {
    super(message);
  }
}

export function buildPrompt(currency: string, today: string): string {
  return `You read shop receipts and return their contents as JSON.

Return ONLY one JSON object, no markdown and no commentary, with this shape:
{
  "store": string | null,
  "date": "YYYY-MM-DD" | null,
  "time": "HH:MM" | null,
  "currency": string,
  "items": [
    {
      "name": string,
      "category": one of ${JSON.stringify(CATEGORIES)},
      "quantity": number,
      "unit": "pcs" | "kg" | "g" | "L" | "ml" | null,
      "unit_price": number | null,
      "total_price": number
    }
  ],
  "subtotal": number | null,
  "tax": number | null,
  "discount": number | null,
  "total": number | null,
  "payment_method": "cash" | "card" | "other" | null
}

Rules:
- One entry per purchased product line. Do NOT list subtotal, VAT, total, change, cash given, loyalty points or card lines as items.
- Write item names as clear, readable product names. Expand till abbreviations and keep the brand and pack size, e.g. "ALM FF MILK 1L" becomes "Almarai Full Fat Milk 1L". Use the same name every time for the same product.
- For weighed goods, quantity is the weight and unit is "kg" (e.g. 0.845 kg tomatoes).
- If a discount belongs to one line, subtract it from that line's total_price. Put whole-receipt discounts in "discount" as a positive number.
- total_price is what was paid for the line. unit_price is the price for one unit.
- All money values are plain numbers with no currency symbols or thousands separators.
- If the currency is not printed, use "${currency}".
- If the date is unclear, use null. Today is ${today}. Dates on receipts from the UAE and most of the world are day/month/year.
- If the image is not a receipt, return {"error": "not_a_receipt"}.`;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function validDate(v: unknown, today: string): string {
  const s = str(v);
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const ok = dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    // Future dates are almost always a day/month swap or a misread.
    if (ok && s <= today && y > 2000) return s;
  }
  return today;
}

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new AiError('The AI did not return any receipt data.');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new AiError('The AI reply was not valid JSON.', 'Try scanning again. The router may pick a different model.');
  }
}

export function parseReceiptJson(
  text: string,
  fallbackCurrency: string,
  today: string = toISODate(new Date()),
): { draft: DraftReceipt; warnings: string[] } {
  const raw = extractJsonObject(text) as Record<string, unknown>;
  if (raw && raw.error === 'not_a_receipt') {
    throw new AiError("That photo doesn't look like a receipt.", 'Fill the frame with the receipt and make sure the text is sharp.');
  }

  const warnings: string[] = [];
  const items: DraftItem[] = [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  for (const r of rawItems as Record<string, unknown>[]) {
    const name = str(r?.name);
    if (!name) continue;
    let quantity = num(r.quantity);
    let unitPrice = num(r.unit_price);
    let total = num(r.total_price);
    if (quantity == null || quantity <= 0) quantity = 1;
    if (total == null && unitPrice != null) total = round2(unitPrice * quantity);
    if (total == null) continue;
    if (unitPrice == null && quantity > 0) unitPrice = round2(total / quantity);
    const unit = str(r.unit);
    items.push({
      name,
      category: normalizeCategory(r.category),
      quantity: round2(quantity),
      unit: unit && unit !== 'pcs' ? unit : null,
      unit_price: unitPrice,
      total_price: round2(total),
    });
  }
  if (!items.length) throw new AiError('No items were found on the receipt.', 'Try a clearer, closer photo in good light.');

  const itemsSum = round2(items.reduce((s, i) => s + i.total_price, 0));
  const subtotal = num(raw.subtotal);
  const tax = num(raw.tax);
  const discount = num(raw.discount);
  let total = num(raw.total);
  if (total == null || total <= 0) {
    total = round2((subtotal ?? itemsSum) + (tax ?? 0) - Math.abs(discount ?? 0));
    warnings.push("The receipt total wasn't readable, so it was calculated from the items.");
  }

  // Lines can add up to the subtotal (before VAT) or the total (VAT included).
  const expected = [total, subtotal, round2(total - (tax ?? 0)), round2(total + Math.abs(discount ?? 0) - (tax ?? 0))]
    .filter((x): x is number => x != null);
  const closest = Math.min(...expected.map((e) => Math.abs(e - itemsSum)));
  if (closest > Math.max(1, total * 0.02)) {
    warnings.push(
      `The items add up to ${itemsSum.toFixed(2)}, but the receipt total is ${total.toFixed(2)}. Check for missed or misread lines.`,
    );
  }

  const date = validDate(raw.date, today);
  if (str(raw.date) !== date) warnings.push("The date wasn't clear, so today's date was used. Change it if that's wrong.");

  const pm = str(raw.payment_method);
  return {
    draft: {
      store: str(raw.store),
      date,
      time: str(raw.time) && /^\d{1,2}:\d{2}/.test(String(raw.time)) ? String(raw.time).slice(0, 5) : null,
      subtotal,
      tax,
      discount: discount != null ? Math.abs(discount) : null,
      total: round2(total),
      currency: (str(raw.currency) ?? fallbackCurrency).toUpperCase().slice(0, 5),
      payment_method: pm && ['cash', 'card', 'other'].includes(pm.toLowerCase()) ? pm.toLowerCase() : null,
      image_uri: null,
      note: null,
      source: 'scan',
      items,
    },
    warnings,
  };
}

/** What we send to the AI: the text rows read on the phone (fast), or the photo (fallback). */
export type ReceiptInput =
  | { kind: 'text'; rows: string[]; knownNames?: string[] }
  | { kind: 'image'; base64: string };

export interface ExtractOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function textMessage(input: Extract<ReceiptInput, { kind: 'text' }>): string {
  const names = (input.knownNames ?? []).slice(0, 80);
  return [
    'Below is the text of a shop receipt, read by OCR on the phone. Each line is one printed row;',
    'wide gaps separate columns (the price is usually the last number on a row). OCR can confuse',
    'O/0, l/1, S/5 and B/8 — fix those. Ignore lines that are not products.',
    names.length ? `When a product matches one of these names the user already uses, reuse that exact name: ${JSON.stringify(names)}` : '',
    '',
    'RECEIPT TEXT:',
    input.rows.join('\n'),
  ]
    .filter(Boolean)
    .join('\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function endpoint(baseUrl: string, path: string) {
  return baseUrl.replace(/\/+$/, '') + path;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number, service = 'FreeLLMAPI', outer?: AbortSignal) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener('abort', onOuter);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      if (outer?.aborted) throw new AiError('Cancelled.');
      throw new AiError(`${service} took too long to answer.`, 'Free models can be slow at busy times. Try again.');
    }
    if (service === 'Gemini') {
      throw new AiError("Couldn't reach Gemini.", 'Check that your phone is online, then try again.');
    }
    throw new AiError(
      "Couldn't reach FreeLLMAPI.",
      'Check that your phone is on the same Wi-Fi as your computer, that FreeLLMAPI was started with HOST_BIND=0.0.0.0, and that the address in Settings is correct.',
    );
  } finally {
    clearTimeout(t);
    outer?.removeEventListener('abort', onOuter);
  }
}

async function readError(res: Response): Promise<AiError> {
  let body: { error?: { message?: string; code?: string } | string; code?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const code = typeof body.error === 'object' ? body.error?.code : body.code;
  const msg = typeof body.error === 'object' ? body.error?.message : body.error;
  if (res.status === 401 || res.status === 403) {
    return new AiError('FreeLLMAPI rejected the API key.', 'Copy the freellmapi-... key from the Keys page into Settings.');
  }
  if (res.status === 422 || code === 'no_vision_model') {
    return new AiError(
      'No vision model is turned on in FreeLLMAPI.',
      'Open the FreeLLMAPI dashboard and enable a model with the Vision badge (for example Gemini) in your Fallback Chain.',
    );
  }
  if (res.status === 429) {
    return new AiError('All free providers are rate-limited right now.', 'Wait a minute and try again, or add more provider keys.');
  }
  return new AiError(`FreeLLMAPI error ${res.status}${msg ? `: ${msg}` : ''}`);
}

async function extractViaFreeLLM(settings: Settings, input: ReceiptInput, opts: ExtractOptions = {}): Promise<ExtractionResult> {
  if (!settings.apiKey) throw new AiError('Add your FreeLLMAPI key first.', 'Open Settings and paste your freellmapi-... key.');
  const today = toISODate(new Date());
  const user =
    input.kind === 'text'
      ? textMessage(input)
      : [
          { type: 'text', text: 'Read this receipt and return the JSON.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${input.base64}` } },
        ];
  const body = JSON.stringify({
    model: settings.model || 'auto',
    temperature: 0,
    messages: [
      { role: 'system', content: buildPrompt(settings.currency, today) },
      { role: 'user', content: user },
    ],
  });
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetchWithTimeout(
      endpoint(settings.baseUrl, '/chat/completions'),
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body },
      opts.timeoutMs ?? (input.kind === 'text' ? 40000 : 90000),
      'FreeLLMAPI',
      opts.signal,
    );
    if (res.ok || ![429, 500, 502, 503].includes(res.status) || attempt === 1) break;
    await sleep(2500);
  }
  if (!res || !res.ok) throw await readError(res!);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((c: { text?: string }) => c?.text ?? '').join('') : String(content ?? '');
  const { draft, warnings } = parseReceiptJson(text, settings.currency, today);
  return {
    draft,
    warnings,
    provider: res.headers.get('x-provider'),
    model: res.headers.get('x-model') ?? data?.model ?? null,
    via: 'FreeLLMAPI',
  };
}

async function testFreeLLM(settings: Settings): Promise<string> {
  const res = await fetchWithTimeout(
    endpoint(settings.baseUrl, '/models'),
    { headers: { Authorization: `Bearer ${settings.apiKey}` } },
    15000,
  );
  if (!res.ok) throw await readError(res);
  const data = await res.json().catch(() => null);
  const n = Array.isArray(data?.data) ? data.data.length : 0;
  return n ? `Connected. ${n} models are available.` : 'Connected.';
}

// ---------- Gemini (direct) ----------

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function readGeminiError(res: Response): Promise<AiError> {
  let body: { error?: { message?: string; status?: string; details?: { reason?: string }[] } } = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const msg = body.error?.message ?? '';
  const reason = body.error?.details?.find((d) => d.reason)?.reason ?? '';
  if (reason === 'API_KEY_INVALID' || /api key/i.test(msg) || res.status === 401 || res.status === 403) {
    return new AiError('Gemini rejected the API key.', 'Create a key at aistudio.google.com/apikey and paste it in Settings.');
  }
  if (res.status === 429) {
    return new AiError('You have hit the Gemini free limit for now.', 'Wait a minute and try again. Daily limits reset at midnight Pacific time.');
  }
  if (res.status === 404) {
    return new AiError('That Gemini model was not found.', 'Set the model to gemini-flash-latest in Settings, or tap Test connection to see the models your key can use.');
  }
  if (res.status === 503 || res.status === 500) {
    return new AiError('Gemini is busy right now.', 'Try again in a few seconds.');
  }
  return new AiError(`Gemini error ${res.status}${msg ? `: ${msg}` : ''}`);
}

function geminiModelPath(model: string) {
  const m = (model || 'gemini-flash-latest').trim().replace(/^models\//, '');
  return `models/${encodeURIComponent(m)}`;
}

export async function extractViaGemini(
  settings: Settings,
  input: ReceiptInput,
  base: string = GEMINI_BASE,
  opts: ExtractOptions = {},
): Promise<ExtractionResult> {
  const key = settings.geminiKey.trim();
  if (!key) throw new AiError('Add your Gemini API key first.', 'Get a free key at aistudio.google.com/apikey, then paste it in Settings.');
  const today = toISODate(new Date());
  const parts =
    input.kind === 'text'
      ? [{ text: textMessage(input) }]
      : [{ text: 'Read this receipt and return the JSON.' }, { inlineData: { mimeType: 'image/jpeg', data: input.base64 } }];

  // "low" thinking is much faster and plenty for reading a receipt. If a model
  // ever rejects the setting, the request is repeated without it.
  let useThinking = true;
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const generationConfig: Record<string, unknown> = { temperature: 0, responseMimeType: 'application/json' };
    if (useThinking) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    res = await fetchWithTimeout(
      `${base}/${geminiModelPath(settings.geminiModel)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildPrompt(settings.currency, today) }] },
          contents: [{ role: 'user', parts }],
          generationConfig,
        }),
      },
      opts.timeoutMs ?? (input.kind === 'text' ? 40000 : 90000),
      'Gemini',
      opts.signal,
    );
    if (res.ok) break;
    if (res.status === 400 && useThinking) {
      const msg = await res.clone().text().catch(() => '');
      if (/think/i.test(msg)) {
        useThinking = false;
        continue;
      }
    }
    if ([429, 500, 503].includes(res.status) && attempt < 2) {
      await sleep(attempt === 0 ? 2000 : 5000);
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw await readGeminiError(res!);
  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (!cand) {
    const blocked = data?.promptFeedback?.blockReason;
    throw new AiError(blocked ? `Gemini refused the receipt (${blocked}).` : 'Gemini returned an empty answer.', 'Try again with a clearer photo.');
  }
  const out: { text?: string; thought?: boolean }[] = cand.content?.parts ?? [];
  const text = out.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  if (!text && cand.finishReason === 'MAX_TOKENS') {
    throw new AiError('The receipt was too long for one answer.', 'Photograph it in two halves and scan each one.');
  }
  const { draft, warnings } = parseReceiptJson(text, settings.currency, today);
  return { draft, warnings, provider: 'Google', model: data?.modelVersion ?? settings.geminiModel, via: 'Gemini' };
}

export async function testGemini(settings: Settings, base: string = GEMINI_BASE): Promise<string> {
  const key = settings.geminiKey.trim();
  if (!key) throw new AiError('Add your Gemini API key first.');
  const res = await fetchWithTimeout(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }, 15000, 'Gemini');
  if (!res.ok) throw await readGeminiError(res);
  const data = await res.json().catch(() => null);
  const models: { name: string; supportedGenerationMethods?: string[] }[] = data?.models ?? [];
  const usable = models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  const wanted = (settings.geminiModel || 'gemini-flash-latest').replace(/^models\//, '');
  const flash = usable.filter((n) => /flash/.test(n) && !/tts|live|audio|image|embed/.test(n)).slice(0, 4);
  if (usable.length && !usable.includes(wanted)) {
    throw new AiError(
      `Your key works, but "${wanted}" isn't in your model list.`,
      `Set the model to one of: ${flash.join(', ') || usable.slice(0, 4).join(', ')}.`,
    );
  }
  return `Connected to Gemini. Your key works with ${wanted}.`;
}

// ---------- dispatch ----------

export function extractReceipt(settings: Settings, input: ReceiptInput, opts: ExtractOptions = {}): Promise<ExtractionResult> {
  return settings.provider === 'freellmapi'
    ? extractViaFreeLLM(settings, input, opts)
    : extractViaGemini(settings, input, GEMINI_BASE, opts);
}

export function hasAiKey(settings: Settings): boolean {
  return settings.provider === 'freellmapi' ? !!settings.apiKey.trim() : !!settings.geminiKey.trim();
}

export function testConnection(settings: Settings): Promise<string> {
  return settings.provider === 'freellmapi' ? testFreeLLM(settings) : testGemini(settings);
}
