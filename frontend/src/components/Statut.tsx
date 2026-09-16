import { COULEURS, LIBELLES } from '../theme/statuts'
import type { ImportStatus } from '../types/imports'

/** État d'un import : pastille et libellé. */
export default function Statut({ statut }: { statut: ImportStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-texte-doux">
      <span className={`h-1.5 w-1.5 rounded-full ${COULEURS[statut]}`} />
      {LIBELLES[statut]}
    </span>
  )
}
