import { vi } from 'vitest'

import type { Import } from '../src/types/imports'
import { jsonResponse } from './helpers'

export interface Call {
  url: string
  method: string
  body: unknown
}

/** Backend simulé : garde les imports en mémoire et enregistre les appels reçus. */
export function fakeApi(initial: Import[]) {
  const imports = [...initial]
  const calls: Call[] = []
  let nextId = initial.length + 1

  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url: input, method, body })

    if (input === '/api/imports' && method === 'GET') return Promise.resolve(jsonResponse(imports))

    if (input === '/api/imports' && method === 'POST') {
      const { name } = body as { name: string }
      if (imports.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
        return Promise.resolve(jsonResponse({ detail: `Le nom « ${name} » est déjà utilisé` }, 409))
      }
      const created = makeImport(String(nextId++), name, imports.length)
      imports.push(created)
      return Promise.resolve(jsonResponse(created, 201))
    }

    if (input === '/api/imports/order' && method === 'PUT') {
      const { ids } = body as { ids: string[] }
      imports.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
      return Promise.resolve(jsonResponse(imports))
    }

    const id = input.replace('/api/imports/', '')
    const index = imports.findIndex((item) => item.id === id)
    if (index === -1) return Promise.resolve(jsonResponse({ detail: 'Import introuvable' }, 404))

    if (method === 'PATCH') {
      imports[index] = { ...imports[index], name: (body as { name: string }).name }
      return Promise.resolve(jsonResponse(imports[index]))
    }
    if (method === 'DELETE') {
      imports.splice(index, 1)
      return Promise.resolve(jsonResponse(null, 204))
    }
    return Promise.resolve(jsonResponse({ detail: 'Non géré' }, 405))
  })

  vi.stubGlobal('fetch', fetchMock)
  return { calls, imports }
}

/** Import de test, avec des dates fixes. */
export function makeImport(id: string, name: string, order: number): Import {
  return {
    id,
    name,
    order,
    status: 'empty',
    created_at: '2026-09-15T10:00:00Z',
    updated_at: '2026-09-15T10:00:00Z',
  }
}
