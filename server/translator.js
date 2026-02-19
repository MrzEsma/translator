import OpenAI from 'openai';

export const MODEL = 'google-ai-studio/gemini-3-pro-preview';

const JSON_OUTPUT_CONTRACT =
  'Return ONLY valid JSON. No extra text. No markdown. Schema must be exactly: {"fa": string[]}.';

const JSON_ONLY_SYSTEM_RULE = 'You are a translator. Output must be JSON only.';

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMessageContent(messageContent) {
  if (typeof messageContent === 'string') {
    return messageContent;
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }

  return '';
}

function validateFaArrayObject(payload, expectedLength) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'fa') {
    return null;
  }

  if (!Array.isArray(payload.fa) || payload.fa.length !== expectedLength) {
    return null;
  }

  if (!payload.fa.every((item) => typeof item === 'string')) {
    return null;
  }

  return { fa: payload.fa.map((item) => item.trim()) };
}

function safeParseJson(rawText, expectedLength) {
  const text = rawText.trim();
  const candidates = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const valid = validateFaArrayObject(parsed, expectedLength);
      if (valid) {
        return valid;
      }
    } catch {
      // Continue to next extraction strategy.
    }
  }

  return null;
}

function buildUserPrompt(arabicParagraphs, attempt) {
  const expectedLength = arabicParagraphs.length;
  const retryRule =
    attempt === 0
      ? ''
      : `\n\nRETRY ${attempt}: STRICT JSON ONLY. Array length MUST be exactly ${expectedLength}.`;

  return [
    'Translate each Arabic paragraph to Persian.',
    `Paragraph count: ${expectedLength}`,
    'Arabic paragraphs (JSON array):',
    JSON.stringify(arabicParagraphs),
    '',
    `${JSON_OUTPUT_CONTRACT} The "fa" array length MUST equal ${expectedLength}. Preserve order: fa[i] maps to paragraph i.`,
    retryRule,
  ]
    .join('\n')
    .trim();
}

function createClient(config) {
  return new OpenAI({
    apiKey: config.cfApiToken,
    baseURL: `https://gateway.ai.cloudflare.com/v1/${config.cfAccountId}/${config.cfGatewayId}/compat`,
  });
}

async function translateBatchWithRetries(client, config, arabicParagraphs) {
  let lastError = new Error('Unknown translation error');
  const expectedLength = arabicParagraphs.length;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: config.translationPrompt,
          },
          {
            role: 'system',
            content: JSON_ONLY_SYSTEM_RULE,
          },
          {
            role: 'user',
            content: buildUserPrompt(arabicParagraphs, attempt),
          },
        ],
      });

      const content = getMessageContent(response?.choices?.[0]?.message?.content);
      const parsed = safeParseJson(content, expectedLength);

      if (parsed) {
        return {
          fa: parsed.fa,
          attempts: attempt + 1,
        };
      }

      lastError = new Error('Model response was not valid strict JSON in {"fa": string[]} format.');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < MAX_RETRIES) {
      const jitter = Math.floor(Math.random() * 120);
      const backoffMs = BASE_BACKOFF_MS * 2 ** attempt + jitter;
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

function buildParagraphBatches(units, maxBatchChars) {
  const batches = [];
  let currentBatch = [];
  let currentBatchChars = 0;

  for (const unit of units) {
    const paragraphLength = unit.ar.length;
    const nextChars = currentBatchChars + (currentBatch.length > 0 ? 2 : 0) + paragraphLength;

    if (currentBatch.length > 0 && nextChars > maxBatchChars) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchChars = 0;
    }

    currentBatch.push(unit);
    currentBatchChars += (currentBatch.length > 1 ? 2 : 0) + paragraphLength;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function mapWithConcurrency(items, concurrency, worker) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

function mapBatchToParagraphPairs(batch, faList, status, attemptsList) {
  return batch.map((unit, index) => ({
    id: unit.id,
    ar: unit.ar,
    fa: typeof faList[index] === 'string' ? faList[index] : '',
    status,
    attempts: attemptsList[index] ?? 0,
  }));
}

export async function translateUnits(units, config, options = {}) {
  const client = createClient(config);
  const concurrency = Math.max(1, options.concurrency ?? config.concurrency);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const maxBatchChars = Math.max(200, options.maxChunkChars ?? config.maxChunkChars);
  const batches = buildParagraphBatches(units, maxBatchChars);

  let completed = 0;

  const translatedBatchStates = await mapWithConcurrency(batches, concurrency, async (batch) => {
    const paragraphs = batch.map((unit) => unit.ar);
    let translatedBatch;
    let fallbackUsed = false;
    let perItemAttempts = [];

    try {
      translatedBatch = await translateBatchWithRetries(client, config, paragraphs);
      perItemAttempts = new Array(batch.length).fill(translatedBatch.attempts);
    } catch {
      fallbackUsed = true;
      const fallbackFa = [];

      for (const paragraph of paragraphs) {
        const singleResult = await translateBatchWithRetries(client, config, [paragraph]);
        fallbackFa.push(singleResult.fa[0] ?? '');
        perItemAttempts.push(singleResult.attempts);
      }

      translatedBatch = {
        fa: fallbackFa,
      };
    }

    const mapped = mapBatchToParagraphPairs(
      batch,
      translatedBatch.fa,
      fallbackUsed ? 'done_fallback' : 'done',
      perItemAttempts,
    );

    for (const chunk of mapped) {
      completed += 1;
      if (onProgress) {
        onProgress({ ...chunk }, completed, units.length);
      }
    }

    return mapped;
  });

  return translatedBatchStates.flat().sort((a, b) => a.id - b.id);
}
