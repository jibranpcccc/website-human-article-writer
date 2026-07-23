import express from 'express';
import cors from 'cors';
import { PORT } from './config.js';
import { dispatchJob, getJob, cancelJob, listJobs } from './bigPickleBridge.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'bigpickle-bridge' });
});

// Enqueue a BigPickle job
app.post('/api/bigpickle', async (req, res) => {
  try {
    const { prompt, modelLabel, agent, mode } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid prompt.' });
    }
    const { jobId } = await dispatchJob({ prompt, modelLabel, agent, mode });
    res.json({ jobId, status: 'queued' });
  } catch (err) {
    console.error('[server] POST /api/bigpickle error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Get job status / result
app.get('/api/bigpickle/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  res.json({
    id: job.id,
    status: job.status,
    result: job.result,
    error: job.error,
    agent: job.agent,
    updatedAt: job.updatedAt
  });
});

// Cancel a queued/running job
app.post('/api/bigpickle/:jobId/cancel', (req, res) => {
  const ok = cancelJob(req.params.jobId);
  res.json({ cancelled: ok });
});

// List recent jobs (debug/observability)
app.get('/api/jobs', (req, res) => {
  res.json(listJobs());
});

app.listen(PORT, '0.0.0.0', () => {
  const cdpPort = process.env.CDP_PORT || process.env.BIGPICKLE_CDP_HOST?.split(':').pop() || '19321';
  console.log(`[bigpickle-bridge] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[bigpickle-bridge] Open Chrome with remote debugging on port ${cdpPort} for best results.`);
});
