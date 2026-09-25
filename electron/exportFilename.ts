import path from 'path'

/**
 * Normalizes a path selected in the save dialog to the MP4 format produced by
 * the export pipeline. A custom extension is replaced instead of producing
 * names such as "video.mov.mp4".
 */
export function normalizeExportPath(selectedPath: string): string {
  const parsed = path.parse(selectedPath)
  return path.join(parsed.dir, `${parsed.name || 'reframe-export'}.mp4`)
}

/**
 * Builds the final path for one slice. A single export retains the chosen
 * filename; a batch uses stable, naturally sortable three-digit suffixes.
 */
export function getSliceOutputPath(selectedPath: string, index: number, total: number): string {
  const normalizedPath = normalizeExportPath(selectedPath)
  if (total <= 1) return normalizedPath

  const parsed = path.parse(normalizedPath)
  const digits = Math.max(3, String(total).length)
  const suffix = String(index + 1).padStart(digits, '0')
  return path.join(parsed.dir, `${parsed.name}_${suffix}${parsed.ext}`)
}

export function getExportOutputPaths(selectedPath: string, total: number): string[] {
  return Array.from({ length: Math.max(total, 1) }, (_, index) =>
    getSliceOutputPath(selectedPath, index, total)
  )
}
