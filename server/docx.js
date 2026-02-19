import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';

export async function buildDocxBuffer(chunks) {
  const paragraphs = [];

  chunks.forEach((chunk, index) => {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        children: [new TextRun({ text: chunk.ar, bold: true, rightToLeft: true })],
      }),
    );

    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        children: [new TextRun({ text: chunk.fa, rightToLeft: true })],
      }),
    );

    if (index < chunks.length - 1) {
      paragraphs.push(new Paragraph({ text: '' }));
    }
  });

  const doc = new Document({
    sections: [
      {
        children: paragraphs,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
