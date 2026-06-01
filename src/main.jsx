import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthView from './views/AuthView.jsx'
import { AppProvider } from './context/AppContext.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'

function Root() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return <AuthView />

  return (
    <AppProvider>
      <App />
    </AppProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
)
