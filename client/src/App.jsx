import { useMemo, useState } from 'react';

const DEFAULT_OPTIONS = {
  maxChunkChars: 2200,
  concurrency: 3,
};

function estimateParagraphCount(text) {
  const normalized = (text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return 0;
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length;
}

function chunkTextForCopy(chunks) {
  return chunks.map((chunk) => `${chunk.ar}\n${chunk.fa}`).join('\n\n');
}

function normalizeFlatChunks(items) {
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

export default function App() {
  const [inputText, setInputText] = useState('');
  const [chunks, setChunks] = useState([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  const canTranslate = inputText.trim().length > 0 && !isTranslating;
  const canExport = chunks.length > 0 && !isTranslating;
  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  const progressText = useMemo(() => {
    if (progress.total === 0) {
      return '0 / 0 paragraphs';
    }

    return `${progress.completed} / ${progress.total} paragraphs`;
  }, [progress.completed, progress.total]);

  async function handleTranslate() {
    if (!canTranslate) {
      return;
    }

    setError('');
    setChunks([]);

    const estimatedTotal = estimateParagraphCount(inputText);
    setProgress({ completed: 0, total: estimatedTotal });
    setIsTranslating(true);

    try {
      const response = await fetch('/api/translate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          options: DEFAULT_OPTIONS,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Translation request failed.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';

      const applyEvent = (event) => {
        if (event.type === 'meta') {
          setProgress({ completed: 0, total: event.totalChunks ?? 0 });
          return;
        }

        if (event.type === 'progress' && event.chunk) {
          const [nextChunk] = normalizeFlatChunks([event.chunk]);
          if (!nextChunk) {
            return;
          }

          setProgress({
            completed: event.completed ?? 0,
            total: event.totalChunks ?? 0,
          });

          setChunks((previous) => {
            const map = new Map(previous.map((chunk) => [chunk.id, chunk]));
            map.set(nextChunk.id, nextChunk);
            return Array.from(map.values()).sort((a, b) => a.id - b.id);
          });
          return;
        }

        if (event.type === 'done') {
          setChunks(normalizeFlatChunks(Array.isArray(event.chunks) ? event.chunks : []));
          setProgress({
            completed: event.meta?.totalChunks ?? 0,
            total: event.meta?.totalChunks ?? 0,
          });
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.error || 'Translation failed.');
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          applyEvent(JSON.parse(trimmed));
        }
      }

      const finalLine = buffered.trim();
      if (finalLine) {
        applyEvent(JSON.parse(finalLine));
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Translation failed.';
      setError(message);
    } finally {
      setIsTranslating(false);
    }
  }

  async function handleCopy() {
    const textToCopy = chunkTextForCopy(chunks);
    if (!textToCopy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      setError('کپی در کلیپ‌بورد انجام نشد.');
    }
  }

  async function handleDownloadDocx() {
    if (!canExport) {
      return;
    }

    setIsDownloading(true);
    setError('');

    try {
      const response = await fetch('/api/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'arabic-persian-translation',
          chunks,
        }),
      });

      if (!response.ok) {
        throw new Error('DOCX export failed.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'arabic-persian-translation.docx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : 'DOCX export failed.';
      setError(message);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="page" dir="rtl">
      <header className="hero">
        <h1>Arabic → Persian Translator</h1>
        <p>ترجمه پاراگراف‌محور با خروجی دقیق و قابل دانلود</p>
      </header>

      <section className="card">
        <h2>Input</h2>
        <label htmlFor="input" className="label">
          متن عربی
        </label>
        <textarea
          id="input"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          placeholder="متن عربی را اینجا وارد کنید..."
          className="textarea"
        />

        <div className="controls">
          <button type="button" onClick={handleTranslate} disabled={!canTranslate} className="btn btnPrimary">
            {isTranslating ? (
              <>
                <span className="spinner" aria-hidden="true" />
                در حال ترجمه...
              </>
            ) : (
              'ترجمه'
            )}
          </button>
          <button type="button" onClick={handleCopy} disabled={!canExport} className="btn btnSecondary">
            کپی
          </button>
          <button
            type="button"
            onClick={handleDownloadDocx}
            disabled={!canExport || isDownloading}
            className="btn btnSecondary"
          >
            {isDownloading ? 'در حال ساخت فایل...' : 'دانلود Word'}
          </button>
        </div>

        <div className="progressBlock" aria-live="polite">
          <div className="progressMeta">
            <span>پیشرفت</span>
            <span>{progressText}</span>
          </div>
          <div className="progressTrack">
            <div className="progressFill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="card">
        <h2>Output</h2>
        <div className="output" aria-live="polite">
          {chunks.length === 0 ? (
            <p className="placeholder">هنوز ترجمه‌ای ثبت نشده است.</p>
          ) : (
            chunks.map((chunk, index) => (
              <div key={chunk.id} className="pair">
                <p className="arabicLine">
                  <strong>{chunk.ar}</strong>
                </p>
                <p className="persianLine">{chunk.fa}</p>
                {index < chunks.length - 1 ? <p className="blankLine">&nbsp;</p> : null}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
