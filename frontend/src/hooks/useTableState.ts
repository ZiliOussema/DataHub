import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

import type { Column, TableState } from '../types/imports'

export const PAGE_SIZES = [10, 20, 50, 100, 1000, 5000, 10000, 1_000_000]
const DEFAULT_SIZE = 20
const FILTER = 'f.'

const storageKey = (importId: string) => `datahub:tableau:${importId}`

const isTableParam = (name: string) =>
  ['page', 'size', 'sort'].includes(name) || name.startsWith(FILTER)

/** Lit l'état du tableau dans des paramètres, en ignorant ce qui ne correspond à aucune colonne. */
function readState(params: URLSearchParams, columns: Column[]): TableState {
  const keys = new Set(columns.map((column) => column.key))
  const page = Number(params.get('page'))
  const size = Number(params.get('size'))
  const sort = params.get('sort')
  const filters: Record<string, string> = {}
  for (const [name, value] of params) {
    const filter = name.slice(FILTER.length)
    if (name.startsWith(FILTER) && keys.has(filter.split('.')[0])) filters[filter] = value
  }
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_SIZE,
    sort: sort !== null && keys.has(sort.replace(/^-/, '')) ? sort : null,
    filters,
  }
}

/** Écrit l'état du tableau en paramètres, filtres vides omis. */
function writeState(state: TableState): URLSearchParams {
  const params = new URLSearchParams({ page: String(state.page), size: String(state.size) })
  if (state.sort) params.set('sort', state.sort)
  for (const [name, value] of Object.entries(state.filters)) {
    if (value !== '') params.set(FILTER + name, value)
  }
  return params
}

/** Remplace les paramètres du tableau dans l'URL, en gardant les autres, comme l'onglet. */
function merge(current: URLSearchParams, state: TableState): URLSearchParams {
  const merged = new URLSearchParams([...current].filter(([name]) => !isTableParam(name)))
  for (const [name, value] of writeState(state)) merged.set(name, value)
  return merged
}

function readStorage(importId: string): URLSearchParams | null {
  try {
    const saved = localStorage.getItem(storageKey(importId))
    return saved === null ? null : new URLSearchParams(saved)
  } catch {
    return null
  }
}

/** Page, taille, tri et filtres du tableau d'un import, gardés dans l'URL et dans le navigateur. */
export function useTableState(importId: string, columns: Column[]) {
  const [params, setParams] = useSearchParams()
  const fromUrl = [...params.keys()].some(isTableParam)
  // L'URL fait autorité dès qu'elle porte un paramètre du tableau. Sinon, le dernier état mémorisé
  // est repris dès ce rendu : le lire dans un effet ferait partir une première requête pour rien.
  const state = readState(
    fromUrl ? params : (readStorage(importId) ?? new URLSearchParams()),
    columns,
  )
  const saved = writeState(state).toString()

  useEffect(() => {
    if (!fromUrl) setParams((current) => merge(current, state), { replace: true })
    try {
      localStorage.setItem(storageKey(importId), saved)
    } catch {
      // Stockage indisponible (navigation privée) : l'URL suffit à garder l'état.
    }
    // state se déduit de saved : l'ajouter relancerait l'effet à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId, saved, fromUrl, setParams])

  /** Applique un changement. Changer de tri, de filtre ou de taille ramène à la page 1. */
  const update = (change: Partial<TableState>) => {
    const next = { ...state, page: 1, ...change }
    // replace : chaque frappe dans un filtre ne doit pas créer une entrée d'historique.
    setParams((current) => merge(current, next), { replace: true })
  }

  return { state, update }
}
