/**
 * Web Worker for export frame capture.
 * Receives ImageBitmap frames from the main thread, draws the cropped region
 * onto an OffscreenCanvas, and encodes to JPEG — all off the main thread.
 *
 * Messages IN:
 *   { type: 'init', outputWidth, outputHeight }
 *   { type: 'frame', index, bitmap (ImageBitmap), cropX, cropY, cropW, cropH }
 *   { type: 'done' }
 *
 * Messages OUT:
 *   { type: 'encoded', index, data (ArrayBuffer) }
 *   { type: 'finished' }
 *   { type: 'error', message }
 */

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null

function drawSubtitle(subtitles: any, time: number) {
  if (!canvas || !ctx || !subtitles) return
  const context = ctx
  const cue = subtitles.cues?.find((item: any) => time >= item.start && time <= item.end)
  if (!cue?.text) return
  const style = subtitles.style || {}
  const fontSize = Math.max(20, (Number(style.fontSize) || 5.5) / 100 * canvas.width)
  const x = (Number(style.x) || 50) / 100 * canvas.width
  const y = (Number(style.y) || 82) / 100 * canvas.height
  const maxWidth = canvas.width * .88
  context.save()
  context.font = `800 ${fontSize}px ${style.fontFamily || 'Arial'}, sans-serif`
  context.textAlign = 'center'; context.textBaseline = 'middle'
  const words = String(cue.text).split(/\s+/)
  const lines: string[] = []; let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (context.measureText(next).width > maxWidth && line) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  const lineHeight = fontSize * 1.15
  const top = y - ((lines.length - 1) * lineHeight) / 2
  if (style.background === 'box') {
    const widest = Math.max(...lines.map((value: string) => context.measureText(value).width))
    const padX = fontSize * .4; const padY = fontSize * .18
    context.fillStyle = 'rgba(0,0,0,.72)'
    context.fillRect(x - widest / 2 - padX, top - lineHeight / 2 - padY, widest + padX * 2, lineHeight * lines.length + padY * 2)
  }
  context.fillStyle = style.color || '#ffffff'
  context.shadowColor = style.shadowColor || '#000000'; context.shadowBlur = fontSize * .1; context.shadowOffsetY = fontSize * .04
  lines.forEach((value, i) => context.fillText(value, x, top + i * lineHeight))
  context.restore()
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data

  switch (msg.type) {
    case 'init': {
      canvas = new OffscreenCanvas(msg.outputWidth, msg.outputHeight)
      ctx = canvas.getContext('2d')!
      break
    }

    case 'frame': {
      if (!canvas || !ctx) {
        self.postMessage({ type: 'error', message: 'Worker not initialized' })
        return
      }

      try {
        const { index, bitmap, cropX, cropY, cropW, cropH, time, subtitles } = msg

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(
          bitmap,
          cropX, cropY, cropW, cropH,
          0, 0, canvas.width, canvas.height
        )
        drawSubtitle(subtitles, time)

        // Release the bitmap now that we've drawn it
        bitmap.close()

        // Encode to JPEG on this worker thread (the expensive part)
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.97 })
        const buffer = await blob.arrayBuffer()

        // Transfer the ArrayBuffer back (zero-copy)
        // Worker global postMessage supports transferables as second arg
        ;(postMessage as any)({ type: 'encoded', index, data: buffer }, [buffer])
      } catch (err: any) {
        self.postMessage({ type: 'error', message: err?.message || 'Frame encoding failed' })
      }
      break
    }

    case 'done': {
      self.postMessage({ type: 'finished' })
      break
    }
  }
}
