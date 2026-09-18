import { useEffect, useRef, useState } from 'react'

import { BLOCK_ROWS, useRowBatch, useRowBlocks } from '../hooks/useImports'
import { useTableState } from '../hooks/useTableState'
import { ApiError } from '../services/api'
import { TYPE_LABELS } from '../theme/types'
import type { Column, Import, Row, Selection, TableState } from '../types/imports'
import BatchEditor from './BatchEditor'
import ConfirmDialog from './ConfirmDialog'
import Pagination from './Pagination'
import RowEditor from './RowEditor'
import Icon from './icons'

const ROW_HEIGHT = 34
const VIEWPORT = 540
const OVERSCAN = 10
// Les navigateurs ignorent une hauteur trop grande (Firefox plafonne vers 17 millions de pixels) :
// au-delà de ce seuil, la barre de défilement est comprimée et la position réelle recalculée.
const MAX_SCROLL = 10_000_000
const DEBOUNCE_MS = 300
const DECIMAL = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 })
const NOMBRE = new Intl.NumberFormat('fr-FR')

const entete = 'px-3 py-2 text-[11px] font-semibold tracking-[0.05em] text-texte-doux uppercase'
const champ =
  'h-7 w-full min-w-0 rounded-sm border border-filet bg-survol px-2 text-xs focus:border-bleu focus:bg-surface focus:outline-none'

const grid = (columns: Column[]) => ({
  gridTemplateColumns: `34px 72px repeat(${columns.length}, minmax(150px, 1fr)) 44px`,
})
const numeric = (column: Column) => column.type === 'integer' || column.type === 'float'
const coche = 'h-3.5 w-3.5 accent-rouge'
const bouton = 'h-8 rounded-sm border border-bordure bg-surface px-3 font-medium hover:bg-survol'
const danger =
  'h-8 rounded-sm border border-[#E2B4B1] bg-surface px-3 font-medium text-rouge-fonce hover:bg-[#FCF3F3]'

/** Valeur d'une cellule, écrite selon le type de sa colonne. */
function display(value: Row[string] | undefined, column: Column) {
  if (value === null || value === undefined) return <span className="text-texte-pale">vide</span>
  if (typeof value === 'boolean') return value ? 'vrai' : 'faux'
  if (column.type === 'float' && typeof value === 'number') return DECIMAL.format(value)
  return String(value)
}

interface FilterInputProps {
  label: string
  placeholder: string
  value: string
  onCommit: (value: string) => void
}

/** Champ de filtre qui n'applique sa valeur qu'une fois la frappe arrêtée. */
function FilterInput({ label, placeholder, value, onCommit }: FilterInputProps) {
  const [text, setText] = useState(value)
  const [applied, setApplied] = useState(value)
  // Valeur changée de l'extérieur, par « Effacer les filtres » : le champ la reprend.
  if (value !== applied) {
    setApplied(value)
    setText(value)
  }
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })
  useEffect(() => {
    if (text === value) return
    // Anti-rebond : une seule requête quand la frappe s'arrête, au lieu d'une par lettre.
    const timer = setTimeout(() => commit.current(text), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, value])

  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(event) => setText(event.target.value)}
      className={champ}
    />
  )
}

interface BodyProps {
  item: Import
  state: TableState
  pageStart: number
  pageRows: number
  head: Row[] | undefined
  onEdit: (row: Row) => void
  selected: Set<number>
  everything: boolean
  onToggle: (id: number) => void
}

