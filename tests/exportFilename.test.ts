import path from 'path'
import { describe, expect, it } from 'vitest'
import { getExportOutputPaths, getSliceOutputPath, normalizeExportPath } from '../electron/exportFilename'

describe('export filenames', () => {
  it('keeps the chosen filename for a single export', () => {
    expect(getSliceOutputPath(path.join('/exports', 'My video.mp4'), 0, 1)).toBe(path.join('/exports', 'My video.mp4'))
  })

  it('uses three-digit suffixes for multiple slices', () => {
    expect(getExportOutputPaths(path.join('/exports', 'My video.mp4'), 3)).toEqual([
      path.join('/exports', 'My video_001.mp4'),
      path.join('/exports', 'My video_002.mp4'),
      path.join('/exports', 'My video_003.mp4'),
    ])
  })

  it('keeps batch filenames naturally sortable beyond 999 slices', () => {
    expect(getSliceOutputPath(path.join('/exports', 'My video.mp4'), 0, 1000)).toBe(path.join('/exports', 'My video_0001.mp4'))
    expect(getSliceOutputPath(path.join('/exports', 'My video.mp4'), 999, 1000)).toBe(path.join('/exports', 'My video_1000.mp4'))
  })

  it('normalizes a selected extension to MP4', () => {
    expect(normalizeExportPath(path.join('/exports', 'My video.mov'))).toBe(path.join('/exports', 'My video.mp4'))
    expect(normalizeExportPath(path.join('/exports', 'My video'))).toBe(path.join('/exports', 'My video.mp4'))
  })
})
