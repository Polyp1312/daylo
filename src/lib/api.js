const TOKEN_KEY = 'daylo_token'

export function getToken()   { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t)  { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

// Subscribers notified when a 401 response is received (e.g. to trigger logout)
const on401Handlers = new Set()
export function onUnauthorized(fn) {
  on401Handlers.add(fn)
  return () => on401Handlers.delete(fn)
}

async function req(method, path, body, signal) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  // 30s timeout for regular requests
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  const combinedSignal = signal ?? ctrl.signal

  let res
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: combinedSignal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Zeitüberschreitung — bitte erneut versuchen.')
    throw new Error('Netzwerkfehler — bitte Verbindung prüfen.')
  }
  clearTimeout(timer)

  if (res.status === 401) {
    for (const fn of on401Handlers) fn()
  }

  let data
  try { data = await res.json() } catch { data = {} }
  return data
}

function xhrUpload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status === 401) for (const fn of on401Handlers) fn()
        data.error ? reject(new Error(data.error)) : resolve(data)
      } catch { reject(new Error('Ungültige Serverantwort')) }
    }
    xhr.onerror   = () => reject(new Error('Netzwerkfehler beim Upload'))
    xhr.ontimeout = () => reject(new Error('Upload-Zeitüberschreitung'))
    xhr.timeout = 5 * 60 * 1000  // 5 min for video uploads
    xhr.open('POST', path)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  })
}

function xhrSend(path, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.onload  = () => {
      try {
        const d = JSON.parse(xhr.responseText)
        if (xhr.status === 401) for (const fn of on401Handlers) fn()
        d.error ? reject(new Error(d.error)) : resolve(d)
      } catch { reject(new Error('Fehler')) }
    }
    xhr.onerror   = () => reject(new Error('Netzwerkfehler'))
    xhr.ontimeout = () => reject(new Error('Zeitüberschreitung'))
    xhr.timeout = 30_000
    xhr.open('POST', path)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  })
}

export const api = {
  register:        (email, password, username) => req('POST',   '/api/auth/register',         { email, password, username }),
  verify:          (email, code)               => req('POST',   '/api/auth/verify',           { email, code }),
  login:           (email, password)           => req('POST',   '/api/auth/login',            { email, password }),
  forgotPassword:  (email)                     => req('POST',   '/api/auth/forgot-password',  { email }),
  resetPassword:   (email, code, password)     => req('POST',   '/api/auth/reset-password',   { email, code, password }),
  me:             ()                          => req('GET',    '/api/auth/me'),
  updateUsername: (username)                  => req('PUT',    '/api/auth/username',        { username }),
  uploadAvatar:   (formData)                  => xhrSend('/api/auth/avatar', formData),
  search:         (q, signal)                 => req('GET',    `/api/users/search?q=${encodeURIComponent(q)}`, undefined, signal),
  auth: {
    settings:       (body)                    => req('PUT',    '/api/auth/settings',        body),
    changePassword: (currentPassword, newPassword) => req('POST', '/api/auth/change-password', { currentPassword, newPassword }),
    deleteAccount:  (password)                => req('DELETE', '/api/auth/account',         { password }),
  },
  friends: {
    list:          ()             => req('GET',    '/api/friends'),
    requests:      ()             => req('GET',    '/api/friends/requests'),
    sent:          ()             => req('GET',    '/api/friends/sent'),
    request:       (targetId)    => req('POST',   '/api/friends/request',              { targetId }),
    cancelRequest: (targetId)    => req('DELETE', `/api/friends/request/${targetId}`),
    accept:        (requesterId) => req('POST',   '/api/friends/accept',               { requesterId }),
    decline:       (requesterId) => req('POST',   '/api/friends/decline',              { requesterId }),
    remove:        (id)          => req('DELETE', `/api/friends/${id}`),
  },
  users: {
    profile: (userId) => req('GET', `/api/users/${userId}/profile`),
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
    upload:    (formData, onProgress)    => xhrUpload('/api/vlogs/upload', formData, onProgress),
    myList:    (limit = 20, offset = 0)  => req('GET', `/api/vlogs/my?limit=${limit}&offset=${offset}`),
    userList:  (userId, limit = 20, offset = 0) => req('GET', `/api/vlogs/user/${userId}?limit=${limit}&offset=${offset}`),
    delete:    (id)        => req('DELETE', `/api/vlogs/${id}`),
    react:     (id, type)  => req('POST',   `/api/vlogs/${id}/react`,    { type }),
    comments:  (id)        => req('GET',    `/api/vlogs/${id}/comments`),
    addComment:(id, text)  => req('POST',   `/api/vlogs/${id}/comments`, { text }),
    reactors:  (id)        => req('GET',    `/api/vlogs/${id}/reactors`),
  },
  comments: {
    delete: (commentId) => req('DELETE', `/api/comments/${commentId}`),
  },
  groups: {
    list:         ()                => req('GET',    '/api/groups'),
    unreadCount:  ()                => req('GET',    '/api/groups/unread-count'),
    create:       (name, emoji)     => req('POST',   '/api/groups',                     { name, emoji }),
    update:       (id, body)        => req('PUT',    `/api/groups/${id}`,               body),
    delete:       (id)              => req('DELETE', `/api/groups/${id}`),
    addMember:    (groupId, userId) => req('POST',   `/api/groups/${groupId}/members`,  { userId }),
    removeMember: (groupId, userId) => req('DELETE', `/api/groups/${groupId}/members/${userId}`),
    inviteCode:   (groupId)         => req('POST',   `/api/groups/${groupId}/invite-code`),
    joinByCode:   (code)            => req('POST',   `/api/groups/join/${code}`),
    previewCode:  (code)            => req('GET',    `/api/groups/join/${code}`),
    messages:     (groupId, limit)           => req('GET',    `/api/groups/${groupId}/messages${limit ? `?limit=${limit}` : ''}`),
    sendMessage:  (groupId, text, replyToId) => req('POST',   `/api/groups/${groupId}/messages`, { text, ...(replyToId ? { replyToId } : {}) }),
    reactMessage: (groupId, msgId, emoji)    => req('POST',   `/api/groups/${groupId}/messages/${msgId}/react`, { emoji }),
    feed:         (groupId, limit)  => req('GET',    `/api/groups/${groupId}/feed${limit ? `?limit=${limit}` : ''}`),
  },
  messages: {
    unreadCount:  ()               => req('GET',  '/api/messages/unread-count'),
    conversations:()               => req('GET',  '/api/messages'),
    conversation: (friendId, limit)=> req('GET',  `/api/messages/${friendId}${limit ? `?limit=${limit}` : ''}`),
    send:         (friendId, text) => req('POST', `/api/messages/${friendId}`, { text }),
  },
  push: {
    vapidKey:    ()    => req('GET',    '/api/push/vapid-key'),
    subscribe:   (sub) => req('POST',   '/api/push/subscribe',   sub),
    unsubscribe: (sub) => req('DELETE', '/api/push/unsubscribe', { endpoint: sub.endpoint }),
  },
}
