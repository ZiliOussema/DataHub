import { useState } from 'react'

import { useImportMutations } from '../hooks/useImports'
import { ApiError } from '../services/api'

/** Formulaire de création d'un import, avec le message d'erreur du backend. */
export default function CreateImportForm() {
  const [name, setName] = useState('')
  const { create } = useImportMutations()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await create.mutateAsync(name)
      setName('')
    } catch {
      // L'erreur est affichée sous le champ à partir de create.error.
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label htmlFor="new-import" className="sr-only">
          Nom du nouvel import
        </label>
        <input
          id="new-import"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nom du nouvel import"
          className="h-8 w-56 rounded-sm border border-bordure bg-surface px-2.5 placeholder:text-texte-pale focus:border-bleu focus:outline-none"
        />
        <button
          type="submit"
          className="h-8 rounded-sm bg-rouge px-3 font-medium whitespace-nowrap text-white hover:bg-rouge-fonce"
        >
          Créer l'import
        </button>
      </div>
      {create.error && (
        <p role="alert" className="text-xs text-danger">
          {create.error instanceof ApiError ? create.error.message : 'Création impossible'}
        </p>
      )}
    </form>
  )
}
