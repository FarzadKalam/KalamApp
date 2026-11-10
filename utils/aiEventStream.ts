/** Shared bundle transport: old servers may return JSON, new servers stream observed work. */
export async function readAiTaskResponse(response: Response, onActivity: (event: unknown) => void): Promise<any> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const payload = await response.json();
    if (!response.ok || payload?.success !== true) throw Object.assign(new Error(payload?.message || 'اجرای درخواست انجام نشد.'), { payload });
    return payload;
  }
  if (!response.ok || !response.body) throw new Error('پاسخ زندهٔ درخواست دریافت نشد.');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buffer = ''; let result: any; let terminal = false;
  const handle = (chunk: string) => {
    const lines = chunk.split(/\r?\n/);
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const raw = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (!raw) return;
    let data: any; try { data = JSON.parse(raw); } catch { throw new Error('پاسخ زندهٔ درخواست معتبر نیست.'); }
    if (event === 'agent_activity') onActivity(data);
    if (event === 'error' || (event === 'done' && data?.success === false)) throw Object.assign(new Error(data?.message || 'اجرای درخواست انجام نشد.'), { payload: data });
    if (event === 'done') { terminal = true; result = data; }
  };
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      if (buffer.length > 16 * 1024 * 1024) throw new Error('اندازهٔ پاسخ زنده بیش از حد مجاز است.');
      const parts = buffer.split(/\r?\n\r?\n/); buffer = parts.pop() || '';
      parts.forEach(handle);
    }
    buffer += decoder.decode(); if (buffer.trim()) handle(buffer);
    if (!terminal) throw new Error('ارتباط پیش از پایان مراحل درخواست قطع شد.');
    return result;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
