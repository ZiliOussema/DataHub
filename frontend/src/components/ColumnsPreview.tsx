import { TYPE_LABELS, TYPE_ORDER } from '../theme/types'
import type { Column, ColumnType } from '../types/imports'

const entete =
  'border-b border-bordure px-4 py-2.5 text-[11px] font-semibold tracking-[0.05em] text-texte-doux uppercase'
const cellule = 'border-b border-filet px-4 py-2'

interface Props {
  columns: Column[]
  /** Fournie, elle transforme chaque type en menu et reçoit le type choisi. */
  onTypeChange?: (column: Column, type: ColumnType) => void
}

/** Tableau des colonnes : en-tête d'origine, clé en base, type. */
export default function ColumnsPreview({ columns, onTypeChange }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-survol">
            <th className={entete}>En-tête du fichier</th>
            <th className={entete}>Clé en base</th>
            <th className={entete}>{onTypeChange ? 'Type' : 'Type détecté'}</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.key} className="hover:bg-survol">
              <td className={cellule}>
                {column.label || <span className="text-texte-pale">sans nom</span>}
              </td>
              <td className={`${cellule} font-mono text-xs text-texte-doux`}>{column.key}</td>
              <td className={cellule}>
                {onTypeChange ? (
                  <select
                    aria-label={`Type de ${column.label || column.key}`}
                    value={column.type}
                    onChange={(event) => onTypeChange(column, event.target.value as ColumnType)}
                    className="h-7 rounded-sm border border-bordure bg-surface px-1.5 focus:border-bleu focus:outline-none"
                  >
                    {TYPE_ORDER.map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                ) : (
                  TYPE_LABELS[column.type]
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
