import { describe, it, expect } from 'vitest'
import { fileUrl } from '../src/utils/fileUrl'
describe('local media URLs', () => {
  it.each([
    ['C:\\Users\\Matteo\\video à #1%.mp4', 'file:///C:/Users/Matteo/video%20%C3%A0%20%231%25.mp4'],
    ['/Users/matteo/video #1?.mp4', 'file:///Users/matteo/video%20%231%3F.mp4'],
    ['\\\\server\\share\\my video.mp4', 'file://server/share/my%20video.mp4'],
  ])('encodes %s', (input, expected) => expect(fileUrl(input)).toBe(expected))
})
