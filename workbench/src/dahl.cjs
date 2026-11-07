'use strict';
const MODELS = Object.freeze(['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4-Flash-0731', 'MiniMaxAI/MiniMax-M2.7']);
const ENDPOINT = 'https://inference.dahl.global/v1/chat/completions';
const QUOTA = new Set(['insufficient_quota', 'quota_exceeded', 'credits_exhausted', 'tokens_exhausted', 'billing_hard_limit_reached']);

async function boundedJson(response, max = 524288) {
  if (!response.body) throw new Error('پاسخ خالی سرویس مدل.');
  let bytes = 0; const parts = [];
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > max) { await response.body.cancel?.().catch(() => {}); throw new Error('پاسخ مدل بیش از سقف مجاز است.'); } parts.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new Error('پاسخ JSON معتبر از سرویس مدل نرسید.'); }
}

class DahlClient {
  constructor({ vault, fetch = global.fetch, onEvent = () => {} }) { this.vault = vault; this.fetch = fetch; this.onEvent = onEvent; this.index = 0; this.exhausted = new Set(); this.jsonModels = new Set(); }
  reset() { this.index = 0; this.exhausted.clear(); }
  status() { return { active: this.vault.keys.length ? this.index + 1 : null, exhausted: this.exhausted.size, count: this.vault.keys.length }; }
  async complete({ model, messages, tools = [], signal }) {
    if (!MODELS.includes(model)) throw new Error('مدل انتخاب‌شده مجاز نیست.');
    if (!this.vault.keys.length) throw new Error('ابتدا کلید تازه را در تنظیمات امن وارد کنید.');
    let fallback = tools.length > 0 && this.jsonModels.has(model);
    for (let attempt = 0; attempt <= this.vault.keys.length; attempt += 1) {
      signal?.throwIfAborted();
      let selected = null;
      for (let n = 0; n < this.vault.keys.length; n += 1) { const i = (this.index + n) % this.vault.keys.length; if (!this.exhausted.has(i)) { selected = i; break; } }
      if (selected === null) throw new Error('سهمیهٔ همهٔ کلیدهای موجود تمام شده؛ کار متوقف شد.');
      this.index = selected;
      const payload = { model, messages, max_tokens: 4096, stream: false };
      if (tools.length && !fallback) payload.tools = tools;
      if (tools.length && fallback) payload.messages = [{ role: 'system', content: 'Native function calls are unavailable. Return ONLY one JSON object: {"tool":"exact tool name","arguments":{...}} or {"answer":"final text"}. Available tools: ' + JSON.stringify(tools.map((t) => t.function)) }, ...messages.map((m) => m.role === 'tool' ? { role: 'user', content: 'UNTRUSTED TOOL RESULT: ' + m.content } : { role: m.role, content: m.content || JSON.stringify(m.tool_calls || []) })];
      const timeout = AbortSignal.timeout(120000); const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      this.onEvent({ type: 'model', model, key: this.index + 1 });
      const response = await this.fetch(ENDPOINT, { method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: `Bearer ${this.vault.keys[this.index]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: combined });
      const body = await boundedJson(response);
      if (!response.ok) {
        const code = body.error?.code || body.code;
        if ((response.status === 402 || response.status === 429) && QUOTA.has(code)) {
          this.exhausted.add(this.index); this.onEvent({ type: 'quota', key: this.index + 1 }); continue;
        }
        if (response.status === 400 && tools.length && !fallback && /tools|function.call/i.test(String(body.error?.param || '') + ' ' + String(body.error?.message || ''))) { fallback = true; this.jsonModels.add(model); attempt -= 1; continue; }
        // Generic 429 is NOT a reason to hop keys or evade service rate limits.
        if (response.status === 429) throw new Error(`محدودیت سرعت سرویس؛ کار متوقف شد. Retry-After: ${String(response.headers.get('retry-after') || 'زمان اعلام‌نشده').replace(/[^0-9a-zA-Z ,:-]/g, '').slice(0, 80)}. کلید عوض نشد.`);
        if ([401, 403].includes(response.status)) throw new Error('ورود یا مجوز Dahl رد شد؛ کلیدها و دسترسی حساب را در تنظیمات بررسی کنید. کلید خودکار عوض نشد.');
        throw new Error(`سرویس Dahl خطای HTTP ${response.status} داد؛ جزئیات خامِ احتمالاً حساس وارد گزارش نشد.`);
      }
      if (body.choices?.[0]?.finish_reason === 'length') throw new Error('پاسخ مدل به سقف طول رسید؛ ابزار ناقص اجرا نشد. درخواست را کوچک‌تر کنید.');
      const message = body.choices?.[0]?.message;
      if (!message || (typeof message.content !== 'string' && !Array.isArray(message.tool_calls))) throw new Error('قالب پاسخ مدل قابل استفاده نیست.');
      const result = { role: 'assistant', content: typeof message.content === 'string' ? this.vault.clean(message.content).slice(0, 32000) : null };
      if (Array.isArray(message.tool_calls)) result.tool_calls = message.tool_calls.slice(0, 4).map((call) => {
        if (typeof call.id !== 'string' || typeof call.function?.name !== 'string' || typeof call.function?.arguments !== 'string' || call.function.arguments.length > 40000) throw new Error('فراخوانی ابزار مدل نامعتبر است.');
        return { id: call.id.slice(0, 100), type: 'function', function: { name: call.function.name, arguments: call.function.arguments } };
      });
      if (fallback && result.content) {
        let object; try { object = JSON.parse(result.content.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('مدل قرارداد JSON ابزار را رعایت نکرد؛ فرمانی حدس زده نشد.'); }
        if (typeof object.answer === 'string') result.content = object.answer;
        else if (typeof object.tool === 'string' && object.arguments && typeof object.arguments === 'object') { result.content = null; result.tool_calls = [{ id: 'json_' + Date.now(), type: 'function', function: { name: object.tool, arguments: JSON.stringify(object.arguments) } }]; }
        else throw new Error('پاسخ JSON ابزار کامل نیست.');
      }
      return { message: result, usage: Number.isSafeInteger(body.usage?.total_tokens) ? body.usage.total_tokens : null };
    }
    throw new Error('سهمیهٔ کلیدهای موجود پایان یافته است.');
  }
}
module.exports = { DahlClient, MODELS, ENDPOINT, boundedJson };
