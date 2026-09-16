import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import ImportProgress from '../../src/components/ImportProgress'

test('affiche les lignes insérées sur le total et le pourcentage', () => {
  const job = {
    id: 'j',
    import_id: '1',
    status: 'running' as const,
    processed: 420_000,
    total: 1_000_000,
    error: null,
  }

  render(<ImportProgress fileName="ventes.csv" job={job} />)

  expect(screen.getByText(/420\s000 sur 1\s000\s000/)).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
})

test('annonce la lecture du fichier tant que le total est inconnu', () => {
  render(<ImportProgress fileName="ventes.csv" />)

  expect(screen.getByText('Lecture du fichier')).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
})
