export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
export type TrackingFps = 15 | 30

export interface Keyframe {
  id: string
  timestamp: number
  x: number
  y: number
  scale: number
  explicitScale?: boolean
  easing: EasingType
}

export type AspectRatio = '9:16' | '4:5' | '1:1' | '16:9' | 'custom'

export interface TrimRange {
  start: number
  end: number
}

export type SliceStatus = 'keep' | 'hidden'

export interface Slice {
  id: string
  start: number
  end: number
  status: SliceStatus
}

export interface SubtitleCue {
  id: string
  start: number
  end: number
  text: string
}

export interface SubtitleStyle {
  /** Percentage position within the rendered frame. */
  x: number
  y: number
  fontSize: number
  color: string
  shadowColor: string
  fontFamily: string
  background: 'none' | 'box'
  position: 'top' | 'center' | 'bottom' | 'custom'
}

export interface Subtitles {
  cues: SubtitleCue[]
  /** Immutable Whisper result used by the editor's Reset action. */
  originalCues?: SubtitleCue[]
  style: SubtitleStyle
}

export interface ReframeProject {
  id: string
  name: string
  createdAt: number
}

export interface VideoEntry {
  id: string
  projectId: string
  videoPath: string
  videoDuration: number
  videoWidth: number
  videoHeight: number
  videoFps: number
  /** Display rotation reported by the source container (mainly phone videos). */
  sourceRotation?: number
  outputRatio: AspectRatio
  outputWidth: number
  outputHeight: number
  trim: TrimRange
  keyframes: Keyframe[]
  slices: Slice[]
  subtitles?: Subtitles
  addedAt: number
  stabilization?: {
    enabled: boolean
    smoothing?: number
  }
  /** The subtitle flow preserves the source frame and hides reframe tools. */
  editMode?: 'reframe' | 'subtitles'
}

export interface AppData {
  basePath: string | null
  projects: ReframeProject[]
  videos: VideoEntry[]
}

export interface TrackResult {
  frame: number
  t: number
  x: number
  y: number
  confident: boolean
}

export interface UntrackedRange {
  start: number
  end: number
}

export interface TrackingState {
  active: boolean
  drawingBox: boolean
  progress: number
  currentFrame: number
  totalFrames: number
  untrackedRanges: UntrackedRange[]
  results: TrackResult[]
  sliceId: string | null
  initialBbox: { x: number; y: number; w: number; h: number } | null
}

// Legacy alias — used by editorStore internally
export type Project = VideoEntry
