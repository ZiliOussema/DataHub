import { useParams, useSearchParams } from 'react-router'

import DataTable from '../components/DataTable'
import FileImport from '../components/FileImport'
import Statut from '../components/Statut'
import { useImports } from '../hooks/useImports'

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const TABS = [
  { id: 'colonnes', label: 'Colonnes' },
  { id: 'donnees', label: 'Données' },
] as const

/** Page d'un import : son en-tête, puis l'envoi d'un fichier ou les colonnes en place. */
export default function ImportPage() {
  const { importId } = useParams()
  const [params, setParams] = useSearchParams()
  const { data: imports, isPending } = useImports()
  const item = imports?.find((candidate) => candidate.id === importId)
  const tab = params.get('tab') === 'colonnes' ? 'colonnes' : 'donnees'

  const open = (id: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('tab', id)
        return next
      },
      { replace: true },
    )

  return (
    <main className="flex flex-col gap-4 px-6 pt-5 pb-14">
      {isPending && <p className="text-texte-doux">Chargement…</p>}
      {!isPending && !item && (
        <p role="alert" className="text-danger">
          Cet import n'existe pas.
        </p>
      )}
      {item && (
        <>
          <div>
            <h1 className="font-titre text-xl font-bold">{item.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3.5 text-xs text-texte-doux">
              <Statut statut={item.status} />
              <span>Modifié le {DATE.format(new Date(item.updated_at))}</span>
            </div>
          </div>
          {item.columns.length > 0 ? (
            <>
              <div role="tablist" className="flex border-b border-bordure">
                {TABS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => open(id)}
                    className={`-mb-px border-b-2 px-3.5 py-2.5 font-medium ${
                      tab === id
                        ? 'border-rouge font-semibold text-texte'
                        : 'border-transparent text-texte-doux hover:text-texte'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === 'donnees' ? (
                <DataTable key={item.id} item={item} />
              ) : (
                <FileImport key={item.id} item={item} />
              )}
            </>
          ) : (
            <FileImport key={item.id} item={item} />
          )}
        </>
      )}
    </main>
  )
}
