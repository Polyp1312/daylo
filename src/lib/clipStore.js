const DB_NAME    = 'daylo_clips'
const STORE      = 'clips'
const DB_VERSION = 1
const MAX_CLIP_AGE_DAYS = 2  // auto-purge clips older than 2 days

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db    = e.target.result
      const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      store.createIndex('by_date', 'date', { unique: false })
    }
    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror   = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB blocked — anderer Tab hat die DB offen'))
  })
}

const todayKey = () => new Date().toISOString().slice(0, 10)

function cutoffKey() {
  const d = new Date()
  d.setDate(d.getDate() - MAX_CLIP_AGE_DAYS)
  return d.toISOString().slice(0, 10)
}

export async function saveClip({ blob, thumbUrl, duration }) {
  const db  = await openDB()
  await purgeOldClips(db)
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).add({ blob, thumbUrl, duration, date: todayKey() })
    req.onsuccess = () => resolve(req.result)
    tx.onerror    = () => reject(tx.error)
  })
}

export async function loadTodayClips() {
  const db    = await openDB()
  const today = todayKey()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).index('by_date').getAll(today)
    req.onsuccess = () => {
      const clips = req.result.map(c => ({
        idbId:    c.id,
        blob:     c.blob,
        thumbUrl: c.thumbUrl,
        duration: c.duration,
        url:      URL.createObjectURL(c.blob),
      }))
      resolve(clips)
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteClips(ids) {
  if (!ids?.length) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    for (const id of ids) st.delete(id)
    tx.oncomplete = resolve
    tx.onerror    = () => reject(tx.error)
  })
}

// Remove clips older than MAX_CLIP_AGE_DAYS (called automatically on save)
async function purgeOldClips(db) {
  const cutoff = cutoffKey()
  return new Promise((resolve) => {
    const tx     = db.transaction(STORE, 'readwrite')
    const index  = tx.objectStore(STORE).index('by_date')
    const range  = IDBKeyRange.upperBound(cutoff, true)  // exclusive upper bound
    const cursor = index.openCursor(range)
    cursor.onsuccess = e => {
      const c = e.target.result
      if (c) { c.delete(); c.continue() }
    }
    tx.oncomplete = resolve
    tx.onerror    = resolve  // non-fatal
  })
}
