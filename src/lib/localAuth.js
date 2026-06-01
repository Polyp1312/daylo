const USERS_KEY = 'daylo_users'
const SESSION_KEY = 'daylo_session'
const listeners = []

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]') } catch { return [] }
}
function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)) }
function getStoredSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) }
function clearSession() { localStorage.removeItem(SESSION_KEY) }
function notify(event, session) { listeners.forEach(fn => fn(event, session)) }

export const localAuth = {
  getSession() {
    return Promise.resolve({ data: { session: getStoredSession() }, error: null })
  },

  signUp({ email, password, username }) {
    const users = getUsers()
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
      return Promise.resolve({ data: null, error: { message: 'E-Mail bereits registriert.' } })
    if (users.find(u => u.username?.toLowerCase() === username?.toLowerCase()))
      return Promise.resolve({ data: null, error: { message: 'Dieser Nutzername ist bereits vergeben.' } })
    const code = String(Math.floor(100000 + Math.random() * 900000))
    users.push({ id: crypto.randomUUID(), email, password, username, verified: false, code })
    saveUsers(users)
    return Promise.resolve({ data: { pendingCode: code }, error: null })
  },

  verifyCode({ email, code }) {
    const users = getUsers()
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase())
    if (idx === -1) return Promise.resolve({ data: null, error: { message: 'Benutzer nicht gefunden.' } })
    if (users[idx].code !== code) return Promise.resolve({ data: null, error: { message: 'Falscher Code. Bitte erneut versuchen.' } })
    users[idx].verified = true
    saveUsers(users)
    const session = { user: { id: users[idx].id, email: users[idx].email, username: users[idx].username } }
    saveSession(session)
    notify('SIGNED_IN', session)
    return Promise.resolve({ data: session, error: null })
  },

  signInWithPassword({ email, password }) {
    const users = getUsers()
    const u = users.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (!u) return Promise.resolve({ data: null, error: { message: 'Kein Konto mit dieser E-Mail gefunden.' } })
    if (u.password !== password) return Promise.resolve({ data: null, error: { message: 'Falsches Passwort.' } })
    if (!u.verified) return Promise.resolve({ data: null, error: { message: 'Bitte bestätige zuerst deine E-Mail.' } })
    const session = { user: { id: u.id, email: u.email, username: u.username } }
    saveSession(session)
    notify('SIGNED_IN', session)
    return Promise.resolve({ data: session, error: null })
  },

  signOut() {
    clearSession()
    notify('SIGNED_OUT', null)
    return Promise.resolve({ error: null })
  },

  onAuthStateChange(callback) {
    listeners.push(callback)
    return {
      data: {
        subscription: {
          unsubscribe() {
            const i = listeners.indexOf(callback)
            if (i > -1) listeners.splice(i, 1)
          }
        }
      }
    }
  }
}
