const BRIDGE_BASE = import.meta.env?.VITE_BIGPICKLE_BRIDGE || 'http://127.0.0.1:19322';

async function request(path, options = {}) {
  const url = `${BRIDGE_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Bridge returned non-JSON: ${text}`);
  }
  if (!res.ok) {
    throw new Error(data.error || `Bridge error ${res.status}`);
  }
  return data;
}

export async function checkBridgeHealth() {
  try {
    const data = await request('/health', { method: 'GET' });
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function dispatchBigPickleJob({ prompt, modelLabel = 'chatgpt-browser', agent = 'bigPickle', mode = 'articleV86' }) {
  return request('/api/bigpickle', {
    method: 'POST',
    body: JSON.stringify({ prompt, modelLabel, agent, mode })
  });
}

export async function getBigPickleJob(jobId) {
  return request(`/api/bigpickle/${jobId}`, { method: 'GET' });
}

export async function waitForBigPickleResult(jobId, { pollMs = 1500, timeoutMs = 600000, onProgress } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await getBigPickleJob(jobId);
    if (data.status === 'complete') return data.result;
    if (data.status === 'failed') throw new Error(data.error || 'Bridge job failed');
    if (data.status === 'cancelled') throw new Error('Bridge job cancelled');
    onProgress?.(data.status || 'running');
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  throw new Error(`Bridge job timed out after ${timeoutMs}ms`);
}
