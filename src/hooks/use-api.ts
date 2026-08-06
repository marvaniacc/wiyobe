'use client'
import { useCallback, useEffect, useState } from 'react'

export function useApi<T>(url: string | null, opts?: { method?: string; body?: any; deps?: any[] }) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)
  const deps = opts?.deps ?? []

  const refetch = useCallback(async () => {
    if (!url) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url, {
        method: opts?.method || 'GET',
        headers: opts?.body ? { 'Content-Type': 'application/json' } : undefined,
        body: opts?.body ? JSON.stringify(opts.body) : undefined,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Request failed')
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, opts?.method, JSON.stringify(opts?.body)])

  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, ...deps])

  return { data, loading, error, refetch, setData }
}

export async function apiPost<T = any>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json as T
}

export async function apiPut<T = any>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json as T
}

export async function apiPatch<T = any>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json as T
}

export async function apiDelete<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json as T
}
