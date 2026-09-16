import type { Column, ColumnType } from '../types/imports'

const TYPES: Record<ColumnType, string> = {
  boolean: 'Booléen',
  integer: 'Entier',
  float: 'Décimal',
  string: 'Texte',
}

const entete =
  'border-b border-bordure px-4 py-2.5 text-[11px] font-semibold tracking-[0.05em] text-texte-doux uppercase'
const cellule = 'border-b border-filet px-4 py-2'

/** Tableau des colonnes détectées : en-tête d'origine, clé en base, type. */
export default function ColumnsPreview({ columns }: { columns: Column[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-survol">
            <th className={entete}>En-tête du fichier</th>
            <th className={entete}>Clé en base</th>
            <th className={entete}>Type détecté</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.key} className="hover:bg-survol">
              <td className={cellule}>
                {column.label || <span className="text-texte-pale">sans nom</span>}
              </td>
              <td className={`${cellule} font-mono text-xs text-texte-doux`}>{column.key}</td>
              <td className={cellule}>{TYPES[column.type]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
