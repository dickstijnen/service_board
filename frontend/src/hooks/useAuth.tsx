'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface Gebruiker {
  id: number
  username: string
  name?: string
  email: string
  rol: 'chauffeur' | 'planner' | 'administratie' | 'manager' | 'admin'
}

interface AuthState {
  gebruiker: Gebruiker | null
  token: string | null
  laden: boolean
  login: (identifier: string, wachtwoord: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [gebruiker, setGebruiker] = useState<Gebruiker | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    const opgeslagenToken = localStorage.getItem('containeros_token')
    const opgeslagenGebruiker = localStorage.getItem('containeros_gebruiker')
    if (opgeslagenToken && opgeslagenGebruiker) {
      setToken(opgeslagenToken)
      setGebruiker(JSON.parse(opgeslagenGebruiker))
    }
    setLaden(false)
  }, [])

  const login = async (identifier: string, wachtwoord: string) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337'}/api/auth/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: wachtwoord }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err?.error?.message ?? 'Inloggen mislukt')
    }
    const data = await res.json()
    const g: Gebruiker = {
      id: data.user.id,
      username: data.user.username,
      name: data.user.name ?? data.user.username,
      email: data.user.email,
      rol: data.user.rol ?? 'chauffeur',
    }
    localStorage.setItem('containeros_token', data.jwt)
    localStorage.setItem('containeros_gebruiker', JSON.stringify(g))
    setToken(data.jwt)
    setGebruiker(g)
  }

  const logout = () => {
    localStorage.removeItem('containeros_token')
    localStorage.removeItem('containeros_gebruiker')
    setToken(null)
    setGebruiker(null)
  }

  return (
    <AuthContext.Provider value={{ gebruiker, token, laden, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth moet binnen AuthProvider gebruikt worden')
  return ctx
}
