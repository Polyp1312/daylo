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

// XHR upload so we get real upload progress events
function xhrUpload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        data.error ? reject(new Error(data.error)) : resolve(data)
      } catch { reject(new Error('Ungültige Serverantwort')) }
    }
    xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'))
    xhr.open('POST', path)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  })
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
  vlogs: {
    upload:   (formData, onProgress) => xhrUpload('/api/vlogs/upload', formData, onProgress),
    myList:   ()         => req('GET',    '/api/vlogs/my'),
    userList: (userId)   => req('GET',    `/api/vlogs/user/${userId}`),
    delete:   (id)       => req('DELETE', `/api/vlogs/${id}`),
    react:    (id, type) => req('POST',   `/api/vlogs/${id}/react`, { type }),
  },
  push: {
    vapidKey:    ()    => req('GET',    '/api/push/vapid-key'),
    subscribe:   (sub) => req('POST',   '/api/push/subscribe',   sub),
    unsubscribe: (sub) => req('DELETE', '/api/push/unsubscribe', { endpoint: sub.endpoint }),
  },
}
