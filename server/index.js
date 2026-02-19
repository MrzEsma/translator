import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { buildParagraphUnits } from './chunking.js';
import { clampInt, loadConfig } from './config.js';
import { buildDocxBuffer } from './docx.js';
import { MODEL, translateUnits } from './translator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../client/dist');

const app = express();
app.use(express.json({ limit: '2mb' }));

function validateTextInput(req, res) {
  const { text, options } = req.body ?? {};

  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text is required and must be a non-empty string.' });
    return null;
  }

  return {
    text,
    options: options ?? {},
  };
}

function sanitizeFilename(inputName) {
  const value = (inputName || 'translation').replace(/[^a-zA-Z0-9-_]/g, '_');
  return value.length > 0 ? value : 'translation';
}

function toFlatOrderedChunks(items) {
  const flat = [];

  for (const item of items ?? []) {
    if (item && typeof item.ar === 'string' && typeof item.fa === 'string') {
      flat.push({
        id: Number.isFinite(item.id) ? item.id : flat.length + 1,
        ar: item.ar,
        fa: item.fa,
      });
      continue;
    }

    if (item && Array.isArray(item.ar) && Array.isArray(item.fa)) {
      const length = Math.min(item.ar.length, item.fa.length);
      for (let index = 0; index < length; index += 1) {
        if (typeof item.ar[index] === 'string' && typeof item.fa[index] === 'string') {
          flat.push({
            id: flat.length + 1,
            ar: item.ar[index],
            fa: item.fa[index],
          });
        }
      }
    }
  }

  return flat.sort((a, b) => a.id - b.id);
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

let config;

try {
  config = loadConfig();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}

app.post('/api/translate', async (req, res) => {
  const payload = validateTextInput(req, res);
  if (!payload) {
    return;
  }

  const maxChunkChars = clampInt(payload.options.maxChunkChars, config.maxChunkChars, 200, 10000);
  const concurrency = clampInt(payload.options.concurrency, config.concurrency, 1, 10);

  try {
    const units = buildParagraphUnits(payload.text, maxChunkChars);
    const translated = await translateUnits(units, config, { concurrency, maxChunkChars });
    const chunks = toFlatOrderedChunks(translated);

    res.json({
      chunks,
      meta: {
        totalChunks: chunks.length,
        model: MODEL,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Translation failed.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/translate-stream', async (req, res) => {
  const payload = validateTextInput(req, res);
  if (!payload) {
    return;
  }

  const maxChunkChars = clampInt(payload.options.maxChunkChars, config.maxChunkChars, 200, 10000);
  const concurrency = clampInt(payload.options.concurrency, config.concurrency, 1, 10);
  const units = buildParagraphUnits(payload.text, maxChunkChars);

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const writeLine = (event) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  writeLine({
    type: 'meta',
    totalChunks: units.length,
    model: MODEL,
  });

  try {
    const translated = await translateUnits(units, config, {
      concurrency,
      maxChunkChars,
      onProgress: (chunk, completed, totalChunks) => {
        const [flatChunk] = toFlatOrderedChunks([chunk]);
        if (!flatChunk) {
          return;
        }

        writeLine({
          type: 'progress',
          completed,
          totalChunks,
          chunk: flatChunk,
        });
      },
    });

    const chunks = toFlatOrderedChunks(translated);
    writeLine({
      type: 'done',
      chunks,
      meta: {
        totalChunks: chunks.length,
        model: MODEL,
      },
    });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Translation failed.';
    writeLine({ type: 'error', error: message });
    res.end();
  }
});

app.post('/api/docx', async (req, res) => {
  const { chunks, filename } = req.body ?? {};

  if (!Array.isArray(chunks) || chunks.length === 0) {
    res.status(400).json({ error: 'chunks must be a non-empty array.' });
    return;
  }

  const normalizedChunks = chunks
    .map((chunk) => ({
      id: Number.isFinite(chunk?.id) ? chunk.id : Number.MAX_SAFE_INTEGER,
      ar: typeof chunk?.ar === 'string' ? chunk.ar.trim() : '',
      fa: typeof chunk?.fa === 'string' ? chunk.fa.trim() : '',
    }))
    .filter((chunk) => chunk.ar && chunk.fa)
    .sort((a, b) => a.id - b.id)
    .map(({ ar, fa }) => ({ ar, fa }));

  if (normalizedChunks.length === 0) {
    res.status(400).json({ error: 'chunks must include non-empty ar and fa strings.' });
    return;
  }

  try {
    const buffer = await buildDocxBuffer(normalizedChunks);
    const safeName = sanitizeFilename(filename);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}.docx"; filename*=UTF-8''${encodeURIComponent(`${safeName}.docx`)}`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DOCX export failed.';
    res.status(500).json({ error: message });
  }
});

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/healthz') {
      next();
      return;
    }

    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
