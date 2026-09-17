export type ColumnType = 'boolean' | 'integer' | 'float' | 'string'

export interface Column {
  label: string
  key: string
  type: ColumnType
}

export type ImportStatus = 'empty' | 'importing' | 'ready' | 'failed'

export interface Import {
  id: string
  name: string
  order: number
  status: ImportStatus
  columns: Column[]
  row_count: number
  error: string | null
  job_id: string | null
  created_at: string
  updated_at: string
}

export interface Job {
  id: string
  import_id: string
  status: 'running' | 'done' | 'failed'
  processed: number
  total: number
  error: string | null
}

export interface TypeCheck {
  invalid_count: number
  examples: string[]
}

/** Une ligne du tableau : son numéro dans le fichier, puis une valeur par clé de colonne. */
export interface Row {
  _id: number
  [key: string]: string | number | boolean | null
}

export interface DataPage {
  total: number
  rows: Row[]
}

/** Ce que l'URL de la page mémorise : page, taille, tri et filtres. */
export interface TableState {
  page: number
  size: number
  sort: string | null
  /** Clé du filtre sans le préfixe f. : « ville », « age.min », « actif ». */
  filters: Record<string, string>
}
