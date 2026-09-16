import { useState } from 'react'

import { useDetectTypes, useJob, useUploadFile } from '../hooks/useImports'
import { ApiError } from '../services/api'
import type { Column, Import } from '../types/imports'
import ColumnsPreview from './ColumnsPreview'
import ConfirmDialog from './ConfirmDialog'
import FilePicker from './FilePicker'
import ImportProgress from './ImportProgress'

const NOMBRE = new Intl.NumberFormat('fr-FR')

/** Texte d'une erreur d'appel : le message du backend, ou une panne réseau. */
function reason(error: Error, prefix = ''): string {
  return error instanceof ApiError ? `${prefix}${error.message}` : 'Le serveur ne répond pas.'
}

/** Colonnes ajoutées et disparues entre les données en place et le nouveau fichier. */
function columnChanges(before: Column[], after: Column[]): string {
  const beforeKeys = new Set(before.map((column) => column.key))
  const afterKeys = new Set(after.map((column) => column.key))
  const added = after.filter((column) => !beforeKeys.has(column.key)).map((c) => c.label)
  const removed = before.filter((column) => !afterKeys.has(column.key)).map((c) => c.label)
  return [
    added.length > 0 ? `Colonnes ajoutées : ${added.join(', ')}.` : '',
    removed.length > 0 ? `Colonnes disparues : ${removed.join(', ')}.` : '',
  ].join(' ')
}

/** Envoi d'un fichier dans un import : choix, aperçu des types, import et progression. */
export default function FileImport({ item }: { item: Import }) {
  const detection = useDetectTypes(item.id)
  const upload = useUploadFile(item.id)
  // Le job de l'import en cours, y compris quand l'envoi a été fait avant de quitter la page.
  const job = useJob(upload.data?.id ?? (item.status === 'importing' ? item.job_id : null))
  const [file, setFile] = useState<File | null>(null)
  const [confirming, setConfirming] = useState(false)

  const analyse = (picked: File) => {
    setFile(picked)
    upload.reset()
    detection.mutate(picked)
  }

  const start = () => {
    if (!file) return
    setConfirming(false)
    detection.reset()
    upload.mutate(file)
  }

  const jobRunning = upload.isSuccess && job.data?.status !== 'done' && job.data?.status !== 'failed'
  // Tant que la liste relue n'a pas vu la fin de l'import, la barre reste à l'écran.
  if (upload.isPending || jobRunning || item.status === 'importing') {
    return <ImportProgress fileName={file?.name} job={job.data} />
  }

  const problem =
    (detection.error && reason(detection.error, 'Fichier refusé : ')) ||
    (upload.error && reason(upload.error)) ||
    (item.error && `Le dernier import a échoué : ${item.error}`)
  const alert = problem && (
    <p role="alert" className="px-4 pb-3 text-danger">
      {problem}
    </p>
  )

  if (detection.data) {
    const replacing = item.status === 'ready'
    return (
      <section className="border border-bordure bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordure px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Aperçu de {file?.name}</h2>
            <p className="text-xs text-texte-doux">
              {detection.data.length} colonnes détectées. Rien n'est enregistré avant l'import.
            </p>
          </div>
          <div className="flex gap-2">
            <FilePicker label="Changer de fichier" onPick={analyse} />
            <button
              type="button"
              onClick={replacing ? () => setConfirming(true) : start}
              className="h-8 rounded-sm bg-rouge px-3 font-medium text-white hover:bg-rouge-fonce"
            >
              Importer le fichier
            </button>
          </div>
        </div>
        <ColumnsPreview columns={detection.data} />
        {confirming && (
          <ConfirmDialog
            title="Remplacer les données ?"
            description={`Les ${NOMBRE.format(item.row_count)} lignes actuelles seront remplacées. ${columnChanges(item.columns, detection.data)}`.trim()}
            confirmLabel="Remplacer"
            onCancel={() => setConfirming(false)}
            onConfirm={start}
          />
        )}
      </section>
    )
  }

  const picker = detection.isPending ? (
    <p className="text-texte-doux">Analyse de {file?.name}…</p>
  ) : null

  if (item.status === 'ready') {
    return (
      <section className="border border-bordure bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordure px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Colonnes de l'import</h2>
            <p className="text-xs text-texte-doux">
              {NOMBRE.format(item.row_count)} lignes, {item.columns.length} colonnes.
            </p>
          </div>
          {picker ?? <FilePicker label="Remplacer les données" onPick={analyse} />}
        </div>
        {alert}
        <ColumnsPreview columns={item.columns} />
      </section>
    )
  }

  return (
    <section className="border border-bordure bg-surface px-6 py-11 text-center">
      <h2 className="text-[15px] font-semibold">Aucune donnée pour cet import</h2>
      <p className="mx-auto mt-1.5 mb-3.5 max-w-[54ch] text-texte-doux">
        Envoyez un fichier CSV ou XLSX. Le type de chaque colonne vous est présenté avant
        l'import.
      </p>
      {picker ?? <FilePicker label="Choisir un fichier" onPick={analyse} primary />}
      <div className="mt-3">{alert}</div>
    </section>
  )
}
