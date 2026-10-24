// Optional: a small local model (Gemma 4 via Ollama) for writing summaries.
// It is never used to make decisions. If Ollama is not running, we fall back
// to the plain template, and the user always reviews the text before sharing.

export async function summarize(prompt, model = 'gemma4:e4b') {
  const url = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2 } }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.response || '').trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
