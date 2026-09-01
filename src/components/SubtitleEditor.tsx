import { useState } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'
import { useEditorStore } from '../store/editorStore'
import type { SubtitleStyle, SubtitleCue } from '../types'
import { v4 as uuidv4 } from 'uuid'

const Backdrop = styled.div`position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.6);`
const Modal = styled.div`position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:min(680px,calc(100vw - 32px)); max-height:calc(100vh - 64px); overflow:hidden; background:#161616; border:1px solid #353535; border-radius:12px; display:flex; flex-direction:column; color:#e5e5e5;`
const Header = styled.div`padding:16px 20px; border-bottom:1px solid #2a2a2a; display:flex; align-items:center; gap:12px;`
const Title = styled.h2`font-size:14px; margin:0; flex:1;`
const Content = styled.div`padding:16px 20px; overflow:auto; display:flex; flex-direction:column; gap:14px;`
const Button = styled.button<{ $primary?: boolean }>`border:0; border-radius:6px; padding:8px 10px; cursor:pointer; background:${p => p.$primary ? '#f97316' : 'rgba(255,255,255,.08)'}; color:${p => p.$primary ? '#111' : '#e5e5e5'}; font-size:12px; font-weight:${p => p.$primary ? 600 : 400};`
const Cue = styled.div`display:grid; grid-template-columns:76px 1fr 28px; gap:8px; align-items:center;`
const Input = styled.input`background:#101010; color:#e5e5e5; border:1px solid #353535; border-radius:5px; padding:7px 8px; font-size:12px; min-width:0; &:focus{outline:none;border-color:#f97316}`
const TextInput = styled.textarea`background:#101010; color:#e5e5e5; border:1px solid #353535; border-radius:5px; padding:7px 8px; font-size:12px; min-width:0; resize:vertical; min-height:32px; font-family:inherit; &:focus{outline:none;border-color:#f97316}`
const Label = styled.label`display:flex; flex-direction:column; gap:5px; color:#9ca3af; font-size:11px;`
const Row = styled.div`display:flex; gap:10px; flex-wrap:wrap; align-items:end;`
const Error = styled.div`font-size:12px; color:#fca5a5;`

function fmt(value: number) { return value.toFixed(2) }

const fontOptions = ['Arial', 'Helvetica Neue', 'Trebuchet MS', 'Georgia', 'Impact', 'Courier New']

function regroupCues(cues: SubtitleCue[], wordsPerBlock: number): SubtitleCue[] {
  const tokens = [...cues].sort((a, b) => a.start - b.start).flatMap((cue) => {
    const words = cue.text.trim().split(/\s+/).filter(Boolean)
    return words.map((word, index) => ({
      word, cueId: cue.id,
      start: cue.start + (cue.end - cue.start) * (index / words.length),
      end: cue.start + (cue.end - cue.start) * ((index + 1) / words.length),
    }))
  })
  return Array.from({ length: Math.ceil(tokens.length / wordsPerBlock) }, (_, index) => {
    const group = tokens.slice(index * wordsPerBlock, (index + 1) * wordsPerBlock)
    return { id: index === 0 ? group[0].cueId : uuidv4(), start: group[0].start, end: group[group.length - 1].end, text: group.map(item => item.word).join(' ') }
  })
}

