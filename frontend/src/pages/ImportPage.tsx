import { useParams } from 'react-router'

import FileImport from '../components/FileImport'
import Statut from '../components/Statut'
import { useImports } from '../hooks/useImports'

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** Page d'un import : son en-tête, puis l'envoi d'un fichier ou les colonnes en place. */
export default function ImportPage() {
  const { importId } = useParams()
  const { data: imports, isPending } = useImports()
  const item = imports?.find((candidate) => candidate.id === importId)

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
          <FileImport key={item.id} item={item} />
        </>
      )}
    </main>
  )
}
