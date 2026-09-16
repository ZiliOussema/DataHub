export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Message d'erreur renvoyé par le backend, ou un message par défaut. */
async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    // 422 de FastAPI : une liste d'erreurs de validation, on montre la première.
    if (Array.isArray(body.detail)) {
      const [first] = body.detail as { msg?: unknown }[]
      if (typeof first?.msg === 'string') return first.msg
    }
  } catch {
    // Corps vide ou illisible : on garde le message par défaut.
  }
  return `Erreur ${response.status}`
}

/** Appelle l'API et renvoie le JSON. Lève ApiError si le statut n'est pas un succès. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) throw new ApiError(response.status, await readDetail(response))
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Options d'un appel qui envoie du JSON. */
export function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}
