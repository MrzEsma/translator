## Project Description

A lightweight web app for translating long **Arabic** texts into **Persian (Farsi)** with a readable, structured output.

Paste Arabic text into the input, translate, and get a clean interleaved result:

**Arabic paragraph (bold)** → Persian translation → (blank line) → repeat…

Supports exporting the final result to **Word (.docx)** with the same structure. Runs fully in-memory with no database and is packaged for Docker/PaaS deployment.

---

## README

### Arabic → Persian Translator (Web)

Translate long Arabic texts to Persian and export the result as a Word document.

### Features

* Large text input for Arabic
* Automatic paragraph splitting and batching for long inputs
* Structured output as Arabic/Persian paragraph pairs
* Download result as **.docx** (Arabic bold + Persian + one blank line between pairs)
* No database, no persistent storage

### Tech

* React (frontend)
* Node.js + Express (backend)
* Dockerized single service

### Setup

#### 1) Environment

Create `.env` (copy from `.env.example`) and set:

* `CF_API_TOKEN`
* `CF_ACCOUNT_ID`
* `CF_GATEWAY_ID`
* `TRANSLATION_PROMPT`

#### 2) Run locally

```bash
npm install
npm run dev
```

#### 3) Build & run (production)

```bash
npm run build
npm start
```

App runs on `http://localhost:8080`.

### Docker

```bash
docker build -t ar-fa-translator .
docker run --rm -p 8080:8080 --env-file .env ar-fa-translator
```

### License

Licensed under the Apache License 2.0. See `LICENSE`.
