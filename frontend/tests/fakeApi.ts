import { vi } from 'vitest'

import type { Column, Import, Job, TypeCheck } from '../src/types/imports'
import { jsonResponse } from './helpers'

export interface Call {
  url: string
  method: string
  body: unknown
}

/**
 * Backend simulé : garde les imports en mémoire et enregistre les appels reçus.
 * `detection` est la réponse de detect-types : les colonnes, ou un message qui donne une 422.
 * `typeCheck` est la réponse de la vérification d'un changement de type.
 */
export function fakeApi(
  initial: Import[],
  detection: Column[] | string = [],
  typeCheck: TypeCheck = { invalid_count: 0, examples: [] },
) {
  const imports = [...initial]
  const calls: Call[] = []
  let nextId = initial.length + 1
  // Ce que la première relecture d'un job termine : l'upload ou la conversion lancés juste avant.
  const finishers = new Map<string, (item: Import) => void>()
  const finishUpload = (done: Import) => {
    Object.assign(done, {
      status: 'ready',
      columns: typeof detection === 'string' ? [] : detection,
      row_count: 2,
    })
  }

  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    // Un fichier arrive en FormData, qu'on garde tel quel pour pouvoir l'inspecter.
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
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

    // Import en arrière-plan : l'envoi passe l'import en cours, la première relecture du job
    // le termine avec les colonnes de la détection simulée.
    const uploaded = /^\/api\/imports\/([^/]+)\/upload$/.exec(input)
    if (uploaded && method === 'POST') {
      const item = imports.find((candidate) => candidate.id === uploaded[1])
      if (!item) return Promise.resolve(jsonResponse({ detail: 'Import introuvable' }, 404))
      item.status = 'importing'
      item.job_id = `job-${item.id}`
      finishers.set(item.id, finishUpload)
      return Promise.resolve(jsonResponse(makeJob(item.id, 'running'), 202))
    }

    const job = /^\/api\/jobs\/job-(.+)$/.exec(input)
    if (job) {
      const item = imports.find((candidate) => candidate.id === job[1])
      // Un import déjà en cours au départ du test se termine comme un upload.
      if (item) (finishers.get(item.id) ?? finishUpload)(item)
      return Promise.resolve(jsonResponse(makeJob(job[1], 'done')))
    }

    const checked = /^\/api\/imports\/([^/]+)\/columns\/[^/]+\/type-check\?type=/.exec(input)
    if (checked) return Promise.resolve(jsonResponse(typeCheck))

    const typeChange = /^\/api\/imports\/([^/]+)\/columns\/([^/]+)\/type$/.exec(input)
    if (typeChange && method === 'PATCH') {
      const item = imports.find((candidate) => candidate.id === typeChange[1])
      if (!item) return Promise.resolve(jsonResponse({ detail: 'Import introuvable' }, 404))
      const { type } = body as { type: Column['type'] }
      item.status = 'importing'
      item.job_id = `job-${item.id}`
      finishers.set(item.id, (done) => {
        done.status = 'ready'
        done.columns = done.columns.map((c) => (c.key === typeChange[2] ? { ...c, type } : c))
      })
      return Promise.resolve(jsonResponse(makeJob(item.id, 'running'), 202))
    }

    const detect = /^\/api\/imports\/([^/]+)\/detect-types$/.exec(input)
    if (detect && method === 'POST') {
      if (!imports.some((item) => item.id === detect[1])) {
        return Promise.resolve(jsonResponse({ detail: 'Import introuvable' }, 404))
      }
      return Promise.resolve(
        typeof detection === 'string'
          ? jsonResponse({ detail: detection }, 422)
          : jsonResponse(detection),
      )
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

/** Import de test, vide par défaut, avec des dates fixes. */
export function makeImport(
  id: string,
  name: string,
  order: number,
  extra: Partial<Import> = {},
): Import {
  return {
    id,
    name,
    order,
    status: 'empty',
    columns: [],
    row_count: 0,
    error: null,
    job_id: null,
    created_at: '2026-09-15T10:00:00Z',
    updated_at: '2026-09-15T10:00:00Z',
    ...extra,
  }
}

/** Job de test d'un import : terminé, il a traité ses deux lignes. */
function makeJob(importId: string, status: Job['status']): Job {
  const done = status === 'done' ? 2 : 0
  return { id: `job-${importId}`, import_id: importId, status, processed: done, total: done, error: null }
}
