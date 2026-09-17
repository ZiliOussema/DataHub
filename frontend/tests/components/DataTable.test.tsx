import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { Route, Routes, useLocation } from 'react-router'

import DataTable from '../../src/components/DataTable'
import type { Import, Row } from '../../src/types/imports'
import { fakeApi, makeImport } from '../fakeApi'
import { renderWithProviders } from '../helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const ventes: Import = makeImport('1', 'Ventes', 0, {
  status: 'ready',
  columns: [
    { label: 'Nom', key: 'nom', type: 'string' },
    { label: 'Montant', key: 'montant', type: 'float' },
    { label: 'Actif', key: 'actif', type: 'boolean' },
  ],
})

const lignes = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ _id: i, nom: `Client ${i}`, montant: i + 0.5, actif: i % 2 === 0 }))

/** Affiche le chemin courant, pour vérifier ce que le tableau écrit dans l'URL. */
function Location() {
  const location = useLocation()
  return <output aria-label="url">{location.search}</output>
}

const render = (route = '/imports/1') =>
  renderWithProviders(
    <Routes>
      <Route
        path="/imports/:importId"
        element={
          <>
            <DataTable item={ventes} />
            <Location />
          </>
        }
      />
    </Routes>,
    route,
  )

const dataCalls = (api: ReturnType<typeof fakeApi>) =>
  api.calls.filter((call) => call.url.includes('/data?')).map((call) => new URL(call.url, 'http://t').searchParams)

test('affiche les lignes typées et le total', async () => {
  fakeApi([ventes], [], undefined, lignes(3))
  render()

  expect(await screen.findByText('Lignes 1 à 3 sur 3')).toBeInTheDocument()
  const row = screen.getAllByRole('row')[1]
  expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
    '1',
    'Client 0',
    '0,5',
    'vrai',
    '',
  ])
})

test("reprend la page, la taille, le tri et les filtres écrits dans l'URL", async () => {
  const api = fakeApi([ventes], [], undefined, lignes(30))
  render('/imports/1?page=2&size=10&sort=-montant&f.nom=client')

  await screen.findByText('Lignes 11 à 20 sur 30')
  const [params] = dataCalls(api)
  expect(Object.fromEntries(params)).toEqual({
    offset: '10',
    limit: '10',
    sort: '-montant',
    'f.nom': 'client',
  })
})

test("sans paramètre dans l'URL, reprend le dernier état mémorisé pour cet import", async () => {
  localStorage.setItem('datahub:tableau:1', 'page=1&size=50&sort=nom')
  const api = fakeApi([ventes], [], undefined, lignes(3))
  render()

  await screen.findByText('Lignes 1 à 3 sur 3')
  expect(dataCalls(api)).toHaveLength(1)
  expect(dataCalls(api)[0].get('sort')).toBe('nom')
  expect(screen.getByLabelText('url')).toHaveTextContent('sort=nom')
})

test('un clic sur un en-tête trie, un second inverse le tri', async () => {
  const api = fakeApi([ventes], [], undefined, lignes(3))
  render()
  await screen.findByText('Lignes 1 à 3 sur 3')

  await userEvent.click(screen.getByRole('button', { name: /Montant/ }))
  await waitFor(() => expect(dataCalls(api).at(-1)?.get('sort')).toBe('montant'))
  await userEvent.click(screen.getByRole('button', { name: /Montant/ }))
  await waitFor(() => expect(dataCalls(api).at(-1)?.get('sort')).toBe('-montant'))
})

test("un filtre texte n'appelle l'API qu'une fois la frappe arrêtée", async () => {
  const api = fakeApi([ventes], [], undefined, lignes(3))
  render()
  await screen.findByText('Lignes 1 à 3 sur 3')

  await userEvent.type(screen.getByLabelText('Filtrer Nom'), 'Évry')

  await waitFor(() => expect(dataCalls(api).at(-1)?.get('f.nom')).toBe('Évry'))
  expect(dataCalls(api).filter((params) => params.has('f.nom'))).toHaveLength(1)
})

