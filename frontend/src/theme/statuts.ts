import type { ImportStatus } from '../types/imports'

/** Libellé affiché pour chaque état d'un import. */
export const LIBELLES: Record<ImportStatus, string> = {
  empty: 'Vide',
  importing: 'Import en cours',
  ready: 'Prêt',
  failed: 'Échec',
}

/** Couleur de la pastille d'état, partagée par le tableau et la barre latérale. */
export const COULEURS: Record<ImportStatus, string> = {
  empty: 'bg-texte-pale',
  importing: 'bg-bleu',
  ready: 'bg-succes',
  failed: 'bg-rouge',
}
