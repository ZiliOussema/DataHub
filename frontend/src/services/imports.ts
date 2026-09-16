import type { Import } from '../types/imports'
import { json, request } from './api'

export const listImports = (): Promise<Import[]> => request<Import[]>('/api/imports')

export const createImport = (name: string): Promise<Import> =>
  request<Import>('/api/imports', json('POST', { name }))

export const renameImport = (id: string, name: string): Promise<Import> =>
  request<Import>(`/api/imports/${id}`, json('PATCH', { name }))

export const deleteImport = (id: string): Promise<void> =>
  request<void>(`/api/imports/${id}`, { method: 'DELETE' })

/** Enregistre l'ordre complet : la liste doit contenir chaque import une fois. */
export const saveOrder = (ids: string[]): Promise<Import[]> =>
  request<Import[]>('/api/imports/order', json('PUT', { ids }))
