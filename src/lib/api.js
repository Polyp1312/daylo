const TOKEN_KEY = 'daylo_token'

export function getToken()  { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken(){ localStorage.removeItem(TOKEN_KEY) }

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return res.json()
}

export const api = {
  register:       (email, password, username) => req('POST',   '/api/auth/register',      { email, password, username }),
  verify:         (email, code)               => req('POST',   '/api/auth/verify',        { email, code }),
  login:          (email, password)           => req('POST',   '/api/auth/login',         { email, password }),
  me:             ()                          => req('GET',    '/api/auth/me'),
  updateUsername: (username)                  => req('PUT',    '/api/auth/username',      { username }),
  search:         (q)                         => req('GET',    `/api/users/search?q=${encodeURIComponent(q)}`),
  friends: {
    list:     ()             => req('GET',    '/api/friends'),
    requests: ()             => req('GET',    '/api/friends/requests'),
    request:  (targetId)    => req('POST',   '/api/friends/request',   { targetId }),
    accept:   (requesterId) => req('POST',   '/api/friends/accept',    { requesterId }),
    decline:  (requesterId) => req('POST',   '/api/friends/decline',   { requesterId }),
    remove:   (id)          => req('DELETE', `/api/friends/${id}`),
  },
  presence: {
    ping: ()    => req('POST', '/api/presence/ping'),
    get:  (ids) => ids.length
      ? req('GET', `/api/presence?ids=${ids.join(',')}`)
      : Promise.resolve({ presences: {} }),
  },
  notifications: {
    list:     () => req('GET',  '/api/notifications'),
    markRead: () => req('POST', '/api/notifications/mark-read'),
  },
}
