## Project Description

A lightweight web app for translating long **Arabic** texts into **Persian (Farsi)** with a readable, structured output.

Users paste an Arabic text into a large input field. The system automatically splits the input into paragraph units, then **packs multiple consecutive paragraphs into batched LLM requests** (up to a configurable size limit) to reduce latency and cost. Translation is performed using **Google Gemini** via **Cloudflare AI Gateway** (OpenAI-compatible endpoint). The app returns the final result as **interleaved paragraph pairs** for easy reading:

**Arabic paragraph (bold)** → Persian translation → (blank line) → repeat…

The app also supports exporting the result to a **Word (.docx)** file that preserves the same structure (Arabic bold, Persian normal, one blank line between pairs). No database is used and no persistent disk storage is required—everything runs in-memory and is suitable for PaaS deployment via Docker.

---

## README

### Features

* **Arabic → Persian translation** using Gemini through Cloudflare AI Gateway (OpenAI-compatible).
* Handles **long inputs** by:

  * splitting into paragraph units (with a fallback for single-newline “line paragraphs”),
  * batching multiple paragraphs per model call up to a safe size cap.
* **Strict structured output** from the model (JSON-only) to avoid extra phrases like “Here is the translation…”.
* **Progress reporting** while translating.
* **DOCX export** (Word) preserving Arabic bold + Persian + one blank line spacing.
* **No database / no persistent storage**.

---

### Architecture Overview

* **Client:** React single-page app
* **Server:** Node.js + Express

  * Serves the built React app
  * Provides translation and DOCX endpoints
* **LLM:** Gemini via Cloudflare AI Gateway using the OpenAI JS SDK

---

### Environment Variables

Create a `.env` file (you can start from `.env.example`) and set:

* `CF_API_TOKEN` — Cloudflare API token used by the gateway
* `CF_ACCOUNT_ID` — Cloudflare account ID
* `CF_GATEWAY_ID` — Cloudflare AI Gateway ID
* `TRANSLATION_PROMPT` — Translation style prompt (can be Persian)

Optional (if supported by the implementation):

* `MAX_BATCH_CHARS` / `MAX_CHUNK_CHARS` — maximum characters per batched request (default typically ~2200)
* `CONCURRENCY` — max concurrent batch requests (default typically 3)

> Note: The server enforces a JSON-only response contract regardless of the style prompt.

---

### How Paragraph Splitting Works

1. Newlines are normalized (`\r\n` → `\n`) and trimmed.
2. If the input contains blank-line separators (`\n\n` or more), those define paragraphs.
3. If there are no blank lines but there are newlines, each non-empty line is treated as a paragraph unit (useful for texts copied from sources that separate items by single newline).

---

### Model Output Contract (Important)

Each batched request must return **JSON only**, with no extra text:

```json
{ "fa": ["<translation 1>", "<translation 2>", "..."] }
```

* The array length **must match** the number of input paragraphs in that batch.
* Order must be preserved: `fa[i]` is the translation of paragraph `i`.

The server validates the response strictly, retries on invalid output, and can fall back to one-by-one translation if needed.

---

### API Endpoints

* `GET /healthz`
  Health check (returns 200)

* `POST /api/translate`
  Request body:

  ```json
  { "text": "..." }
  ```

  Response:

  ```json
  {
    "chunks": [{ "id": 1, "ar": "...", "fa": "..." }],
    "meta": { "totalChunks": 10, "model": "..." }
  }
  ```

* `POST /api/docx`
  Request body:

  ```json
  { "chunks": [{ "ar": "...", "fa": "..." }] }
  ```

  Returns: a `.docx` binary stream.

(Some builds may also include `/api/translate-stream` for streaming progress events.)

---

### Run Locally

#### Install

```bash
npm install
```

#### Development

```bash
npm run dev
```

#### Production Build

```bash
npm run build
npm start
```

Then open:

* `http://localhost:8080` (or the configured port)

---

### Run with Docker

#### Build

```bash
docker build -t ar-fa-translator .
```

#### Run

```bash
docker run --rm -p 8080:8080 --env-file .env ar-fa-translator
```

Open:

* `http://localhost:8080`

---

### Output Formatting

The final output is always interleaved per paragraph:

1. **Arabic paragraph (bold)**
2. Persian translation
3. One blank line
4. Repeat…

The DOCX export follows the same structure.

---

### Troubleshooting

* **Translations grouped incorrectly** (all Arabic then all Persian):

  * Verify `/api/translate` returns a *flat ordered list* of `{ar, fa}` pairs.
  * Ensure the UI renders items interleaved, not in two separate loops.

* **Model returns extra text or malformed JSON:**

  * Confirm the server enforces the JSON-only output contract and retries on invalid responses.

* **Long paragraphs fail:**

  * Ensure very long paragraphs are split into sub-chunks and stitched back into a single Persian paragraph for that unit.

---

### License

Add your preferred license here.
