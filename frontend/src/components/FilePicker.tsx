interface Props {
  label: string
  onPick: (file: File) => void
  primary?: boolean
}

/** Bouton de choix d'un fichier CSV ou XLSX. */
export default function FilePicker({ label, onPick, primary = false }: Props) {
  return (
    <label
      className={`inline-flex h-8 cursor-pointer items-center rounded-sm px-3 font-medium whitespace-nowrap ${
        primary
          ? 'bg-rouge text-white hover:bg-rouge-fonce'
          : 'border border-bordure bg-surface hover:bg-survol'
      } has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-rouge`}
    >
      {label}
      <input
        type="file"
        accept=".csv,.xlsx"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Vidé aussitôt : choisir à nouveau le même fichier doit relancer l'analyse.
          event.target.value = ''
          if (file) onPick(file)
        }}
      />
    </label>
  )
}
