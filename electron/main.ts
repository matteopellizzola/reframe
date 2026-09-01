import { app, BrowserWindow, ipcMain, dialog, shell, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { exportVideo, cancelExport, cancelExportBySliceId } from './export'
import { randomUUID } from 'crypto'
import os from 'os'
// @ts-ignore
import ffprobe from 'ffprobe-static'
// @ts-ignore
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { ensureWhisperRuntime } from './whisperRuntime'
import { executablePath } from './binaries'

let mainWindow: BrowserWindow | null = null

function parseFps(rate: string | undefined): number {
  if (!rate) return 30
  const parts = rate.split('/')
  if (parts.length === 2) {
    const num = parseFloat(parts[0])
    const den = parseFloat(parts[1])
    if (den > 0) return num / den
  }
  const parsed = parseFloat(rate)
  return isNaN(parsed) ? 30 : parsed
}

function getFFprobePath(): string {
  return executablePath(ffprobe.path)
}

function getFfmpegPath(): string {
  return executablePath(ffmpegInstaller.path)
}

// Centralized data store in ~/.reframe/data.json
let dataDirInitialized = false

async function getDataPath(): Promise<string> {
  const dir = path.join(os.homedir(), '.reframe')
  if (!dataDirInitialized) {
    try {
      await fs.promises.access(dir)
    } catch {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    dataDirInitialized = true
  }
  return path.join(dir, 'data.json')
}

async function loadAppData(): Promise<any> {
  const p = await getDataPath()
  try {
    await fs.promises.access(p)
    const data = JSON.parse(await fs.promises.readFile(p, 'utf-8'))
    // Ensure basePath exists for legacy data
    if (!data.hasOwnProperty('basePath')) {
      data.basePath = null
    }
    return data
  } catch {
    return { basePath: null, projects: [], videos: [] }
  }
}

async function saveAppData(data: any): Promise<void> {
  const p = await getDataPath()
  await fs.promises.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
}

function createWindow() {
  const isHeadless = process.env.HEADLESS_E2E === '1'

  // Don't check screen size in headless — it can hang
  const winWidth = isHeadless ? 1280 : screen.getPrimaryDisplay().workAreaSize.width
  const winHeight = isHeadless ? 800 : screen.getPrimaryDisplay().workAreaSize.height

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0e0e0e',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: true, // 👈 always show — Xvfb provides the display in CI
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:8000')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  // In test mode, let Playwright control the lifecycle
  if (process.env.NODE_ENV === 'test') return
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── IPC: App Data ──────────────────────────────────────────

ipcMain.handle('load-app-data', async () => {
  return await loadAppData()
})

ipcMain.handle('save-app-data', async (_event, data: any) => {
  await saveAppData(data)
})

// ── IPC: File operations ───────────────────────────────────

ipcMain.handle('open-file', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mts', 'm2ts'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('get-video-metadata', async (_event, filePath: string) => {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFFprobePath()
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]
    execFile(ffprobePath, args, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      try {
        const data = JSON.parse(stdout)
        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video')
        if (!videoStream) {
          reject(new Error('No video stream found'))
          return
        }
        resolve({
          width: videoStream.width,
          height: videoStream.height,
          duration: parseFloat(data.format?.duration || videoStream.duration || '0'),
          // `r_frame_rate` is the codec time base and can be misleading for
          // variable-frame-rate footage. Prefer the actual average frame rate
          // so the renderer captures and the export are paced like the source.
          fps: parseFps(videoStream.avg_frame_rate || videoStream.r_frame_rate),
        })
      } catch (e) {
        reject(e)
      }
    })
  })
})