/** Lignes visibles de la page, chargées par paquets de 100 au fil du défilement. */
function Body({
  item,
  state,
  pageStart,
  pageRows,
  head,
  onEdit,
  selected,
  everything,
  onToggle,
}: BodyProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const fullHeight = pageRows * ROW_HEIGHT
  const height = Math.min(fullHeight, MAX_SCROLL)
  const ratio = height > VIEWPORT ? (fullHeight - VIEWPORT) / (height - VIEWPORT) : 1
  const virtualTop = scrollTop * ratio

  const first = Math.max(0, Math.floor(virtualTop / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(pageRows, Math.ceil((virtualTop + VIEWPORT) / ROW_HEIGHT) + OVERSCAN)
  const indexes = Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i)
  const blockOf = (index: number) => pageStart + Math.floor(index / BLOCK_ROWS) * BLOCK_ROWS
  const offsets = [...new Set(indexes.map(blockOf))].filter((offset) => offset !== pageStart)
  const blocks = useRowBlocks(item, state, offsets, pageStart + state.size)
  const rows = new Map<number, Row[] | undefined>([
    [pageStart, head],
    ...offsets.map((offset, i) => [offset, blocks[i].data?.rows] as [number, Row[] | undefined]),
  ])

  return (
    <div
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="relative overflow-y-auto"
      style={{ height: Math.min(VIEWPORT, fullHeight) }}
    >
      <div style={{ height }}>
        {indexes.map((index) => {
          const row = rows.get(blockOf(index))?.[index % BLOCK_ROWS]
          return (
            <div
              key={index}
              role="row"
              className="absolute inset-x-0 grid items-center border-b border-filet hover:bg-survol"
              style={{
                ...grid(item.columns),
                height: ROW_HEIGHT,
                top: index * ROW_HEIGHT - virtualTop + scrollTop,
              }}
            >
              <div role="cell" className="flex justify-center">
                {row && (
                  <input
                    type="checkbox"
                    className={coche}
                    checked={everything || selected.has(row._id)}
                    disabled={everything}
                    onChange={() => onToggle(row._id)}
                    aria-label={`Sélectionner la ligne ${row._id + 1}`}
                  />
                )}
              </div>
              <div role="cell" className="px-3 text-right text-texte-doux">
                {row ? row._id + 1 : ''}
              </div>
              {item.columns.map((column) => (
                <div
                  key={column.key}
                  role="cell"
                  className={`truncate px-3 ${numeric(column) ? 'text-right' : ''}`}
                >
                  {row ? (
                    display(row[column.key], column)
                  ) : (
                    <span className="inline-block h-2.5 w-2/3 rounded-sm bg-surface-2" />
                  )}
                </div>
              ))}
              <div role="cell" className="flex justify-center">
                {row && (
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    aria-label={`Modifier la ligne ${row._id + 1}`}
                    className="grid h-7 w-7 place-items-center rounded-sm text-texte-pale hover:bg-surface-2 hover:text-texte"
                  >
                    <Icon nom="renommer" className="h-[15px] w-[15px]" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Onglet Données : tableau paginé, trié et filtré par le serveur, virtualisé à l'écran. */
export default function DataTable({ item }: { item: Import }) {
  const { state, update } = useTableState(item.id, item.columns)
  const [editing, setEditing] = useState<Row | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [everything, setEverything] = useState(false)
  const [batch, setBatch] = useState<'edit' | 'delete' | null>(null)
  const [done, setDone] = useState('')
  const { remove } = useRowBatch(item.id)
  const pageStart = (state.page - 1) * state.size
  // Le premier paquet de la page donne le total : il est toujours demandé.
  const [head] = useRowBlocks(item, state, [pageStart], pageStart + state.size)
  const total = head.data?.total
  const pageRows = total === undefined ? 0 : Math.max(0, Math.min(state.size, total - pageStart))
  const filtered = Object.values(state.filters).some((value) => value !== '')
  const count = everything ? (total ?? 0) : selected.size
  // Tout sélectionner vise les filtres, donc toutes les lignes du résultat, pas seulement la page.
  const selection: Selection = everything ? { filters: state.filters } : { ids: [...selected] }

  const clear = () => {
    setSelected(new Set())
    setEverything(false)
    setBatch(null)
  }

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (!next.delete(id)) next.add(id)
    setSelected(next)
  }

  const finish = (changed: number, verb: string) => {
    setDone(`${NOMBRE.format(changed)} ligne${changed > 1 ? 's' : ''} ${verb}`)
    clear()
  }

  const setFilter = (name: string, value: string) =>
    update({ filters: { ...state.filters, [name]: value } })
  const toggleSort = (key: string) =>
    update({ sort: state.sort === key ? `-${key}` : state.sort === `-${key}` ? null : key })

  const filter = (column: Column) => {
    const label = column.label || column.key
    if (column.type === 'string') {
      return (
        <FilterInput
          label={`Filtrer ${label}`}
          placeholder="Contient…"
          value={state.filters[column.key] ?? ''}
          onCommit={(value) => setFilter(column.key, value)}
        />
      )
    }
    if (column.type === 'boolean') {
      return (
        <select
          aria-label={`Filtrer ${label}`}
          value={state.filters[column.key] ?? ''}
          onChange={(event) => setFilter(column.key, event.target.value)}
          className={champ}
        >
          <option value="">Tous</option>
          <option value="vrai">vrai</option>
          <option value="faux">faux</option>
          <option value="vide">vide</option>
        </select>
      )
    }
    return (
      <div className="flex gap-1">
        {(['min', 'max'] as const).map((bound) => (
          <FilterInput
            key={bound}
            label={`${label} ${bound === 'min' ? 'minimum' : 'maximum'}`}
            placeholder={bound}
            value={state.filters[`${column.key}.${bound}`] ?? ''}
            onCommit={(value) => setFilter(`${column.key}.${bound}`, value)}
          />
        ))}
      </div>
    )
  }

  let body
  if (head.error) {
    body = (
      <p role="alert" className="px-4 py-8 text-center text-danger">
        {head.error instanceof ApiError ? head.error.message : 'Le serveur ne répond pas.'}
      </p>
    )
  } else if (total !== undefined && pageRows === 0) {
    body = (
      <p className="px-4 py-8 text-center text-texte-doux">
        {total !== 0
          ? 'Cette page est au-delà des résultats.'
          : Object.values(state.filters).some((value) => value !== '')
            ? 'Aucune ligne ne correspond aux filtres.'
            : 'Cet import ne contient aucune ligne.'}
      </p>
    )
  } else {
    // Clé de l'état : tout changement de page, de tri ou de filtre repart en haut de la page.
    body = (
      <Body
        key={JSON.stringify(state)}
        item={item}
        state={state}
        pageStart={pageStart}
        pageRows={pageRows}
        head={head.data?.rows}
        onEdit={setEditing}
        selected={selected}
        everything={everything}
        onToggle={toggle}
      />
    )
  }

  return (
    <section className="border border-bordure bg-surface">
      {filtered && (
        <div className="flex items-center justify-end border-b border-bordure px-4 py-2">
          <button
            type="button"
            onClick={() => update({ filters: {} })}
            className="text-texte-doux hover:text-texte hover:underline"
          >
            Effacer les filtres
          </button>
        </div>
      )}
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-bordure bg-[#FDF5F6] px-4 py-2">
          <span className="font-semibold">
            {NOMBRE.format(count)} ligne{count > 1 ? 's' : ''} sélectionnée{count > 1 ? 's' : ''}
          </span>
          <button type="button" onClick={() => setBatch('edit')} className={bouton}>
            Modifier la sélection
          </button>
          <button type="button" onClick={() => setBatch('delete')} className={danger}>
            Supprimer la sélection
          </button>
          <button type="button" onClick={clear} className="px-2 text-texte-doux hover:underline">
            Tout désélectionner
          </button>
        </div>
      )}
      {done && <p className="border-b border-bordure px-4 py-2 text-succes">{done}</p>}
      <div role="table" aria-label="Données de l'import" className="overflow-x-auto">
        <div style={{ minWidth: 34 + 72 + item.columns.length * 150 + 44 }}>
          <div
            role="row"
            className="grid border-b border-bordure bg-survol"
            style={grid(item.columns)}
          >
            <div role="columnheader" className="flex justify-center py-2">
              <input
                type="checkbox"
                className={coche}
                checked={everything}
                onChange={() => {
                  setSelected(new Set())
                  setEverything(!everything)
                }}
                aria-label="Sélectionner toutes les lignes filtrées"
              />
            </div>
            <div role="columnheader" className={`${entete} text-right`}>
              Ligne
            </div>
            {item.columns.map((column) => {
              const sorted =
                state.sort === column.key
                  ? 'ascending'
                  : state.sort === `-${column.key}`
                    ? 'descending'
                    : 'none'
              return (
                <div key={column.key} role="columnheader" aria-sort={sorted} className={entete}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    title={
                      sorted === 'ascending'
                        ? 'Cliquer pour trier par ordre décroissant'
                        : sorted === 'descending'
                          ? 'Cliquer pour retirer le tri'
                          : 'Cliquer pour trier par ordre croissant'
                    }
                    className="-mx-1.5 flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 uppercase hover:bg-surface-2 hover:text-texte"
                  >
                    {column.label || column.key}
                    {/* Les deux flèches restent visibles : la colonne se lit comme triable avant tout clic. */}
                    <span aria-hidden="true" className="flex flex-col text-[9px] leading-[9px]">
                      <span className={sorted === 'ascending' ? 'text-rouge' : 'text-texte-doux'}>▲</span>
                      <span className={sorted === 'descending' ? 'text-rouge' : 'text-texte-doux'}>▼</span>
                    </span>
                  </button>
                  <span className="text-[10.5px] font-normal tracking-normal text-texte-pale normal-case">
                    {TYPE_LABELS[column.type]}
                  </span>
                </div>
              )
            })}
            <div role="columnheader" className="sr-only">
              Actions
            </div>
          </div>
          <div className="grid border-b border-bordure py-1.5" style={grid(item.columns)}>
            <div />
            <div />
            {item.columns.map((column) => (
              <div key={column.key} className="px-2">
                {filter(column)}
              </div>
            ))}
            <div />
          </div>
          {body}
        </div>
      </div>
      <Pagination state={state} total={total} onChange={update} />
      {editing && <RowEditor item={item} row={editing} onClose={() => setEditing(null)} />}
      {batch === 'edit' && (
        <BatchEditor
          item={item}
          selection={selection}
          count={count}
          onClose={() => setBatch(null)}
          onDone={(changed) => finish(changed, 'modifiées')}
        />
      )}
      {batch === 'delete' && (
        <ConfirmDialog
          title={`Supprimer ${NOMBRE.format(count)} ligne${count > 1 ? 's' : ''} ?`}
          description="Les lignes supprimées ne peuvent pas être récupérées."
          confirmLabel="Supprimer"
          onCancel={() => setBatch(null)}
          onConfirm={() =>
            remove.mutate(selection, { onSuccess: (result) => finish(result.count, 'supprimées') })
          }
        />
      )}
    </section>
  )
}
