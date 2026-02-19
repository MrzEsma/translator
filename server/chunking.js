function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

export function splitIntoParagraphs(text) {
  const normalized = normalizeNewlines(text ?? '').trim();
  if (!normalized) {
    return [];
  }

  const parts = /\n{2,}/.test(normalized) ? normalized.split(/\n{2,}/) : normalized.split(/\n+/);

  return parts
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function hardSplit(text, maxChunkChars) {
  const chunks = [];
  let cursor = 0;

  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + maxChunkChars));
    cursor += maxChunkChars;
  }

  return chunks;
}

function splitBySentence(text) {
  const matches = text.match(/[^.!?؟؛]+[.!?؟؛]*/g);
  if (!matches) {
    return [text];
  }

  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

function splitSegment(segment, maxChunkChars) {
  if (segment.length <= maxChunkChars) {
    return [segment];
  }

  const sentenceParts = splitBySentence(segment);
  const expanded = [];

  for (const sentence of sentenceParts) {
    if (sentence.length <= maxChunkChars) {
      expanded.push(sentence);
      continue;
    }

    expanded.push(...hardSplit(sentence, maxChunkChars));
  }

  return expanded;
}

function packSegments(segments, maxChunkChars) {
  const packed = [];
  let current = '';

  for (const segment of segments) {
    const candidate = current ? `${current} ${segment}` : segment;
    if (candidate.length <= maxChunkChars) {
      current = candidate;
      continue;
    }

    if (current) {
      packed.push(current);
    }

    if (segment.length <= maxChunkChars) {
      current = segment;
      continue;
    }

    const forced = hardSplit(segment, maxChunkChars);
    packed.push(...forced.slice(0, -1));
    current = forced[forced.length - 1] ?? '';
  }

  if (current) {
    packed.push(current);
  }

  return packed;
}

function splitOverlongParagraph(paragraph, maxChunkChars) {
  const lineSegments = paragraph
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const normalizedSegments = lineSegments.length > 0 ? lineSegments : [paragraph];
  const expanded = [];

  for (const segment of normalizedSegments) {
    expanded.push(...splitSegment(segment, maxChunkChars));
  }

  return packSegments(expanded, maxChunkChars);
}

export function buildParagraphUnits(text, maxChunkChars) {
  const paragraphs = splitIntoParagraphs(text);

  return paragraphs.map((paragraph, index) => {
    if (paragraph.length <= maxChunkChars) {
      return {
        id: index + 1,
        ar: paragraph,
        subChunks: [paragraph],
      };
    }

    return {
      id: index + 1,
      ar: paragraph,
      subChunks: splitOverlongParagraph(paragraph, maxChunkChars),
    };
  });
}
