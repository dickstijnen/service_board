'use client'
import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [toonWachtwoord, setToonWachtwoord] = useState(false)
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)

  // Wachtwoord na 3 seconden weer automatisch verbergen (shoulder-surfing).
  useEffect(() => {
    if (!toonWachtwoord) return
    const t = window.setTimeout(() => setToonWachtwoord(false), 3000)
    return () => window.clearTimeout(t)
  }, [toonWachtwoord])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFout('')
    setLaden(true)
    try {
      // Trimmen: autofill en mobiele toetsenborden plakken er makkelijk een
      // spatie achter, en Strapi vergelijkt letterlijk — dan krijg je
      // "Invalid identifier or password" terwijl je het juist intypte.
      await login(identifier.trim(), wachtwoord.trim())
      router.push('/dashboard')
    } catch (err: any) {
      const bericht = err?.message ?? ''
      setFout(
        /invalid identifier or password/i.test(bericht)
          ? 'E-mailadres of wachtwoord onjuist.'
          : bericht || 'Inloggen mislukt',
      )
    } finally {
      setLaden(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-app">
      <div className="w-full max-w-sm p-8 rounded-2xl border border-line bg-surface">
        <div className="mb-8 text-center">
          <div className="text-2xl font-bold text-ink mb-1">Paterbak</div>
          <div className="text-sm text-ink-subtle">Inloggen op uw account</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="identifier" className="text-ink-muted text-xs">
              E-mailadres
            </Label>
            <Input
              id="identifier"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="naam@paterbak.nl"
              required
              className="bg-surface border-line text-ink placeholder:text-ink-subtle focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wachtwoord" className="text-ink-muted text-xs">
              Wachtwoord
            </Label>
            <div className="relative">
              <Input
                id="wachtwoord"
                type={toonWachtwoord ? 'text' : 'password'}
                autoComplete="current-password"
                value={wachtwoord}
                onChange={e => setWachtwoord(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-surface border-line text-ink placeholder:text-ink-subtle focus:border-accent pr-10"
              />
              <button
                type="button"
                onClick={() => setToonWachtwoord(v => !v)}
                aria-label={toonWachtwoord ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                title={toonWachtwoord ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-subtle transition-colors hover:text-ink"
              >
                {toonWachtwoord ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {fout && (
            <div className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">
              {fout}
            </div>
          )}

          <Button
            type="submit"
            disabled={laden}
            className="w-full bg-accent hover:bg-accent/90 text-white font-medium"
          >
            {laden ? 'Inloggen...' : 'Inloggen'}
          </Button>
        </form>
      </div>
    </div>
  )
}
