// Build the downloadable Word file for a tailored draft.
// Layout matches what fit two pages for Josh: 0.5" margins, Aptos 11 pt, single spacing, no space after.
import { Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat } from 'docx'

const FONT = 'Aptos'
const SIZE = 22 // half-points = 11 pt

const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: SIZE, ...opts })

export async function draftToDocxBlob(resumeText) {
  const children = []
  const lines = resumeText.split('\n').map((l) => l.trim()).filter(Boolean)
  lines.forEach((s, i) => {
    if (s.startsWith('## ')) {
      children.push(new Paragraph({ children: [run(s.slice(3), { bold: true })], spacing: { before: 80, after: 0 }, keepNext: true }))
    } else if (s.startsWith('# ')) {
      children.push(new Paragraph({ children: [run(s.slice(2).toUpperCase(), { bold: true })], spacing: { before: 160, after: 0 }, keepNext: true }))
    } else if (s.startsWith('- ')) {
      children.push(new Paragraph({ children: [run(s.slice(2))], numbering: { reference: 'bullets', level: 0 }, spacing: { after: 0 } }))
    } else if (i === 0) {
      children.push(new Paragraph({ children: [run(s, { bold: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { after: 0 } }))
    } else {
      children.push(new Paragraph({ children: [run(s)], spacing: { after: 0 } }))
    }
  })

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
      }],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children,
    }],
  })
  return Packer.toBlob(doc)
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
