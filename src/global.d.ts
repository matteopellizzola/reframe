interface ElectronAPI {
  loadAppData: () => Promise<import('./types').AppData>
  saveAppData: (data: import('./types').AppData) => Promise<void>
  openFile: () => Promise<string | null>
  getPathForFile: (file: File) => string
  getVideoMetadata: (path: string) => Promise<{
    width: number
    height: number
    duration: number
    fps: number
    rotation: number
  }>
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; newPath: string }>
  exportVideo: (args: any) => Promise<string | null>
  cancelExport: (jobId: string, sliceId?: string) => Promise<boolean>
  onExportProgress: (cb: (payload: any) => void) => () => void
  onExportDone: (cb: (payload: any) => void) => () => void
  showInFolder: (path: string) => void
  selectDirectory: () => Promise<string | null>
  ensureDirectory: (path: string) => Promise<void>
  removeDirectory: (path: string) => Promise<void>
  transcribeVideo: (path: string) => Promise<{ cues: import('./types').SubtitleCue[] }>
  onWhisperStatus: (cb: (status: WhisperStatus) => void) => () => void
}

interface WhisperStatus {
  phase: 'checking' | 'downloading-runtime' | 'installing-runtime' | 'downloading-model' | 'ready'
  downloadedBytes?: number
  totalBytes?: number
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
