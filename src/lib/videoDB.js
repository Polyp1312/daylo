const DB_NAME = 'daylo-videos'
const STORE   = 'clips'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

export async function saveVlogClips(vlogId, clips) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(clips, String(vlogId))
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

export async function loadVlogClips(vlogId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(String(vlogId))
    req.onsuccess = e => resolve(e.target.result ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}

export async function deleteVlogClips(vlogId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(String(vlogId))
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}
