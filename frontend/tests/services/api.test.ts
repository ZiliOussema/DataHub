import { afterEach, expect, test, vi } from 'vitest'

import { ApiError, request } from '../../src/services/api'
import { jsonResponse } from '../helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renvoie le JSON du corps', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ id: '1' }])))

  await expect(request('/api/imports')).resolves.toEqual([{ id: '1' }])
})

test('renvoie undefined sur une réponse 204', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, 204)))

  await expect(request('/api/imports/1')).resolves.toBeUndefined()
})

test('lève ApiError avec le message du backend', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Nom déjà utilisé' }, 409)))

  await expect(request('/api/imports')).rejects.toThrow(
    expect.objectContaining({ status: 409, message: 'Nom déjà utilisé' }) as Error,
  )
})

test('lève ApiError avec le premier message de validation', async () => {
  const body = { detail: [{ msg: 'String should have at least 1 character' }] }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, 422)))

  await expect(request('/api/imports')).rejects.toThrow('String should have at least 1 character')
})

test('lève ApiError avec un message par défaut si le corps est vide', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

  await expect(request('/api/imports')).rejects.toThrow(new ApiError(500, 'Erreur 500').message)
})
