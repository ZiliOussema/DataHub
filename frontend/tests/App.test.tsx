import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '../src/App.tsx'

test('affiche le nom de l’application', () => {
  render(<App />)

  expect(screen.getByRole('heading', { name: 'Datahub' })).toBeInTheDocument()
})
