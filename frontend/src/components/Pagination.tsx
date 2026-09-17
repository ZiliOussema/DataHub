import { PAGE_SIZES } from '../hooks/useTableState'
import type { TableState } from '../types/imports'

const NOMBRE = new Intl.NumberFormat('fr-FR')

const bouton =
  'h-8 rounded-sm border border-bordure bg-surface px-3 font-medium hover:bg-survol disabled:cursor-not-allowed disabled:opacity-45'

interface Props {
  state: TableState
  total: number | undefined
  onChange: (change: Partial<TableState>) => void
}

/** Position dans le résultat, taille de page et navigation, y compris vers une page précise. */
export default function Pagination({ state, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil((total ?? 0) / state.size))
  const first = total ? (state.page - 1) * state.size + 1 : 0
  const last = Math.min(state.page * state.size, total ?? 0)

  const goTo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const page = Number(new FormData(event.currentTarget).get('page'))
    if (Number.isInteger(page) && page >= 1 && page <= pages) onChange({ page })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bordure px-4 py-2 text-[12.5px]">
      <span className="text-texte-doux">
        {total === undefined
          ? 'Chargement…'
          : `Lignes ${NOMBRE.format(first)} à ${NOMBRE.format(last)} sur ${NOMBRE.format(total)}`}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="page-size" className="text-texte-doux">
          Lignes par page
        </label>
        <select
          id="page-size"
          value={state.size}
          onChange={(event) => onChange({ size: Number(event.target.value) })}
          className="h-8 rounded-sm border border-bordure bg-surface px-2"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {NOMBRE.format(size)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={state.page <= 1}
          onClick={() => onChange({ page: state.page - 1 })}
          className={bouton}
        >
          Précédente
        </button>
        <form onSubmit={goTo} className="flex items-center gap-1.5">
          <label htmlFor="page">Page</label>
          <input
            key={state.page}
            id="page"
            name="page"
            type="number"
            min={1}
            max={pages}
            defaultValue={state.page}
            className="h-8 w-20 rounded-sm border border-bordure bg-surface px-2 text-center"
          />
          <span>sur {NOMBRE.format(pages)}</span>
          <button type="submit" className={bouton}>
            Aller
          </button>
        </form>
        <button
          type="button"
          disabled={state.page >= pages}
          onClick={() => onChange({ page: state.page + 1 })}
          className={bouton}
        >
          Suivante
        </button>
      </div>
    </div>
  )
}