// Local whisper.cpp transcription. Video audio is converted to the 16 kHz mono
// WAV input expected by whisper.cpp; no audio ever leaves the Mac.
ipcMain.handle('transcribe-video', async (_event, filePath: string) => {
  const tempDir = path.join(os.tmpdir(), `reframe-whisper-${randomUUID()}`)
  const wavPath = path.join(tempDir, 'audio.wav')
  const outputBase = path.join(tempDir, 'transcript')
  await fs.promises.mkdir(tempDir, { recursive: true })
  try {
    const { modelPath, cliPath } = await ensureWhisperRuntime()
    await new Promise<void>((resolve, reject) => {
      execFile(getFfmpegPath(), ['-y', '-i', filePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavPath], {
        timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024,
      }, (error, _stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve())
    })
    await new Promise<void>((resolve, reject) => {
      // Metal is unstable with the current Homebrew runtime on some Apple Silicon
      // configurations. CPU/Accelerate is reliable and still fully local.
      execFile(cliPath, ['--model', modelPath, '--file', wavPath, '--output-json', '--output-file', outputBase, '--language', 'auto', '--no-prints', '--no-gpu'], {
        timeout: 60 * 60 * 1000,
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
})


ipcMain.handle('export-video', async (_event, args) => {
  if (!mainWindow) return null
  const { basePath, videoId } = args
  // Destination is intentionally requested for every export. The project root
  // remains a convenient starting location, but never decides the result.
  const destination = await dialog.showOpenDialog(mainWindow, {
    title: 'Scegli la cartella di destinazione',
    defaultPath: basePath || undefined,
    properties: ['openDirectory', 'createDirectory'],
  })
  if (destination.canceled || destination.filePaths.length === 0) return null
  try {
    await fs.promises.mkdir(destination.filePaths[0], { recursive: true })
    const safeVideoId = String(videoId || 'reframe-export').replace(/[^a-zA-Z0-9-_]/g, '-')
    // A unique base prevents a new export from deleting or overwriting files
    // already present in a user-selected folder.
    const existingNames = new Set(await fs.promises.readdir(destination.filePaths[0]))
    let suffix = 0
    let baseName = safeVideoId
    while ([...existingNames].some((name) => name === `${baseName}.mp4` || name.startsWith(`${baseName}_`))) {
      suffix += 1
      baseName = `${safeVideoId}-${suffix}`
    }
    const baseFileName = path.join(destination.filePaths[0], baseName)
    const paths = await exportVideo(args, `${baseFileName}.mp4`, mainWindow)
    return paths.join(', ')
  } catch (err: any) {
    throw new Error(err.message || 'Export failed')
  }
})

ipcMain.handle('cancel-export', async (_event, { jobId, sliceId }: { jobId?: string; sliceId?: string }) => {
  if (jobId) {
    return await cancelExport(jobId)
  }
  if (sliceId) {
    return await cancelExportBySliceId(sliceId)
  }
  return false
})

ipcMain.handle('show-in-folder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('ensure-directory', async (_event, dirPath: string) => {
  try {
    await fs.promises.access(dirPath)
  } catch {
    await fs.promises.mkdir(dirPath, { recursive: true })
  }
})

ipcMain.handle('rename-file', async (_event, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
  try {
    // Check if destination already exists
    try {
      await fs.promises.access(newPath)
      throw new Error('A file with that name already exists')
    } catch (err: any) {
      if (err.message === 'A file with that name already exists') throw err
      // File doesn't exist, proceed with rename
    }
    await fs.promises.rename(oldPath, newPath)
    return { success: true, newPath }
  } catch (err: any) {
    throw new Error(err.message || 'Failed to rename file')
  }
})

ipcMain.handle('remove-directory', async (_event, dirPath: string) => {
  try {
    await fs.promises.access(dirPath)
    await fs.promises.rm(dirPath, { recursive: true, force: true })
  } catch {
    // Directory doesn't exist or already removed
  }
})

// Save blob data to a temp file (renderer can't write to disk)
ipcMain.handle('save-temp-blob', async (_event, data: Uint8Array, ext: string) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reframe-cap-'))
  const filePath = path.join(dir, `${randomUUID()}.${ext.replace(/^\./, '')}`)
  await fs.promises.writeFile(filePath, Buffer.from(data))
  return filePath
})

// Frame-by-frame capture: create a temp directory to hold JPEG frames
ipcMain.handle('create-frame-dir', async () => {
  const dir = path.join(os.tmpdir(), `reframe-frames-${randomUUID()}`)
  await fs.promises.mkdir(dir, { recursive: true })
  return dir
})

// Frame-by-frame capture: save a single JPEG frame into an existing frame dir
ipcMain.handle('save-frame', async (_event, data: Uint8Array, dir: string, index: number) => {
  const name = `frame_${String(index).padStart(6, '0')}.jpg`
  const filePath = path.join(dir, name)
  await fs.promises.writeFile(filePath, Buffer.from(data))
  return filePath
})

export function requestPreviewCapture(payload: any): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!mainWindow) return reject(new Error('No window'))
    const replyChannel = `capture:reply:${randomUUID()}`
    payload.replyChannel = replyChannel

    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      reject(new Error('Capture timed out'))
    }, 60_000)

    ipcMain.once(replyChannel, (_ev, data) => {
      clearTimeout(timeout)
      if (data?.error) return reject(new Error(data.error))
      if (!data?.path) return reject(new Error('No capture path'))
      resolve(data.path)
    })

    mainWindow.webContents.send('capture:request', payload)
  })
}
