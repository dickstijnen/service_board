const STRAPI = process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('containeros_token')
}

export async function apiGet<T = any>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${STRAPI}/api/${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getToken()}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`API fout ${res.status}: ${path}`)
  return res.json()
}

export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${STRAPI}/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API fout ${res.status}: ${path}`)
  return res.json()
}

export async function apiPut<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${STRAPI}/api/${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API fout ${res.status}: ${path}`)
  return res.json()
}

export async function apiPatch<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${STRAPI}/api/${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API fout ${res.status}: ${path}`)
  return res.json()
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${STRAPI}/api/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error(`API fout ${res.status}: ${path}`)
}

export async function apiUploadFile(file: File): Promise<{ id: number; url?: string; name?: string }[]> {
  const form = new FormData()
  form.append('files', file)

  const res = await fetch(`${STRAPI}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  })
  if (!res.ok) {
    // Strapi geeft de echte oorzaak mee in de body (403 = ontbrekende
    // upload-permissie, 413 = te groot, 400 = geweigerd bestandstype).
    const detail = await res.text().catch(() => '')
    throw new Error(`Upload fout ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}
