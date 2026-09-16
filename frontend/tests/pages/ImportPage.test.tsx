import { screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Route, Routes } from 'react-router'

import ImportPage from '../../src/pages/ImportPage'
import { fakeApi, makeImport } from '../fakeApi'
import { renderWithProviders } from '../helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

const routes = (
  <Routes>
    <Route path="/imports/:importId" element={<ImportPage />} />
  </Routes>
)

test("affiche le nom de l'import", async () => {
  fakeApi([makeImport('1', 'Clients', 0)])
  renderWithProviders(routes, '/imports/1')

  expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument()
})

test('signale un import inconnu', async () => {
  fakeApi([])
  renderWithProviders(routes, '/imports/42')

  expect(await screen.findByRole('alert')).toHaveTextContent("Cet import n'existe pas.")
})
