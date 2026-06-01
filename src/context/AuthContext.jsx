// v4
import { createContext, useContext, useState, useEffect } from 'react'
import { api, getToken, setToken, clearToken } from '../lib/api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    api.me().then(({ user: u, error }) => {
      if (u) setUser(u)
      else clearToken()
      setLoading(false)
    })
  }, [])

  const signUp = async (email, password, username) => {
    return api.register(email, password, username)
  }

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

  const signOut = () => {
    clearToken()
    setUser(null)
  }

  const updateUser = (newUser, newToken) => {
    setUser(newUser)
    setToken(newToken)
  }

  return (
    <Ctx.Provider value={{ user, loading, signUp, signIn, signOut, verifyCode, updateUser }}>
      {children}
    </Ctx.Provider>
  )
}
