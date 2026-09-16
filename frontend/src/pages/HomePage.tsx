import CreateImportForm from '../components/CreateImportForm'
import ImportRow from '../components/ImportRow'
import { useImports, useMoveImport } from '../hooks/useImports'

const entete = 'border-b border-bordure px-4 py-2.5 text-[11px] font-semibold tracking-[0.05em] text-texte-doux uppercase'

/** Liste des imports, avec création, renommage, déplacement et suppression. */
export default function HomePage() {
  const { data: imports, isPending, isError } = useImports()
  const move = useMoveImport()
  const sansDonnees = imports?.filter((item) => item.status === 'empty').length ?? 0

  return (
    <main className="flex flex-col gap-4 px-6 pt-5 pb-14">
      {/* Deux chiffres seulement : le nombre de lignes et les imports en échec arriveront avec l'upload. */}
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] border border-bordure bg-surface">
        <div className="border-r border-filet px-4 py-3">
          <dt className="text-[11px] font-semibold tracking-[0.07em] text-texte-doux uppercase">
            Imports
          </dt>
          <dd className="mt-1.5 font-titre text-[25px] leading-none font-bold">
            {imports?.length ?? '—'}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[11px] font-semibold tracking-[0.07em] text-texte-doux uppercase">
            En attente de données
          </dt>
          <dd className="mt-1.5 font-titre text-[25px] leading-none font-bold">
            {imports ? sansDonnees : '—'}
          </dd>
        </div>
      </dl>

      <section className="border border-bordure bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordure px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold">Tous les imports</h1>
            <p className="text-xs text-texte-doux">L'ordre de cette liste est celui de l'application.</p>
          </div>
          <CreateImportForm />
        </div>

        {isPending && <p className="px-4 py-11 text-center text-texte-doux">Chargement…</p>}
        {isError && (
          <p role="alert" className="px-4 py-11 text-center text-danger">
            Le serveur ne répond pas.
          </p>
        )}
        {imports?.length === 0 && (
          <p className="px-4 py-11 text-center text-texte-doux">Aucun import pour le moment.</p>
        )}
        {imports && imports.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-survol">
                  <th className={entete}>Nom</th>
                  <th className={entete}>État</th>
                  <th className={entete}>Modifié</th>
                  <th className={`${entete} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((item, index) => (
                  <ImportRow
                    key={item.id}
                    item={item}
                    isFirst={index === 0}
                    isLast={index === imports.length - 1}
                    onMove={move}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
