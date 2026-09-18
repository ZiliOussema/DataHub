import { useState } from 'react'

import { useRowBatch } from '../hooks/useImports'
import { ApiError } from '../services/api'
import { TYPE_LABELS } from '../theme/types'
import type { FieldAction, Import, Selection } from '../types/imports'

const NOMBRE = new Intl.NumberFormat('fr-FR')
const MODES = [
  ['keep', 'Conserver'],
  ['set', 'Modifier'],
  ['clear', 'Vider'],
] as const

type Mode = (typeof MODES)[number][0]

const bouton = 'h-8 rounded-sm border border-bordure bg-surface px-3 font-medium hover:bg-survol'
const principal =
  'h-8 rounded-sm bg-rouge px-3 font-medium text-white hover:bg-rouge-fonce disabled:cursor-not-allowed disabled:opacity-45'

interface Props {
  item: Import
  selection: Selection
  count: number
  onClose: () => void
  onDone: (count: number) => void
}

/** Modification par lot : pour chaque colonne, conserver, modifier ou vider la valeur. */
export default function BatchEditor({ item, selection, count, onClose, onDone }: Props) {
  const [modes, setModes] = useState<Record<string, Mode>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [reviewing, setReviewing] = useState(false)
  const { update } = useRowBatch(item.id)

  const touched = item.columns.filter((column) => (modes[column.key] ?? 'keep') !== 'keep')
  const fields = update.error instanceof ApiError ? update.error.fields : {}
  const general =
    update.error && Object.keys(fields).length === 0
      ? update.error instanceof ApiError
        ? update.error.message
        : 'Le serveur ne répond pas.'
      : null

  const save = () => {
    const changes: Record<string, FieldAction> = Object.fromEntries(
      touched.map((column) => [
        column.key,
        modes[column.key] === 'clear'
          ? { action: 'clear' }
          : { action: 'set', value: values[column.key] ?? '' },
      ]),
    )
    update.mutate(
      { selection, changes },
      { onSuccess: (result) => onDone(result.count), onError: () => setReviewing(false) },
    )
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-nuit/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Modifier ${count} lignes`}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-sm bg-surface shadow-[0_18px_50px_rgba(20,30,38,0.25)]"
      >
        <div className="px-5 pt-5">
          <h2 className="text-base font-bold">
            {reviewing
              ? `Appliquer à ${NOMBRE.format(count)} lignes ?`
              : `Modifier ${NOMBRE.format(count)} lignes`}
          </h2>
          <p className="mt-1.5 text-xs text-texte-doux">
            {reviewing
              ? 'Les colonnes absentes de cette liste ne sont pas touchées.'
              : 'Pour chaque colonne : conserver les valeurs, les remplacer, ou les vider.'}
          </p>
        </div>

        <div className="flex flex-col gap-1 overflow-auto px-5 py-4">
          {general && (
            <p role="alert" className="pb-2 text-danger">
              {general}
            </p>
          )}
          {reviewing
            ? touched.map((column) => (
                <p
                  key={column.key}
                  className="grid grid-cols-[170px_1fr] gap-3 border-b border-filet py-1.5"
                >
                  <span className="font-medium">{column.label || column.key}</span>
                  <span>
                    {modes[column.key] === 'clear'
                      ? 'Valeurs vidées'
                      : `Remplacées par ${values[column.key] || ''}`}
                  </span>
                </p>
              ))
            : item.columns.map((column) => {
                const mode = modes[column.key] ?? 'keep'
                const error = fields[column.key]
                return (
                  <div
                    key={column.key}
                    className="grid grid-cols-[170px_auto_1fr] items-center gap-3 border-b border-filet py-2"
                  >
                    <span className="flex flex-col">
                      {column.label || column.key}
                      <span className="text-[10.5px] text-texte-pale">
                        {TYPE_LABELS[column.type]}
                      </span>
                    </span>
                    <span
                      role="group"
                      aria-label={column.label || column.key}
                      className="inline-flex overflow-hidden rounded-sm border border-bordure"
                    >
                      {MODES.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={mode === value}
                          onClick={() => setModes({ ...modes, [column.key]: value })}
                          className={`h-7 border-r border-bordure px-2.5 text-xs last:border-r-0 ${
                            mode === value ? 'bg-nuit text-white' : 'bg-surface hover:bg-survol'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                    <span>
                      {mode === 'set' && (
                        <input
                          aria-label={`Nouvelle valeur de ${column.label || column.key}`}
                          aria-invalid={error !== undefined}
                          value={values[column.key] ?? ''}
                          onChange={(event) =>
                            setValues({ ...values, [column.key]: event.target.value })
                          }
                          className={`h-8 w-full rounded-sm border bg-surface px-2.5 focus:border-bleu focus:outline-none ${
                            error ? 'border-danger' : 'border-bordure'
                          }`}
                        />
                      )}
                      {error && <span className="text-xs text-danger">{error}</span>}
                    </span>
                  </div>
                )
              })}
        </div>

        <div className="flex justify-end gap-2 border-t border-filet bg-survol px-5 py-3">
          {reviewing ? (
            <>
              <button type="button" onClick={() => setReviewing(false)} className={bouton}>
                Revenir
              </button>
              <button
                type="button"
                onClick={save}
                disabled={update.isPending}
                className={principal}
              >
                {update.isPending ? 'Application…' : 'Appliquer'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className={bouton}>
                Annuler
              </button>
              <button
                type="button"
                onClick={() => setReviewing(true)}
                disabled={touched.length === 0}
                className={principal}
              >
                Vérifier les modifications
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
