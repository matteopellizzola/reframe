import { test, expect, _electron as electron } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

test('installed first launch: video, persistence and real offline Whisper', async () => {
  const executablePath = process.env.REFRAME_WINDOWS_EXE
  if (!executablePath) throw new Error('REFRAME_WINDOWS_EXE must point to the installed app')
  const fixtureDir = path.resolve('.windows-smoke', 'video à # 100%')
  mkdirSync(fixtureDir, { recursive: true })
  const videoPath = path.join(fixtureDir, 'speech #1.mp4')
  const ffmpegPath = path.join(path.dirname(executablePath), 'resources/app.asar.unpacked/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe')
  execFileSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=25', '-i', path.resolve('.windows-smoke/jfk.wav'), '-shortest', '-c:v', 'libx264', '-c:a', 'aac', videoPath], { windowsHide: true })
  const app = await electron.launch({ executablePath, env: { ...process.env, HEADLESS_E2E: '1' } })
  try {
    // Block main-process HTTPS too: a bundled runtime must work without downloads.
    await app.evaluate(() => {
      const https = process.getBuiltinModule('https')
      https.get = () => { throw new Error('Network forbidden in offline first-launch test') }
    })
    const page = await app.firstWindow()
    await page.context().setOffline(true)
    await page.waitForLoadState('domcontentloaded')
    const metadata = await page.evaluate(p => window.electron.getVideoMetadata(p), videoPath)
    expect(metadata.width).toBe(320)
    expect(metadata.duration).toBeGreaterThan(5)
    const cues = await page.evaluate(async p => (await window.electron.transcribeVideo(p)).cues, videoPath)
    expect(cues.length).toBeGreaterThan(0)
    expect(cues.map(c => c.text).join(' ').toLowerCase()).toContain('country')
    expect(cues.every(c => Number.isFinite(c.start) && c.end > c.start)).toBe(true)
    const data = { basePath: fixtureDir, projects: [], videos: [] }
    await page.evaluate(d => window.electron.saveAppData(d), data)
    expect(await page.evaluate(() => window.electron.loadAppData())).toEqual(data)
    // Real Chromium file decoding with Windows escaping, not a mocked video element.
    const fileUrl = (await import('../../src/utils/fileUrl')).fileUrl(videoPath)
    const dimensions = await page.evaluate(url => new Promise<number>((resolve, reject) => {
      const video = document.createElement('video')
      video.onloadeddata = () => resolve(video.videoWidth)
      video.onerror = () => reject(new Error('Video decoding failed'))
      video.src = url
      video.load()
    }), fileUrl)
    expect(dimensions).toBe(320)
    const outputPath = path.join(fixtureDir, 'export à #1.mp4')
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
    }, outputPath)
    const exported = await page.evaluate(async ({ videoPath, cues, fixtureDir }) => window.electron.exportVideo({
      basePath: fixtureDir, projectName: 'Windows smoke',
      project: { videoPath, videoWidth: 320, videoHeight: 180, videoFps: 25,
        outputWidth: 320, outputHeight: 180, outputRatio: 'custom',
        trim: { start: 0, end: 2 }, keyframes: [], slices: [], editMode: 'subtitles',
        subtitles: { cues, style: { x: 50, y: 82, fontSize: 5, color: '#ffffff',
          shadowColor: '#000000', fontFamily: 'Arial', background: 'box', position: 'bottom' } },
      },
    }), { videoPath, cues, fixtureDir })
    expect(exported).toBe(outputPath)
    const exportedMeta = await page.evaluate(p => window.electron.getVideoMetadata(p), outputPath)
    expect(exportedMeta.width).toBe(320)
    expect(exportedMeta.duration).toBeGreaterThanOrEqual(1.9)
    await page.screenshot({ path: 'test-results/windows-first-launch.png' })
  } finally {
    await app.close()
  }
})
