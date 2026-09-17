import type {
  Column,
  ColumnType,
  DataPage,
  Import,
  Job,
  TableState,
  TypeCheck,
} from '../types/imports'
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

/** Aperçu avant import : envoie le fichier et renvoie ses colonnes typées, sans rien enregistrer. */
export function detectTypes(id: string, file: File): Promise<Column[]> {
  const body = new FormData()
  body.append('file', file)
  return request<Column[]>(`/api/imports/${id}/detect-types`, { method: 'POST', body })
}

/** Lance l'import du fichier en arrière-plan et renvoie le job qui suit son avancement. */
export function uploadFile(id: string, file: File): Promise<Job> {
  const body = new FormData()
  body.append('file', file)
  return request<Job>(`/api/imports/${id}/upload`, { method: 'POST', body })
}

export const getJob = (id: string): Promise<Job> => request<Job>(`/api/jobs/${id}`)

export const checkColumnType = (id: string, key: string, type: ColumnType): Promise<TypeCheck> =>
  request<TypeCheck>(`/api/imports/${id}/columns/${key}/type-check?type=${type}`)

export const changeColumnType = (id: string, key: string, type: ColumnType): Promise<Job> =>
  request<Job>(`/api/imports/${id}/columns/${key}/type`, json('PATCH', { type }))

/** Paquet de lignes : tri et filtres de l'état du tableau, position exprimée en lignes. */
export function getRows(
  id: string,
  state: TableState,
  offset: number,
  limit: number,
): Promise<DataPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  if (state.sort) params.set('sort', state.sort)
  for (const [name, value] of Object.entries(state.filters)) {
    if (value !== '') params.set(`f.${name}`, value)
  }
  return request<DataPage>(`/api/imports/${id}/data?${params}`)
}
