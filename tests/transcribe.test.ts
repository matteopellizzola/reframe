import { describe, it, expect, vi, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
const mocks = vi.hoisted(() => ({ execFile: vi.fn(), runtime: vi.fn() }))
vi.mock('child_process', () => ({ execFile: mocks.execFile }))
vi.mock('../electron/whisperRuntime', () => ({ ensureWhisperRuntime: mocks.runtime }))
import { transcribeVideo } from '../electron/transcribe'
afterEach(() => vi.resetAllMocks())
describe('real transcription orchestration', () => {
  it('converts audio, passes literal paths, parses timing and cleans temporary files', async () => {
    mocks.runtime.mockResolvedValue({ cliPath: 'C:\\Program Files\\Reframe\\whisper-cli.exe', modelPath: 'C:\\model.bin' })
    let wav = ''
    mocks.execFile.mockImplementation((exe, args, options, callback) => {
      expect(options.windowsHide).toBe(true)
      if (exe === 'ffmpeg.exe') { wav = args.at(-1); callback(null, '', '') }
      else {
        expect(args).toContain('--no-gpu')
        const output = args[args.indexOf('--output-file') + 1]
        fs.writeFile(`${output}.json`, JSON.stringify({ transcription: [
          { offsets: { from: 1200, to: 2400 }, text: ' Hello ' },
          { offsets: { from: 0, to: 0 }, text: 'invalid' },
        ] })).then(() => callback(null, '', ''), callback)
      }
    })
    const result = await transcribeVideo('C:\\video à #1.mp4', 'ffmpeg.exe')
    expect(result.cues).toEqual([{ id: expect.any(String), start: 1.2, end: 2.4, text: 'Hello' }])
    expect(mocks.execFile.mock.calls[0][1]).toContain('C:\\video à #1.mp4')
    await expect(fs.stat(wav.replace(/[\\/]audio.wav$/, ''))).rejects.toThrow()
  })
  it('surfaces audio errors without starting Whisper', async () => {
    mocks.runtime.mockResolvedValue({ cliPath: 'whisper.exe', modelPath: 'model.bin' })
    mocks.execFile.mockImplementation((exe, args, options, cb) => cb(new Error('failed'), '', 'No audio stream'))
    await expect(transcribeVideo('silent.mp4', 'ffmpeg.exe')).rejects.toThrow('No audio stream')
    expect(mocks.execFile).toHaveBeenCalledTimes(1)
  })
})
