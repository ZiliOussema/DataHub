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
