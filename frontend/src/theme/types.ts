import type { ColumnType } from '../types/imports'

/** Ordre du menu : du plus précis au moins précis, comme à la détection. */
export const TYPE_ORDER: ColumnType[] = ['boolean', 'integer', 'float', 'string']

export const TYPE_LABELS: Record<ColumnType, string> = {
  boolean: 'Booléen',
  integer: 'Entier',
  float: 'Décimal',
  string: 'Texte',
}

/** Forme employée dans les messages : « ne peuvent pas devenir des entiers ». */
export const TYPE_PLURALS: Record<ColumnType, string> = {
  boolean: 'des booléens',
  integer: 'des entiers',
  float: 'des décimaux',
  string: 'du texte',
}

/** Forme employée au singulier : « ne peut pas devenir un entier ». */
export const TYPE_SINGULARS: Record<ColumnType, string> = {
  boolean: 'un booléen',
  integer: 'un entier',
  float: 'un décimal',
  string: 'du texte',
}
