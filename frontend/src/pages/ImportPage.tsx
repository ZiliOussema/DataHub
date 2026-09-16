import { useParams } from 'react-router'

import Statut from '../components/Statut'
import { useImports } from '../hooks/useImports'

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** Page d'un import. Son contenu s'ajoute avec l'upload. */
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
          <section className="border border-bordure bg-surface px-6 py-11 text-center">
            <h2 className="text-[15px] font-semibold">Aucune donnée pour cet import</h2>
            <p className="mx-auto mt-1.5 max-w-[54ch] text-texte-doux">
              Le fichier s'enverra depuis cette page.
            </p>
          </section>
        </>
      )}
    </main>
  )
}
