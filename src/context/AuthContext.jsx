import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, getToken, setToken, clearToken, onUnauthorized } from '../lib/api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  // Auto-logout when any request receives a 401 (expired token)
  useEffect(() => {
    return onUnauthorized(() => {
      if (getToken()) signOut()
    })
  }, [signOut])

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    api.me().then(({ user: u, error }) => {
      if (u) setUser(u)
      else { clearToken() }
      setLoading(false)
    }).catch(() => {
      clearToken()
      setLoading(false)
    })
  }, [])

  const signUp = (email, password, username) =>
    api.register(email, password, username)

  const verifyCode = async (email, code) => {
    const data = await api.verify(email, code)
    if (data.error) return { error: data.error }
    setToken(data.token)
    setUser(data.user)
    return { success: true }
  }

  const signIn = async (email, password) => {
    const data = await api.login(email, password)
    if (data.error) return { error: data.error }
    setToken(data.token)
    setUser(data.user)
    return { success: true }
  }

  const updateUser = (newUser, newToken) => {
    setUser(newUser)
    if (newToken) setToken(newToken)
  }

  return (
    <Ctx.Provider value={{ user, loading, signUp, signIn, signOut, verifyCode, updateUser }}>
      {children}
    </Ctx.Provider>
  )
}
