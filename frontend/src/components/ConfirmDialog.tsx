interface Props {
  title: string
  description?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** Demande une confirmation avant une action irréversible. */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-nuit/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-sm bg-surface shadow-[0_18px_50px_rgba(20,30,38,0.25)]"
      >
        <div className="px-5 pt-5">
          <h2 className="text-base font-bold">{title}</h2>
          {description && <p className="mt-1.5 text-xs text-texte-doux">{description}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-filet bg-survol px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-sm border border-bordure bg-surface px-3 font-medium hover:bg-survol"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 rounded-sm bg-rouge px-3 font-medium text-white hover:bg-rouge-fonce"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
