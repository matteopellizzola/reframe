/** Encode file paths without treating #, %, or ? as URL syntax. */
export function fileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const encoded = normalized.split('/').map(encodeURIComponent).join('/')
  if (normalized.startsWith('//')) return `file:${encoded}`
  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${normalized.slice(0, 2)}${encoded.slice(4)}`
  return `file://${encoded}`
}
