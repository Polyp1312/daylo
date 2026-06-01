const DB_NAME = 'daylo_clips'
const STORE   = 'clips'

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    r.onsuccess = e => res(e.target.result)
    r.onerror   = () => rej(r.error)
  })
}

const todayKey = () => new Date().toISOString().slice(0, 10)

export async function saveClip({ blob, thumbUrl, duration }) {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).add({ blob, thumbUrl, duration, date: todayKey() })
    req.onsuccess = () => res(req.result)
    tx.onerror    = () => rej(tx.error)
  })
}

export async function loadTodayClips() {
  const db    = await openDB()
  const today = todayKey()
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const clips = req.result
        .filter(c => c.date === today)
        .map(c => ({
          idbId:    c.id,
          blob:     c.blob,
          thumbUrl: c.thumbUrl,
          duration: c.duration,
          url:      URL.createObjectURL(c.blob),
        }))
      res(clips)
    }
    tx.onerror = () => rej(tx.error)
  })
}

export async function deleteClips(ids) {
  if (!ids || !ids.length) return
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    ids.forEach(id => st.delete(id))
    tx.oncomplete = res
    tx.onerror    = () => rej(tx.error)
  })
}
