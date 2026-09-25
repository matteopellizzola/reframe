import { execFile } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { promises as fs } from 'fs'
import { get } from 'https'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const MODEL_NAME = 'ggml-small.bin'
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`

// These are self-contained whisper.cpp builds: no Homebrew, Python, compiler,
// or other user-installed runtime is needed. The runtime is cached after the
// first download, alongside Reframe's own data.
const RUNTIME_URLS: Record<string, string> = {
  arm64: 'https://github.com/sjoerdteunisse/whisper.cpp/releases/download/v1.0.0/whisper-cpp-darwin-arm64.zip',
  x64: 'https://github.com/sjoerdteunisse/whisper.cpp/releases/download/v1.0.0/whisper-cpp-darwin-x64.zip',
}

export type WhisperStatus = {
  phase: 'checking' | 'downloading-runtime' | 'installing-runtime' | 'downloading-model' | 'ready'
  downloadedBytes?: number
  totalBytes?: number
}

export type StatusReporter = (status: WhisperStatus) => void

let installation: Promise<{ cliPath: string; modelPath: string }> | null = null

function runtimeDirectory() {
  return path.join(os.homedir(), '.reframe', 'whisper')
}

function cliPath() {
  return path.join(runtimeDirectory(), 'whisper-cli')
}

function modelPath() {
  return path.join(runtimeDirectory(), MODEL_NAME)
}

/**
 * whisper.cpp release archives have changed their binary name over time.
 * Keep the rest of the app on the stable `whisper-cli` path while accepting
 * both the historical name and platform-specific release names.
 */
async function findWhisperExecutable(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { recursive: true })
  const candidates = entries
    .filter((entry) => {
      const name = path.basename(entry)
      return !path.extname(name) && (name === 'whisper-cli' || /^whisper(?:-cpp)?(?:-|$)/.test(name))
    })
    .map((entry) => path.join(dir, entry))

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) return candidate
    } catch {
      // Ignore entries that disappear while an incomplete archive is cleaned up.
    }
  }

  return null
}

async function download(url: string, destination: string, report?: (downloadedBytes: number, totalBytes?: number) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = get(url, { headers: { 'User-Agent': 'Reframe' } }, (response) => {
      const redirect = response.headers.location
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && redirect) {
        response.resume()
        const nextUrl = new URL(redirect, url).toString()
        download(nextUrl, destination, report).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Download Whisper non riuscito (HTTP ${response.statusCode ?? 'errore'}).`))
        return
      }
      const totalBytes = Number(response.headers['content-length']) || undefined
      let downloadedBytes = 0
      response.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length
        report?.(downloadedBytes, totalBytes)
      })
      const output = createWriteStream(destination)
      response.pipe(output)
      output.on('finish', () => output.close(() => resolve()))
      output.on('error', reject)
    })
    request.on('error', reject)
  })
}

async function installRuntime(reportStatus: StatusReporter = () => {}): Promise<{ cliPath: string; modelPath: string }> {
  if (process.platform === 'win32') {
    reportStatus({ phase: 'checking' })
    const runtime = await bundledWindowsRuntime(process.resourcesPath, process.arch)
    // Unknown or failed CPU probes always retain the compatible baseline.
    const probe = await execFileAsync(path.join(process.resourcesPath, 'whisper', 'whisper-cpu.exe'), [], {
      windowsHide: true, timeout: 10_000,
    }).then(result => result.stdout.trim()).catch(() => 'baseline')
    runtime.cliPath = windowsWhisperCli(path.join(process.resourcesPath, 'whisper'), probe)
    reportStatus({ phase: 'ready' })
    return runtime
  }
  if (process.platform !== 'darwin') throw new Error('Trascrizione supportata su macOS e Windows x64.')
  const dir = runtimeDirectory()
  const executable = cliPath()
  const model = modelPath()
  await fs.mkdir(dir, { recursive: true })
  reportStatus({ phase: 'checking' })

  if (!existsSync(executable)) {
    const runtimeUrl = RUNTIME_URLS[process.arch]
    if (!runtimeUrl) throw new Error(`Whisper non è disponibile per l'architettura ${process.arch}.`)
    const archive = path.join(dir, `whisper-${process.arch}.zip`)
    try {
      await download(runtimeUrl, archive, (downloadedBytes, totalBytes) => reportStatus({ phase: 'downloading-runtime', downloadedBytes, totalBytes }))
      reportStatus({ phase: 'installing-runtime' })
      // ditto is supplied by macOS and correctly preserves executable bits.
      await execFileAsync('/usr/bin/ditto', ['-x', '-k', archive, dir])
      const discoveredPath = await findWhisperExecutable(dir)
      if (!discoveredPath) {
        throw new Error('L’archivio Whisper non contiene un eseguibile compatibile.')
      }
      if (discoveredPath !== executable) await fs.rename(discoveredPath, executable)
      await fs.chmod(executable, 0o755)
    } finally {
      await fs.rm(archive, { force: true }).catch(() => {})
    }
  }

  if (!existsSync(model)) {
    const partial = `${model}.download`
    try {
      await download(MODEL_URL, partial, (downloadedBytes, totalBytes) => reportStatus({ phase: 'downloading-model', downloadedBytes, totalBytes }))
      await fs.rename(partial, model)
    } finally {
      await fs.rm(partial, { force: true }).catch(() => {})
    }
  }

  reportStatus({ phase: 'ready' })
  return { cliPath: executable, modelPath: model }
}

export function ensureWhisperRuntime(reportStatus?: StatusReporter) {
  installation ??= installRuntime(reportStatus).catch((error) => {
    installation = null
    throw error
  })
  return installation
}

/** Windows ships a static CPU runtime and multilingual model, ready offline. */
export async function bundledWindowsRuntime(resourcesPath: string, arch: string) {
  if (arch !== 'x64') throw new Error('Questa versione di Whisper richiede Windows a 64 bit (x64).')
  const dir = path.join(resourcesPath, 'whisper')
  const runtime = { cliPath: path.join(dir, 'whisper-cli-baseline.exe'), modelPath: path.join(dir, MODEL_NAME) }
  for (const file of [...Object.values(runtime), path.join(dir, 'whisper-cli.exe'), path.join(dir, 'whisper-cpu.exe')]) {
    const stat = await fs.stat(file).catch(() => null)
    if (!stat?.isFile() || stat.size === 0) {
      throw new Error('Installazione Whisper incompleta. Reinstalla Reframe con il pacchetto Windows completo.')
    }
  }
  return runtime
}

export function windowsWhisperCli(dir: string, cpu: string): string {
  return path.join(dir, cpu === 'avx2' ? 'whisper-cli.exe' : 'whisper-cli-baseline.exe')
}
