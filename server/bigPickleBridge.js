import { getPage, sendPrompt, sendThreePartPrompt, isLoginPage } from './chatgptDriver.js';

/**
 * BigPickle Bridge Job Queue
 *
 * Maintains in-memory jobs and drives the ChatGPT browser tab.
 */

const jobs = new Map();
let activeJobId = null;

export function getJob(jobId) {
  return jobs.get(jobId);
}

export async function dispatchJob({ prompt, modelLabel, agent = 'bigPickle', mode = 'articleV86' }) {
  const jobId = `${agent}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const job = {
    id: jobId,
    agent,
    status: 'queued',
    prompt,
    modelLabel,
    mode,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(jobId, job);

  // Run in background
  runJob(jobId);
  return { jobId };
}

async function runJob(jobId) {
  if (activeJobId) return; // simple sequential queue
  activeJobId = jobId;
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'running';
    job.updatedAt = new Date().toISOString();

    const page = await getPage();
    if (isLoginPage(page)) {
      throw new Error('ChatGPT login page detected. Please log in via the browser and retry.');
    }

    const isFullArticle = job.mode === 'articleV15' || job.mode === 'articleV86' || job.mode === 'articleV13';
    const useMultiTurn = isFullArticle;
    const driver = useMultiTurn ? sendThreePartPrompt : sendPrompt;
    console.log('[bridge] using driver:', useMultiTurn ? '3-part human writer' : 'single-turn', 'mode:', job.mode);

    const { content, model } = await driver(page, { prompt: job.prompt });
    job.status = 'complete';
    job.result = {
      content,
      provider: 'chatgpt-browser',
      model: model || job.modelLabel || 'chatgpt-browser'
    };
  } catch (err) {
    job.status = 'failed';
    job.error = err.message || String(err);
  } finally {
    job.updatedAt = new Date().toISOString();
    activeJobId = null;
    // trigger next queued job
    const next = Array.from(jobs.values()).find(j => j.status === 'queued');
    if (next) runJob(next.id);
  }
}

export function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.status === 'queued' || job.status === 'running') {
    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function listJobs() {
  return Array.from(jobs.values());
}
