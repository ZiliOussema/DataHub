import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import {
  createImport,
  deleteImport,
  detectTypes,
  getJob,
  listImports,
  renameImport,
  saveOrder,
  uploadFile,
} from '../services/imports'

const IMPORTS = ['imports']

/** Liste des imports, dans l'ordre d'affichage. */
export function useImports() {
  return useQuery({
    queryKey: IMPORTS,
    queryFn: listImports,
    // Relue toutes les 2 secondes tant qu'un import est en cours : son état passe à prêt ou
    // échec sans rechargement, même après avoir fermé puis rouvert la page pendant l'import.
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === 'importing') ? 2000 : false,
  })
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

/** Aperçu des colonnes d'un fichier. Rien n'est enregistré, donc aucun cache à rafraîchir. */
export function useDetectTypes(importId: string) {
  return useMutation({ mutationFn: (file: File) => detectTypes(importId, file) })
}

/** Lance l'import d'un fichier. La liste est rafraîchie pour afficher l'import en cours. */
export function useUploadFile(importId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadFile(importId, file),
    onSuccess: () => client.invalidateQueries({ queryKey: IMPORTS }),
  })
}

/** Suit un job chaque seconde jusqu'à sa fin, puis rafraîchit la liste des imports. */
export function useJob(jobId: string | null) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => getJob(jobId ?? ''),
    enabled: jobId !== null,
    refetchInterval: (job) => (job.state.data?.status === 'running' ? 1000 : false),
  })
  const status = query.data?.status
  useEffect(() => {
    if (status === 'done' || status === 'failed') {
      void client.invalidateQueries({ queryKey: IMPORTS })
    }
  }, [status, client])
  return query
}
