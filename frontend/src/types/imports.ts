export type ColumnType = 'boolean' | 'integer' | 'float' | 'string'

export type ImportStatus = 'empty'

export interface Import {
  id: string
  name: string
  order: number
  status: ImportStatus
  created_at: string
  updated_at: string
}
