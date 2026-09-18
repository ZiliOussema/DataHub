import { useEffect, useState } from 'react'

import { useStats } from '../hooks/useImports'
import { useTableState } from '../hooks/useTableState'
import { ApiError } from '../services/api'
import { TYPE_LABELS } from '../theme/types'
import type { ColumnType, Import, Occurrence, Stats } from '../types/imports'

const NOMBRE = new Intl.NumberFormat('fr-FR')
const DECIMAL = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
// Les chiffres sont arrondis à deux décimales ; une valeur du fichier garde les siennes.
const VALEUR = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 })
const PAR_PAGE = 20
const DEBOUNCE_MS = 300

const entete = 'px-4 py-2.5 text-[11px] font-semibold tracking-[0.05em] text-texte-doux uppercase'
const bouton =
  'h-8 rounded-sm border border-bordure bg-surface px-3 font-medium hover:bg-survol disabled:cursor-not-allowed disabled:opacity-45'

/** Valeur d'occurrence, écrite comme la même valeur dans le tableau de données. */
function valeur(value: Occurrence['value'], type: ColumnType) {
  if (typeof value === 'boolean') return value ? 'vrai' : 'faux'
  return type === 'float' && typeof value === 'number' ? VALEUR.format(value) : String(value)
}

/** Chiffres à afficher selon le type de la colonne. */
function figures(stats: Stats): [string, string][] {
  const { count, distinct, minimum, maximum, average, true_count, false_count } = stats
  if (stats.column.type === 'boolean') {
    const share = count > 0 ? Math.round(((true_count ?? 0) / count) * 100) : 0
    return [
      ['Valeurs renseignées', NOMBRE.format(count)],
      ['Vrai', `${NOMBRE.format(true_count ?? 0)} · ${share} %`],
      ['Faux', `${NOMBRE.format(false_count ?? 0)} · ${100 - share} %`],
    ]
  }
  if (stats.column.type === 'string') {
    return [
      ['Compte global', NOMBRE.format(count)],
      ['Valeurs distinctes', NOMBRE.format(distinct)],
    ]
  }
  return [
    ['Valeurs renseignées', NOMBRE.format(count)],
    ['Minimum', minimum === null ? '—' : DECIMAL.format(minimum)],
    ['Maximum', maximum === null ? '—' : DECIMAL.format(maximum)],
    ['Moyenne', average === null ? '—' : DECIMAL.format(average)],
  ]
}

