import path from 'path'
import os from 'os'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { ensureWhisperRuntime, type StatusReporter } from './whisperRuntime'

export async function transcribeVideo(filePath: string, ffmpegPath: string, reportStatus?: StatusReporter) {
  const tempDir = path.join(os.tmpdir(), `reframe-whisper-${randomUUID()}`)
  const wavPath = path.join(tempDir, 'audio.wav')
  const outputBase = path.join(tempDir, 'transcript')
  await fs.promises.mkdir(tempDir, { recursive: true })
  try {
    const { modelPath, cliPath } = await ensureWhisperRuntime(reportStatus)
    await new Promise<void>((resolve, reject) => {
      execFile(ffmpegPath, ['-y', '-i', filePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavPath], {
        windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024,
      }, (error, _stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve())
    })
    await new Promise<void>((resolve, reject) => {
      // Metal is unstable with the current Homebrew runtime on some Apple Silicon
      // configurations. CPU/Accelerate is reliable and still fully local.
      execFile(cliPath, ['--model', modelPath, '--file', wavPath, '--output-json', '--output-file', outputBase, '--language', 'auto', '--no-prints', '--no-gpu'], {
        windowsHide: true, timeout: 60 * 60 * 1000,
        maxBuffer: 10 * 1024 * 1024,
      }, (error, _stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve())
    })
    const jsonPath = `${outputBase}.json`
    const raw = JSON.parse(await fs.promises.readFile(jsonPath, 'utf8'))
    const cues = (raw.transcription || raw.segments || []).map((segment: any) => ({
      id: randomUUID(),
      start: Number(segment.offsets?.from ?? segment.start ?? 0) / (segment.offsets ? 1000 : 1),
      end: Number(segment.offsets?.to ?? segment.end ?? 0) / (segment.offsets ? 1000 : 1),
      text: String(segment.text || '').trim(),
    })).filter((cue: any) => cue.text && cue.end > cue.start)
    return { cues }
  } catch (error: any) {
    throw new Error(error?.message || 'Trascrizione non riuscita.')
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
