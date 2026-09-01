import path from 'path'

/**
 * Native executables cannot be spawned from Electron's app.asar archive.
 * electron-builder places paths matched by `asarUnpack` beside it in
 * app.asar.unpacked; keep development paths unchanged.
 */
export function executablePath(binaryPath: string): string {
  if (!process.resourcesPath) return binaryPath

  const asarSegment = `${path.sep}app.asar${path.sep}`
  if (!binaryPath.includes(asarSegment)) return binaryPath

  return binaryPath.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`)
}
