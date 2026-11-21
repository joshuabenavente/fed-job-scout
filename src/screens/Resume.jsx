import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { extractResumeText, looksScanned } from '../lib/extract'

export default function Resume({ session }) {
  const [text, setText] = useState('')
  const [savedText, setSavedText] = useState('')
  const [filename, setFilename] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    supabase.from('resumes').select('*').maybeSingle().then(({ data }) => {
      if (data) {
        setText(data.resume_text); setSavedText(data.resume_text)
        setFilename(data.original_filename); setUpdatedAt(data.updated_at)
      }
    })
  }, [])

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setMsg(''); setBusy(true)
    try {
      const extracted = await extractResumeText(file)
      if (looksScanned(extracted)) {
        setError('We could only read a few words from that file. It may be a scanned image. Please upload a Word file, or a PDF where you can select the text.')
      } else {
        setText(extracted)
        setFilename(file.name)
        setMsg('Text pulled from your file. Check it below, fix anything garbled, then tap Save.')
      }
    } catch (err) {
      setError(err.message || String(err))
    }
    setBusy(false)
  }

  async function save() {
    setError(''); setMsg('')
    if (text.trim().split(/\s+/).length < 80) return setError('That looks too short to be a full resume.')
    setBusy(true)
    const { data, error } = await supabase.from('resumes').upsert({
      user_id: session.user.id,
      resume_text: text.trim(),
      original_filename: filename,
      updated_at: new Date().toISOString(),
    }).select().single()
    setBusy(false)
    if (error) return setError(error.message)
    setSavedText(data.resume_text); setUpdatedAt(data.updated_at)
    setMsg('Saved. This is the resume every draft will be built from.')
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const dirty = text !== savedText

  return (
    <section>
      <h2>Your base resume</h2>
      <p className="muted small">
        Upload your longest, most complete resume. Drafts can only trim and reword what's here, never add to it.
        Only the text is kept, not the file.
      </p>

      <div className="row-start">
        <button type="button" className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Reading…' : savedText ? 'Replace from file' : 'Upload Word or PDF'}
        </button>
        <input ref={fileRef} type="file" accept=".docx,.pdf,.doc" hidden onChange={onFile} />
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="ok">{msg}</p>}

      <label className="block">
        Resume text {words > 0 && <span className="muted small">({words} words)</span>}
        <textarea rows={18} value={text} onChange={(e) => setText(e.target.value)} placeholder="Upload a file, or paste your resume here." />
      </label>

      <div className="row-start">
        <button type="button" className="primary" disabled={busy || !dirty || !text.trim()} onClick={save}>Save</button>
        {updatedAt && !dirty && <span className="muted small">Last saved {new Date(updatedAt).toLocaleDateString()}</span>}
        {dirty && savedText && <span className="muted small">Unsaved changes</span>}
      </div>
    </section>
  )
}