export default function SubtitleEditor({ onClose }: { onClose: () => void }) {
  const project = useEditorStore(s => s.project!)
  const setSubtitles = useEditorStore(s => s.setSubtitles)
  const updateSubtitle = useEditorStore(s => s.updateSubtitle)
  const deleteSubtitle = useEditorStore(s => s.deleteSubtitle)
  const updateStyle = useEditorStore(s => s.updateSubtitleStyle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wordsPerBlock, setWordsPerBlock] = useState(4)
  const subtitles = project.subtitles
  const style = subtitles?.style

  const transcribe = async () => {
    setBusy(true); setError('')
    try {
      const result = await window.electron.transcribeVideo(project.videoPath)
      setSubtitles({ cues: regroupCues(result.cues, wordsPerBlock), originalCues: result.cues.map(cue => ({ ...cue })), style: subtitles?.style || { x: 50, y: 82, fontSize: 5.5, color: '#ffffff', shadowColor: '#000000', fontFamily: 'Arial', background: 'box', position: 'bottom' } })
    } catch (err: any) { setError(err?.message || 'Trascrizione non riuscita.') }
    finally { setBusy(false) }
  }
  const position = (value: SubtitleStyle['position']) => {
    if (!style) return
    const y = value === 'top' ? 18 : value === 'center' ? 50 : value === 'bottom' ? 82 : style.y
    updateStyle({ position: value, y })
  }
  const capitalizeAll = () => {
    if (!subtitles) return
    setSubtitles({ ...subtitles, cues: subtitles.cues.map(cue => ({
      ...cue,
      text: cue.text.toLocaleLowerCase('it-IT').replace(/(^|\s|[-–—])([\p{L}])/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('it-IT')}`),
    })) })
  }
  const uppercaseAll = () => {
    if (!subtitles) return
    setSubtitles({ ...subtitles, cues: subtitles.cues.map(cue => ({ ...cue, text: cue.text.toUpperCase() })) })
  }
  const resetToWhisper = () => {
    if (!subtitles?.originalCues) return
    setSubtitles({ ...subtitles, cues: subtitles.originalCues.map(cue => ({ ...cue })) })
  }

  return createPortal(<Backdrop onMouseDown={onClose}><Modal onMouseDown={e => e.stopPropagation()}>
    <Header><Title>Sottotitoli</Title><Button onClick={onClose}>Chiudi</Button></Header>
    <Content>
      <Row><Button $primary onClick={transcribe} disabled={busy}>{busy ? 'Whisper sta trascrivendo…' : subtitles ? 'Rigenera con Whisper' : 'Genera con Whisper'}</Button><span style={{ color:'#9ca3af', fontSize:12 }}>Whisper.cpp lavora localmente sul tuo Mac.</span></Row>
      {error && <Error>{error}</Error>}
      {subtitles && <Row>
        <Button onClick={capitalizeAll}>Capitalizza</Button>
        <Button onClick={uppercaseAll}>Uppercase</Button>
        <Button onClick={resetToWhisper} disabled={!subtitles.originalCues} title={subtitles.originalCues ? 'Ripristina la trascrizione originale di Whisper' : 'Rigenera i sottotitoli con Whisper per usare Reset'}>Reset</Button>
      </Row>}
      {style && <Row>
        <Label>Parole per blocco<input type="number" min="1" max="12" value={wordsPerBlock} onChange={e => setWordsPerBlock(Math.max(1, Math.min(12, +e.target.value || 1)))} onBlur={() => subtitles && setSubtitles({ ...subtitles, cues: regroupCues(subtitles.cues, wordsPerBlock) })} /></Label>
        <Label>Posizione<select value={style.position} onChange={e => position(e.target.value as SubtitleStyle['position'])}><option value="top">In alto</option><option value="center">Al centro</option><option value="bottom">In basso</option><option value="custom">Personalizzata</option></select></Label>
        <Label>Dimensione<input type="range" min="3" max="10" step=".5" value={style.fontSize} onChange={e => updateStyle({ fontSize:+e.target.value })} /></Label>
        <Label>Font<select value={style.fontFamily || 'Arial'} onChange={e => updateStyle({ fontFamily:e.target.value })}>{fontOptions.map(font => <option key={font} value={font}>{font}</option>)}</select></Label>
        <Label>Colore<input type="color" value={style.color} onChange={e => updateStyle({ color:e.target.value })} /></Label>
        <Label>Ombra<input type="color" value={style.shadowColor || '#000000'} onChange={e => updateStyle({ shadowColor:e.target.value })} /></Label>
        <Label>Sfondo<select value={style.background} onChange={e => updateStyle({ background:e.target.value as 'none'|'box' })}><option value="box">Riquadro</option><option value="none">Nessuno</option></select></Label>
      </Row>}
      {subtitles && <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ fontSize:11, color:'#9ca3af' }}>{subtitles.cues.length} blocchi — trascinali nella timeline per spostarli o ridimensionarli. Un ritorno a capo divide il blocco.</div>
        {subtitles.cues.map(cue => <Cue key={cue.id}>
          <div style={{fontFamily:'monospace',fontSize:11,color:'#9ca3af'}}>{fmt(cue.start)}–{fmt(cue.end)}</div>
          <TextInput value={cue.text} onChange={e => updateSubtitle(cue.id, { text:e.target.value })} onBlur={e => {
            const lines = e.currentTarget.value.split(/\n+/).map(line => line.trim()).filter(Boolean)
            if (lines.length > 1) {
              const totalWords = lines.reduce((total, line) => total + Math.max(1, line.split(/\s+/).length), 0)
              let elapsed = cue.start
              const replacement = lines.map((line, index) => {
                const portion = Math.max(1, line.split(/\s+/).length) / totalWords
                const end = index === lines.length - 1 ? cue.end : elapsed + (cue.end - cue.start) * portion
                const item = { id: index === 0 ? cue.id : uuidv4(), start: elapsed, end, text: line }
                elapsed = end
                return item
              })
              setSubtitles({ ...subtitles, cues: subtitles.cues.flatMap(item => item.id === cue.id ? replacement : [item]) })
            }
          }} aria-label="Testo sottotitolo" />
          <Button onClick={() => deleteSubtitle(cue.id)} title="Elimina">×</Button>
        </Cue>)}
      </div>}
    </Content>
  </Modal></Backdrop>, document.body)
}
