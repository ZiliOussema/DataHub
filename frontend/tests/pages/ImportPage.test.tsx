import { screen, waitFor, within } from '@testing-library/react'
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

const columns = [
  { label: 'Nom', key: 'nom', type: 'string' as const },
  { label: 'Montant', key: 'montant', type: 'float' as const },
]

test("importe le fichier analysé et affiche les colonnes de l'import", async () => {
  const api = fakeApi([makeImport('1', 'Ventes', 0)], columns)
  renderWithProviders(routes, '/imports/1?tab=colonnes')

  await userEvent.upload(
    await screen.findByLabelText('Choisir un fichier'),
    new File(['Nom;Montant'], 'ventes.csv'),
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Importer le fichier' }))

  expect(await screen.findByRole('heading', { name: "Colonnes de l'import" })).toBeInTheDocument()
  expect(screen.getByText('2 lignes, 2 colonnes.')).toBeInTheDocument()
  expect(api.calls.some((call) => call.url === '/api/imports/1/upload')).toBe(true)
})

test('demande confirmation avant de remplacer des données, en listant les colonnes changées', async () => {
  const ready = makeImport('1', 'Ventes', 0, {
    status: 'ready',
    row_count: 1500,
    columns: [
      { label: 'Nom', key: 'nom', type: 'string' },
      { label: 'Ville', key: 'ville', type: 'string' },
    ],
  })
  const api = fakeApi([ready], columns)
  renderWithProviders(routes, '/imports/1?tab=colonnes')

  await userEvent.upload(
    await screen.findByLabelText('Remplacer les données'),
    new File(['Nom;Montant'], 'ventes.csv'),
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Importer le fichier' }))

  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent(/1\s500 lignes actuelles seront remplacées/)
  expect(dialog).toHaveTextContent('Colonnes ajoutées : Montant. Colonnes disparues : Ville.')
  expect(api.calls.some((call) => call.url === '/api/imports/1/upload')).toBe(false)

  await userEvent.click(within(dialog).getByRole('button', { name: 'Remplacer' }))

  expect(api.calls.some((call) => call.url === '/api/imports/1/upload')).toBe(true)
})

test("rappelle la raison du dernier échec d'un import", async () => {
  fakeApi([makeImport('1', 'Ventes', 0, { status: 'failed', error: 'La ligne 3 contient trop de valeurs' })])
  renderWithProviders(routes, '/imports/1')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Le dernier traitement a échoué : La ligne 3 contient trop de valeurs',
  )
})

test('affiche une barre de progression pour un import en cours', async () => {
  fakeApi([makeImport('1', 'Ventes', 0, { status: 'importing' })])
  renderWithProviders(routes, '/imports/1')

  expect(await screen.findByRole('progressbar')).toBeInTheDocument()
  expect(screen.getByText('Import en cours.')).toBeInTheDocument()
})

test("suit jusqu'au bout le job d'un import déjà en cours à l'ouverture de la page", async () => {
  fakeApi([makeImport('1', 'Ventes', 0, { status: 'importing', job_id: 'job-1' })], columns)
  renderWithProviders(routes, '/imports/1?tab=colonnes')

  expect(await screen.findByRole('heading', { name: "Colonnes de l'import" })).toBeInTheDocument()
})

const ventesPretes = () =>
  makeImport('1', 'Ventes', 0, {
    status: 'ready',
    row_count: 1500,
    columns: [{ label: 'Montant', key: 'montant', type: 'float' }],
  })

test("une suppression par lot fait relire la fiche, qui porte le nombre de lignes", async () => {
  const lignes = [
    { _id: 0, montant: 1.5 },
    { _id: 1, montant: 2.5 },
  ]
  const api = fakeApi([ventesPretes()], [], undefined, lignes)
  renderWithProviders(routes, '/imports/1?tab=donnees')
  await screen.findByText('Lignes 1 à 2 sur 2')
  const avant = api.calls.filter((call) => call.url.endsWith('/api/imports')).length

  await userEvent.click(screen.getByLabelText('Sélectionner toutes les lignes filtrées'))
  await userEvent.click(screen.getByRole('button', { name: 'Supprimer la sélection' }))
  const dialog = screen.getByRole('dialog', { name: 'Supprimer 2 lignes ?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }))

  await screen.findByText('2 lignes supprimées')
  // Sans cette relecture, l'onglet Colonnes continue d'annoncer l'ancien nombre de lignes.
  await waitFor(() =>
    expect(api.calls.filter((call) => call.url.endsWith('/api/imports')).length).toBeGreaterThan(
      avant,
    ),
  )
})

test('refuse un changement de type qui perdrait des valeurs, en montrant lesquelles', async () => {
  const api = fakeApi([ventesPretes()], [], { invalid_count: 3, examples: ['1,5', 'N/A', '12.7'] })
  renderWithProviders(routes, '/imports/1?tab=colonnes')

  await userEvent.selectOptions(await screen.findByLabelText('Type de Montant'), 'integer')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '3 valeurs ne peuvent pas devenir des entiers, par exemple « 1,5 », « N/A », « 12.7 ».',
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.calls.some((call) => call.method === 'PATCH')).toBe(false)
})

test("une seule valeur fautive s'accorde au singulier", async () => {
  fakeApi([ventesPretes()], [], { invalid_count: 1, examples: ['1,5'] })
  renderWithProviders(routes, '/imports/1?tab=colonnes')

  await userEvent.selectOptions(await screen.findByLabelText('Type de Montant'), 'integer')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '1 valeur ne peut pas devenir un entier, par exemple « 1,5 ».',
  )
})

test('convertit une colonne après confirmation', async () => {
  const api = fakeApi([ventesPretes()])
  renderWithProviders(routes, '/imports/1?tab=colonnes')

  await userEvent.selectOptions(await screen.findByLabelText('Type de Montant'), 'integer')
  const dialog = await screen.findByRole('dialog', { name: 'Convertir « Montant » en entier ?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Convertir' }))

  const patch = api.calls.find((call) => call.method === 'PATCH')
  expect(patch).toMatchObject({ url: '/api/imports/1/columns/montant/type', body: { type: 'integer' } })
  expect(await screen.findByDisplayValue('Entier')).toBeInTheDocument()
})
