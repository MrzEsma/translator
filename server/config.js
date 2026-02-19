import 'dotenv/config';

const REQUIRED_ENV_VARS = [
  'CF_API_TOKEN',
  'CF_ACCOUNT_ID',
  'CF_GATEWAY_ID',
  'TRANSLATION_PROMPT',
];

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    port: parseInteger(process.env.PORT, 8080),
    cfApiToken: process.env.CF_API_TOKEN,
    cfAccountId: process.env.CF_ACCOUNT_ID,
    cfGatewayId: process.env.CF_GATEWAY_ID,
    translationPrompt: process.env.TRANSLATION_PROMPT,
    maxChunkChars: parseInteger(process.env.MAX_CHUNK_CHARS, 2200),
    concurrency: parseInteger(process.env.CONCURRENCY, 3),
  };
}

export function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
