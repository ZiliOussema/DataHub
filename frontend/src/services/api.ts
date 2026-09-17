export class ApiError extends Error {
  status: number
  /** Un message par champ, quand le backend refuse plusieurs valeurs d'un coup. */
  fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

/** Erreur renvoyée par le backend : message, messages par champ, ou message par défaut. */
async function readError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return new ApiError(response.status, body.detail)
    // 422 de FastAPI : une liste d'erreurs de validation, on montre la première.
    if (Array.isArray(body.detail)) {
      const [first] = body.detail as { msg?: unknown }[]
      if (typeof first?.msg === 'string') return new ApiError(response.status, first.msg)
    }
    if (body.detail && typeof body.detail === 'object') {
      const fields = body.detail as Record<string, string>
      return new ApiError(response.status, 'Certaines valeurs sont invalides', fields)
    }
  } catch {
    // Corps vide ou illisible : on garde le message par défaut.
  }
  return new ApiError(response.status, `Erreur ${response.status}`)
}

/** Appelle l'API et renvoie le JSON. Lève ApiError si le statut n'est pas un succès. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) throw await readError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Options d'un appel qui envoie du JSON. */
export function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}
