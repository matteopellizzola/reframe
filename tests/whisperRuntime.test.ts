import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bundledWindowsRuntime } from '../electron/whisperRuntime'
const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))) })
async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reframe à #'))
  dirs.push(dir)
  await fs.mkdir(path.join(dir, 'whisper'))
  return dir
}
describe('bundled Windows Whisper', () => {
  it('resolves runtime and model in paths with spaces and Unicode', async () => {
    const dir = await fixture()
    await fs.writeFile(path.join(dir, 'whisper/whisper-cli.exe'), 'runtime')
    await fs.writeFile(path.join(dir, 'whisper/ggml-small.bin'), 'model')
    expect(await bundledWindowsRuntime(dir, 'x64')).toEqual({ cliPath: path.join(dir, 'whisper/whisper-cli.exe'), modelPath: path.join(dir, 'whisper/ggml-small.bin') })
  })
  it('rejects unsupported architectures', async () => {
    await expect(bundledWindowsRuntime('unused', 'arm64')).rejects.toThrow('x64')
  })
  it('explains how to repair missing or empty model files', async () => {
    const dir = await fixture()
    await fs.writeFile(path.join(dir, 'whisper/whisper-cli.exe'), 'runtime')
    await expect(bundledWindowsRuntime(dir, 'x64')).rejects.toThrow('Reinstalla')
    await fs.writeFile(path.join(dir, 'whisper/ggml-small.bin'), '')
    await expect(bundledWindowsRuntime(dir, 'x64')).rejects.toThrow('Reinstalla')
  })
})
