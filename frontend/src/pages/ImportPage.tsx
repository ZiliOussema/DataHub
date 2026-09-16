import { useState } from 'react'
import { useParams } from 'react-router'

import ColumnsPreview from '../components/ColumnsPreview'
import FilePicker from '../components/FilePicker'
import Statut from '../components/Statut'
import { useDetectTypes, useImports } from '../hooks/useImports'
import { ApiError } from '../services/api'

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
  const detection = useDetectTypes(importId ?? '')
  const [fileName, setFileName] = useState('')

  const analyse = (file: File) => {
    setFileName(file.name)
    detection.mutate(file)
  }

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
          {detection.data ? (
            <section className="border border-bordure bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordure px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Aperçu de {fileName}</h2>
                  <p className="text-xs text-texte-doux">
                    {detection.data.length} colonnes détectées. Rien n'est enregistré avant l'import.
                  </p>
                </div>
                <FilePicker label="Changer de fichier" onPick={analyse} />
              </div>
              <ColumnsPreview columns={detection.data} />
            </section>
          ) : (
            <section className="border border-bordure bg-surface px-6 py-11 text-center">
              <h2 className="text-[15px] font-semibold">Aucune donnée pour cet import</h2>
              <p className="mx-auto mt-1.5 mb-3.5 max-w-[54ch] text-texte-doux">
                Envoyez un fichier CSV ou XLSX. Le type de chaque colonne vous est présenté avant
                l'import.
              </p>
              {detection.isPending ? (
                <p className="text-texte-doux">Analyse de {fileName}…</p>
              ) : (
                <FilePicker label="Choisir un fichier" onPick={analyse} primary />
              )}
              {detection.error && (
                <p role="alert" className="mt-3 text-danger">
                  {detection.error instanceof ApiError
                    ? `Fichier refusé : ${detection.error.message}`
                    : 'Le serveur ne répond pas.'}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}
