import { del, get, set } from 'idb-keyval'

/**
 * Uploaded files are kept in IndexedDB rather than localStorage: localStorage
 * caps out around 5 MB and only stores strings, while IndexedDB holds Blobs
 * directly and scales to hundreds of megabytes. The trip store keeps only the
 * lightweight metadata and refers to blobs by document id.
 */

const key = (docId) => `doc:${docId}`

export const MAX_FILE_BYTES = 25 * 1024 * 1024

export async function saveFile(docId, file) {
  await set(key(docId), file)
}

export async function loadFile(docId) {
  return get(key(docId))
}

export async function deleteFile(docId) {
  await del(key(docId))
}

/**
 * Resolve a document to an object URL. Callers must revoke the URL when done,
 * otherwise the blob is pinned in memory for the life of the page.
 */
export async function objectUrlFor(docId) {
  const blob = await loadFile(docId)
  return blob ? URL.createObjectURL(blob) : null
}

export async function downloadDoc(docId, filename) {
  const url = await objectUrlFor(docId)
  if (!url) return false
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return true
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

export function kindOf(type = '', name = '') {
  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf'))
    return 'pdf'
  return 'file'
}
