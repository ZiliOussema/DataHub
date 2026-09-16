import { useState } from 'react'
import { Link } from 'react-router'

import { useImportMutations } from '../hooks/useImports'
import { ApiError } from '../services/api'
import type { Import } from '../types/imports'
import ConfirmDialog from './ConfirmDialog'
import Icon from './icons'
import Statut from './Statut'

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const action =
  'grid h-7 w-7 place-items-center rounded-sm text-texte-pale hover:bg-surface-2 hover:text-texte disabled:bg-transparent disabled:opacity-30'

interface Props {
  item: Import
  isFirst: boolean
  isLast: boolean
  onMove: (id: string, direction: -1 | 1) => void
}

/** Une ligne du tableau : ouverture, renommage, déplacement, suppression. */
export default function ImportRow({ item, isFirst, isLast, onMove }: Props) {
  const [editedName, setEditedName] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const { rename, remove } = useImportMutations()

  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault()
    if (editedName === null) return
    try {
      await rename.mutateAsync({ id: item.id, name: editedName })
      setEditedName(null)
    } catch {
      // Le message reste affiché sous le champ.
    }
  }

  return (
    <tr className="hover:bg-survol">
      <td className="border-b border-filet px-4 py-2">
        {editedName === null ? (
          <Link to={`/imports/${item.id}`} className="font-medium hover:underline">
            {item.name}
          </Link>
        ) : (
          <form onSubmit={submitRename} className="flex items-center gap-1.5">
            <label htmlFor={`name-${item.id}`} className="sr-only">
              Nouveau nom
            </label>
            <input
              id={`name-${item.id}`}
              value={editedName}
              onChange={(event) => setEditedName(event.target.value)}
              className="h-8 w-64 rounded-sm border border-bordure bg-surface px-2.5 focus:border-bleu focus:outline-none"
            />
            <button
              type="submit"
              className="h-8 rounded-sm bg-rouge px-3 font-medium text-white hover:bg-rouge-fonce"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setEditedName(null)}
              className="h-8 px-2 text-texte-doux hover:text-texte hover:underline"
            >
              Annuler
            </button>
          </form>
        )}
        {rename.error instanceof ApiError && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {rename.error.message}
          </p>
        )}
        {confirming && (
          <ConfirmDialog
            title={`Supprimer « ${item.name} » ?`}
            description="Le fichier, les données et les statistiques de cet import seront supprimés."
            confirmLabel="Supprimer"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false)
              remove.mutate(item.id)
            }}
          />
        )}
      </td>
      <td className="border-b border-filet px-4 py-2">
        <Statut statut={item.status} />
      </td>
      <td className="border-b border-filet px-4 py-2 whitespace-nowrap text-texte-doux">
        {DATE.format(new Date(item.updated_at))}
      </td>
      <td className="border-b border-filet px-4 py-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onMove(item.id, -1)}
            disabled={isFirst}
            aria-label={`Monter ${item.name}`}
            className={action}
          >
            <Icon nom="monter" className="h-[15px] w-[15px]" />
          </button>
          <button
            type="button"
            onClick={() => onMove(item.id, 1)}
            disabled={isLast}
            aria-label={`Descendre ${item.name}`}
            className={action}
          >
            <Icon nom="descendre" className="h-[15px] w-[15px]" />
          </button>
          <button
            type="button"
            onClick={() => setEditedName(editedName === null ? item.name : null)}
            aria-label={`Renommer ${item.name}`}
            className={action}
          >
            <Icon nom="renommer" className="h-[15px] w-[15px]" />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Supprimer ${item.name}`}
            className={action}
          >
            <Icon nom="supprimer" className="h-[15px] w-[15px]" />
          </button>
        </div>
      </td>
    </tr>
  )
}
