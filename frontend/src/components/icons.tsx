// Tracés sur une grille de 16 px, épaisseur unique : quatre icônes suffisent à toute l'interface.
const TRACES = {
  monter: 'M8 12.5v-9m0 0L4.5 7M8 3.5 11.5 7',
  descendre: 'M8 3.5v9m0 0L11.5 9M8 12.5 4.5 9',
  renommer: 'M3 13h10M3.5 10.2 10.2 3.5l2.3 2.3L5.8 12.5l-2.8.5z',
  supprimer: 'M3.5 4.5h9m-7 0V3h5v1.5m-6 0 .7 8.2h5.6l.7-8.2',
}

interface Props {
  nom: keyof typeof TRACES
  className?: string
}

/** Icône décorative : le sens est porté par le aria-label du bouton qui la contient. */
export default function Icon({ nom, className = 'h-4 w-4' }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TRACES[nom]} />
    </svg>
  )
}