/** Onglet Statistiques : chiffres d'une colonne et tableau valeur / occurrence. */
export default function StatsPanel({ item }: { item: Import }) {
  const { state } = useTableState(item.id, item.columns)
  const [key, setKey] = useState(item.columns[0]?.key ?? '')
  const [filtered, setFiltered] = useState(false)
  const [searched, setSearched] = useState(false)
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-count')
  const [page, setPage] = useState(1)

  useEffect(() => {
    // Rien à faire au montage ni après l'envoi : sinon la page reviendrait à 1 toute seule.
    if (typed === search) return
    // Anti-rebond : la recherche part une fois la frappe arrêtée, comme les filtres du tableau.
    const timer = setTimeout(() => {
      setSearch(typed)
      setPage(1)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [typed, search])

  const column = item.columns.find((candidate) => candidate.key === key)
  const text = column?.type === 'string'
  const query = { filtered, search: text ? search : '', searched: text && searched, sort, page }
  const stats = useStats(item, key, query, state.filters)
  const active = Object.entries(state.filters).filter(([, value]) => value !== '')
  const pages = Math.max(1, Math.ceil((stats.data?.distinct ?? 0) / PAR_PAGE))

  const change = (apply: () => void) => {
    apply()
    setPage(1)
  }

  return (
    <section className="border border-bordure bg-surface">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 border-b border-bordure px-4 py-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold tracking-[0.06em] text-texte-doux uppercase">
          Colonne
          <select
            value={key}
            onChange={(event) => change(() => setKey(event.target.value))}
            className="h-8 min-w-56 rounded-sm border border-bordure bg-surface px-2 text-[13.5px] font-normal tracking-normal text-texte normal-case"
          >
            {item.columns.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {candidate.label || candidate.key}, {TYPE_LABELS[candidate.type].toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="flex max-w-[40ch] items-start gap-2 pt-4">
          <input
            type="checkbox"
            checked={filtered}
            onChange={() => change(() => setFiltered(!filtered))}
            className="h-3.5 w-3.5 accent-rouge"
          />
          <span>
            Appliquer les filtres de l'onglet Données
            <span className="block text-xs text-texte-doux">
              {active.length > 0
                ? active.map(([name, value]) => `${name} : ${value}`).join(', ')
                : 'Aucun filtre actif'}
            </span>
          </span>
        </label>

        <label
          className={`flex max-w-[40ch] items-start gap-2 pt-4 ${text ? '' : 'text-texte-pale'}`}
        >
          <input
            type="checkbox"
            checked={text && searched}
            disabled={!text}
            onChange={() => change(() => setSearched(!searched))}
            className="h-3.5 w-3.5 accent-rouge"
          />
          <span>
            Appliquer la recherche ci-dessous aux chiffres
            <span className="block text-xs text-texte-doux">Colonnes de texte uniquement</span>
          </span>
        </label>
      </div>

      {stats.error && (
        <p role="alert" className="px-4 py-8 text-center text-danger">
          {stats.error instanceof ApiError ? stats.error.message : 'Le serveur ne répond pas.'}
        </p>
      )}

      {stats.data && (
        <>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] border-b border-bordure">
            {figures(stats.data).map(([label, value]) => (
              <div key={label} className="border-r border-filet px-4 py-3 last:border-r-0">
                <dt className="text-[11px] font-semibold tracking-[0.07em] text-texte-doux uppercase">
                  {label}
                </dt>
                <dd className="mt-1.5 font-titre text-[25px] leading-none font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordure px-4 py-2">
            <span>
              <b className="font-semibold">{NOMBRE.format(stats.data.distinct)}</b> valeur
              {stats.data.distinct > 1 ? 's' : ''} distincte{stats.data.distinct > 1 ? 's' : ''}
            </span>
            {text && (
              <label className="flex items-center gap-2 text-texte-doux">
                Valeur contient
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  className="h-8 w-48 rounded-sm border border-bordure bg-surface px-2 text-texte focus:border-bleu focus:outline-none"
                />
              </label>
            )}
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="bg-survol">
                {[
                  ['value', 'Valeur'],
                  ['count', 'Occurrences'],
                ].map(([field, label]) => (
                  <th key={field} className={`${entete} ${field === 'count' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() =>
                        change(() => setSort(sort === `-${field}` ? field : `-${field}`))
                      }
                      className="uppercase hover:text-texte"
                    >
                      {label} {sort === field ? '▲' : sort === `-${field}` ? '▼' : '↕'}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.data.occurrences.map(({ value, count }) => (
                <tr key={String(value)} className="hover:bg-survol">
                  <td className="border-b border-filet px-4 py-2">
                    {valeur(value, stats.data.column.type)}
                  </td>
                  <td className="border-b border-filet px-4 py-2 text-right">
                    {NOMBRE.format(count)}
                  </td>
                </tr>
              ))}
              {stats.data.occurrences.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-texte-doux">
                    Aucune valeur ne correspond.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between gap-3 border-t border-bordure px-4 py-2 text-[12.5px]">
            <span className="text-texte-doux">
              Page {NOMBRE.format(page)} sur {NOMBRE.format(pages)}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className={bouton}
              >
                Précédente
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                className={bouton}
              >
                Suivante
              </button>
            </span>
          </div>
        </>
      )}
    </section>
  )
}
