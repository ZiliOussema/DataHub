import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

test('affiche les colonnes détectées du fichier choisi', async () => {
  const api = fakeApi(
    [makeImport('1', 'Ventes', 0)],
    [
      { label: 'Nom', key: 'nom', type: 'string' },
      { label: 'Montant', key: 'montant', type: 'float' },
    ],
  )
  renderWithProviders(routes, '/imports/1')

  const file = new File(['Nom;Montant'], 'ventes.csv')
  await userEvent.upload(await screen.findByLabelText('Choisir un fichier'), file)

  expect(await screen.findByRole('heading', { name: 'Aperçu de ventes.csv' })).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /Montant montant Décimal/ })).toBeInTheDocument()
  const body = api.calls.find((c) => c.url === '/api/imports/1/detect-types')?.body
  expect(body instanceof FormData && body.get('file')).toBe(file)
})

test('affiche la raison du refus du fichier', async () => {
  fakeApi([makeImport('1', 'Ventes', 0)], "La ligne 3 contient plus de valeurs que l'en-tête")
  renderWithProviders(routes, '/imports/1')

  await userEvent.upload(
    await screen.findByLabelText('Choisir un fichier'),
    new File(['a,b'], 'ventes.csv'),
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('Fichier refusé : La ligne 3')
})
