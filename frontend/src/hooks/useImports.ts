import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createImport,
  deleteImport,
  listImports,
  renameImport,
  saveOrder,
} from '../services/imports'

const IMPORTS = ['imports']

/** Liste des imports, dans l'ordre d'affichage. */
export function useImports() {
  return useQuery({ queryKey: IMPORTS, queryFn: listImports })
}

/** Création, renommage, suppression et réordonnancement, qui rafraîchissent la liste. */
export function useImportMutations() {
  const client = useQueryClient()
  const onSuccess = async () => {
    await client.invalidateQueries({ queryKey: IMPORTS })
  }

  return {
    create: useMutation({ mutationFn: createImport, onSuccess }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => renameImport(id, name),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: deleteImport, onSuccess }),
    reorder: useMutation({ mutationFn: saveOrder, onSuccess }),
  }
}

/** Déplace un import d'un rang. Partagé par le tableau et la barre latérale. */
export function useMoveImport() {
  const { data: imports } = useImports()
  const { reorder } = useImportMutations()

  return (id: string, direction: -1 | 1) => {
    if (!imports) return
    const ids = imports.map((item) => item.id)
    const from = ids.indexOf(id)
    const [moved] = ids.splice(from, 1)
    ids.splice(from + direction, 0, moved)
    reorder.mutate(ids)
  }
}