test('changer la taille de page revient à la page 1', async () => {
  const api = fakeApi([ventes], [], undefined, lignes(30))
  render('/imports/1?page=3&size=10')
  await screen.findByText('Lignes 21 à 30 sur 30')

  await userEvent.selectOptions(screen.getByLabelText('Lignes par page'), '20')

  await waitFor(() => expect(Object.fromEntries(dataCalls(api).at(-1) ?? [])).toMatchObject({ offset: '0', limit: '20' }))
})

test("une grande page ne demande que les paquets de lignes visibles", async () => {
  const api = fakeApi([ventes], [], undefined, lignes(1000))
  render('/imports/1?size=1000')
  await screen.findByText('Lignes 1 à 1 000 sur 1 000')

  expect(dataCalls(api).map((params) => params.get('offset'))).toEqual(['0'])
  const body = screen.getByRole('table').querySelector('.overflow-y-auto')
  fireEvent.scroll(body as Element, { target: { scrollTop: 450 * 34 } })

  await waitFor(() => expect(dataCalls(api).map((params) => params.get('offset'))).toContain('400'))
  expect(dataCalls(api).every((params) => Number(params.get('limit')) <= 100)).toBe(true)
})

test('les boutons et le champ de page naviguent entre les pages', async () => {
  const api = fakeApi([ventes], [], undefined, lignes(50))
  render('/imports/1?size=10')
  await screen.findByText('Lignes 1 à 10 sur 50')

  await userEvent.click(screen.getByRole('button', { name: 'Suivante' }))
  await screen.findByText('Lignes 11 à 20 sur 50')
  const page = screen.getByLabelText('Page')
  await userEvent.clear(page)
  await userEvent.type(page, '5{Enter}')
  await screen.findByText('Lignes 41 à 50 sur 50')
  await userEvent.click(screen.getByRole('button', { name: 'Précédente' }))

  await waitFor(() => expect(dataCalls(api).at(-1)?.get('offset')).toBe('30'))
})

test('effacer les filtres retire tous les filtres de la requête', async () => {
  const api = fakeApi([ventes], [], undefined, lignes(3))
  render('/imports/1?f.nom=client&f.actif=vrai')
  await screen.findByText('Lignes 1 à 3 sur 3')

  await userEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }))

  await waitFor(() => expect([...(dataCalls(api).at(-1)?.keys() ?? [])]).toEqual(['offset', 'limit']))
  expect(screen.getByLabelText('Filtrer Nom')).toHaveValue('')
})

test("modifie une ligne après récapitulatif, sans envoyer les champs inchangés", async () => {
  const api = fakeApi([ventes], [], undefined, lignes(3))
  render('/imports/1?sort=nom')
  await screen.findByText('Lignes 1 à 3 sur 3')
  const readsBefore = dataCalls(api).length

  await userEvent.click(screen.getByRole('button', { name: 'Modifier la ligne 1' }))
  const dialog = screen.getByRole('dialog', { name: 'Modifier la ligne 1' })
  expect(within(dialog).getByRole('button', { name: 'Vérifier les modifications' })).toBeDisabled()
  await userEvent.clear(within(dialog).getByLabelText(/Nom/))
  await userEvent.type(within(dialog).getByLabelText(/Nom/), 'Zoé')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Vérifier les modifications' }))
  expect(dialog).toHaveTextContent('Client 0Zoé')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.calls.find((call) => call.method === 'PATCH')?.body).toEqual({ values: { nom: 'Zoé' } })
  await waitFor(() => expect(dataCalls(api).length).toBeGreaterThan(readsBefore))
  expect(screen.getByLabelText('url')).toHaveTextContent('sort=nom')
})

test('affiche sous chaque champ la raison de son refus', async () => {
  fakeApi([ventes], [], undefined, lignes(3), { montant: 'Nombre attendu, par exemple 12,5' })
  render()
  await screen.findByText('Lignes 1 à 3 sur 3')

  await userEvent.click(screen.getByRole('button', { name: 'Modifier la ligne 1' }))
  const dialog = screen.getByRole('dialog')
  const montant = within(dialog).getByLabelText(/Montant/)
  await userEvent.clear(montant)
  await userEvent.type(montant, 'abc')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Vérifier les modifications' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

  expect(await within(dialog).findByText('Nombre attendu, par exemple 12,5')).toBeInTheDocument()
  expect(within(dialog).getByLabelText(/Montant/)).toHaveAttribute('aria-invalid', 'true')
})
