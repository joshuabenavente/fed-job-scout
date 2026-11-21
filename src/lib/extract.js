// Pull plain text out of an uploaded Word or PDF resume, entirely in the browser.
// The file itself is never uploaded or stored; only the extracted text is saved.

export async function extractResumeText(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser.js')
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return tidy(value)
  }
  if (name.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist')
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    const pages = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      // Rebuild lines using the vertical position of each text piece
      let lastY = null
      let line = ''
      const lines = []
      for (const item of content.items) {
        const y = Math.round(item.transform?.[5] ?? 0)
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lines.push(line)
          line = ''
        }
        line += item.str
        if (item.hasEOL) { lines.push(line); line = ''; lastY = null; continue }
        lastY = y
      }
      if (line) lines.push(line)
      pages.push(lines.join('\n'))
    }
    return tidy(pages.join('\n'))
  }
  if (name.endsWith('.doc')) {
    throw new Error('Old .doc files can’t be read. In Word, use File → Save As → Word Document (.docx), then upload that.')
  }
  throw new Error('Please upload a Word (.docx) or PDF file.')
}

function tidy(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function looksScanned(text) {
  // A real resume has hundreds of words; a scanned (image-only) PDF yields almost nothing
  return text.split(/\s+/).filter(Boolean).length < 80
}
