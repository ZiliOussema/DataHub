import type { Job } from '../types/imports'

const NOMBRE = new Intl.NumberFormat('fr-FR')

interface Props {
  fileName?: string
  job?: Job
}

/** Avancement d'un import : étape en cours, lignes insérées sur le total, barre de progression. */
export default function ImportProgress({ fileName, job }: Props) {
  const counted = job !== undefined && job.total > 0
  const percent = counted ? Math.round((job.processed / job.total) * 100) : 0

  return (
    <section className="flex flex-col gap-3 border border-bordure bg-surface p-5">
      <p>
        {fileName ? (
          <>
            Import de <span className="font-semibold">{fileName}</span>.
          </>
        ) : (
          'Import en cours.'
        )}{' '}
        <span className="text-texte-doux">Il continue même si vous quittez la page.</span>
      </p>
      <div className="flex justify-between text-xs text-texte-doux">
        <span>{counted ? 'Insertion des lignes' : 'Lecture du fichier'}</span>
        {counted && (
          <span>
            {NOMBRE.format(job.processed)} sur {NOMBRE.format(job.total)}
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Progression de l'import"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={counted ? percent : undefined}
        className="h-1 overflow-hidden bg-surface-2"
      >
        {counted ? (
          <div
            className="h-full bg-rouge transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        ) : (
          // Total encore inconnu pendant la lecture du fichier : une bande qui défile montre
          // que le travail avance.
          <div className="h-full w-1/3 animate-defile bg-rouge motion-reduce:animate-none" />
        )}
      </div>
    </section>
  )
}
