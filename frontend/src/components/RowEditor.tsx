import { useState } from 'react'

import { useRowUpdate } from '../hooks/useImports'
import { ApiError } from '../services/api'
import { TYPE_LABELS } from '../theme/types'
import type { Column, Import, Row } from '../types/imports'

const champ = 'h-8 w-full rounded-sm border bg-surface px-2.5 focus:border-bleu focus:outline-none'
const bouton = 'h-8 rounded-sm border border-bordure bg-surface px-3 font-medium hover:bg-survol'
const principal =
  'h-8 rounded-sm bg-rouge px-3 font-medium text-white hover:bg-rouge-fonce disabled:cursor-not-allowed disabled:opacity-45'

/** Valeur écrite comme on la saisirait : 12,5 pour un décimal, vrai ou faux pour un booléen. */
function asText(value: Row[string] | undefined, column: Column): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'vrai' : 'faux'
  if (column.type === 'float') return String(value).replace('.', ',')
  return String(value)
}

interface Props {
  item: Import
  row: Row
  onClose: () => void
}

/** Modification d'une ligne en deux temps : la saisie, puis le récapitulatif avant d'enregistrer. */
export default function RowEditor({ item, row, onClose }: Props) {
  const initial = Object.fromEntries(item.columns.map((c) => [c.key, asText(row[c.key], c)]))
  const [values, setValues] = useState(initial)
  const [reviewing, setReviewing] = useState(false)
  const update = useRowUpdate(item.id)

  const changed = item.columns.filter((column) => values[column.key] !== initial[column.key])
  const fields = update.error instanceof ApiError ? update.error.fields : {}
  const general =
    update.error && Object.keys(fields).length === 0
      ? update.error instanceof ApiError
        ? update.error.message
        : 'Le serveur ne répond pas.'
      : null

  const save = () =>
    update.mutate(
      { rowId: row._id, values: Object.fromEntries(changed.map((c) => [c.key, values[c.key]])) },
      // Valeurs refusées : retour à la saisie, où chaque message s'affiche sous son champ.
      { onSuccess: onClose, onError: () => setReviewing(false) },
    )

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-nuit/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Modifier la ligne ${row._id + 1}`}
        className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-sm bg-surface shadow-[0_18px_50px_rgba(20,30,38,0.25)]"
      >
        <div className="px-5 pt-5">
          <h2 className="text-base font-bold">
            {reviewing
              ? `Enregistrer ${changed.length} modification${changed.length > 1 ? 's' : ''} ?`
              : `Modifier la ligne ${row._id + 1}`}
          </h2>
          {!reviewing && (
            <p className="mt-1.5 text-xs text-texte-doux">
              Laissez un champ vide pour effacer sa valeur.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 overflow-auto px-5 py-4">
          {general && (
            <p role="alert" className="text-danger">
              {general}
            </p>
          )}
          {reviewing
            ? changed.map((column) => (
                <p
                  key={column.key}
                  className="grid grid-cols-[150px_1fr] gap-3 border-b border-filet py-1.5"
                >
                  <span className="font-medium">{column.label || column.key}</span>
                  <span>
                    <span className="mr-2 text-texte-pale line-through">
                      {initial[column.key] || 'vide'}
                    </span>
                    {values[column.key] || 'vide'}
                  </span>
                </p>
              ))
            : item.columns.map((column) => {
                const id = `valeur-${column.key}`
                const error = fields[column.key]
                const props = {
                  id,
                  value: values[column.key],
                  'aria-invalid': error !== undefined,
                  'aria-describedby': error ? `${id}-erreur` : undefined,
                  className: `${champ} ${error ? 'border-danger' : 'border-bordure'}`,
                }
                const change = (value: string) => setValues({ ...values, [column.key]: value })
                return (
                  <div key={column.key} className="grid grid-cols-[150px_1fr] items-start gap-3">
                    <label htmlFor={id} className="flex flex-col pt-1.5">
                      {column.label || column.key}
                      <span className="text-[10.5px] text-texte-pale">
                        {TYPE_LABELS[column.type]}
                      </span>
                    </label>
                    <div>
                      {column.type === 'boolean' ? (
                        <select {...props} onChange={(event) => change(event.target.value)}>
                          <option value="">vide</option>
                          <option value="vrai">vrai</option>
                          <option value="faux">faux</option>
                        </select>
                      ) : (
                        <input
                          {...props}
                          inputMode={column.type === 'string' ? 'text' : 'decimal'}
                          onChange={(event) => change(event.target.value)}
                        />
                      )}
                      {error && (
                        <p id={`${id}-erreur`} className="mt-1 text-xs text-danger">
                          {error}
                        </p>
                      )}
                    </div>
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
                {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
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
                disabled={changed.length === 0}
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
