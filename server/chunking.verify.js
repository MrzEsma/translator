import assert from 'node:assert/strict';
import { buildParagraphUnits, splitIntoParagraphs } from './chunking.js';

function toFlatOrderedChunks(items) {
  return [...(items ?? [])]
    .map((item, index) => ({
      id: Number.isFinite(item?.id) ? item.id : index + 1,
      ar: typeof item?.ar === 'string' ? item.ar : '',
      fa: typeof item?.fa === 'string' ? item.fa : '',
    }))
    .filter((item) => item.ar && item.fa)
    .sort((a, b) => a.id - b.id);
}

const caseA = 'فقره اول\n\nفقره دوم\n\nفقره سوم';
const caseB = 'سطر اول\nسطر دوم\nسطر سوم';

const caseAParagraphs = splitIntoParagraphs(caseA);
const caseBParagraphs = splitIntoParagraphs(caseB);

assert.equal(caseAParagraphs.length, 3, 'Case A should split by blank lines.');
assert.equal(caseBParagraphs.length, 3, 'Case B should split by single newlines when no blank lines exist.');

const units = buildParagraphUnits(caseB, 2200);
const mockTranslated = units.map((unit) => ({
  id: unit.id,
  ar: unit.ar,
  fa: `ترجمه ${unit.id}`,
}));
const flatChunks = toFlatOrderedChunks(mockTranslated);

assert.deepEqual(
  flatChunks.map((chunk) => chunk.ar),
  caseBParagraphs,
  'Flat chunks must preserve paragraph order for interleaving.',
);
assert.deepEqual(
  flatChunks.map((chunk) => chunk.fa),
  ['ترجمه 1', 'ترجمه 2', 'ترجمه 3'],
  'Each paragraph must map to its corresponding Persian translation.',
);

console.log('Case A paragraphs:', caseAParagraphs.length);
console.log('Case B paragraphs:', caseBParagraphs.length);
console.log('Flat ordered chunks:', JSON.stringify(flatChunks, null, 2));
console.log('Verification passed: paragraph detection and flat interleaving mapping are correct.');
