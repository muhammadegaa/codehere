// Optional: a small local model (Gemma 4 via Ollama) for writing summaries.
// It is never used to make decisions. If Ollama is not running, we fall back
// to the plain template, and the user always reviews the text before sharing.

const url = () => {
  const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
  return /^https?:\/\//.test(host) ? host : `http://${host}`; // Ollama allows OLLAMA_HOST without a scheme
};

async function post(path, body, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${url()}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The configured model if it is installed, else the best small Gemma that is.
// Ollama tags vary (gemma4:e4b, gemma4:e4b-it-qat, ...).
export function pickModel(installed, wanted) {
  if (installed.includes(wanted)) return wanted;
  for (const re of [/^gemma4:e4b/, /^gemma4:e2b/, /^gemma4:12b/, /^gemma4:/, /^gemma/]) {
    const hit = installed.find((n) => re.test(n) && !/embed/.test(n));
    if (hit) return hit;
  }
  return null;
}

// Returns { text, model } or null.
export async function summarize(prompt, wanted = 'gemma4:e4b') {
  const tags = await post('/api/tags', null, 3000);
  const model = tags ? pickModel((tags.models || []).map((m) => m.name), wanted) : null;
  if (!model) return null;
  // Thinking off: a summary does not need it, and it is several times slower.
  const data = await post('/api/generate', { model, prompt, stream: false, think: false, options: { temperature: 0.2 } }, 60000);
  const text = ((data && data.response) || '').trim();
  return text ? { text, model } : null;
}
