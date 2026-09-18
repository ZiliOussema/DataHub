import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import HomePage from '../../src/pages/HomePage'
import { fakeApi, makeImport } from '../fakeApi'
import { renderWithProviders } from '../helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

const clients = makeImport('1', 'Clients', 0)
const produits = makeImport('2', 'Produits', 1)

test('affiche les imports dans leur ordre', async () => {
  fakeApi([clients, produits])
  renderWithProviders(<HomePage />)

  const lignes = await screen.findAllByRole('row')

  // La première ligne est l'en-tête du tableau.
  expect(lignes.slice(1).map((ligne) => within(ligne).getByRole('link').textContent)).toEqual([
    'Clients',
    'Produits',
  ])
})

test('annonce une liste vide', async () => {
  fakeApi([])
  renderWithProviders(<HomePage />)

  expect(await screen.findByText('Aucun import pour le moment.')).toBeInTheDocument()
})

test('crée un import et rafraîchit la liste', async () => {
  fakeApi([])
  renderWithProviders(<HomePage />)
  await screen.findByText('Aucun import pour le moment.')

  await userEvent.type(screen.getByLabelText('Nom du nouvel import'), 'Clients')
  await userEvent.click(screen.getByRole('button', { name: "Créer l'import" }))

  expect(await screen.findByRole('link', { name: 'Clients' })).toBeInTheDocument()
})

test('affiche le message du backend quand le nom est pris', async () => {
  fakeApi([clients])
  renderWithProviders(<HomePage />)
  await screen.findByRole('link', { name: 'Clients' })

  await userEvent.type(screen.getByLabelText('Nom du nouvel import'), 'clients')
  await userEvent.click(screen.getByRole('button', { name: "Créer l'import" }))

  expect(await screen.findByRole('alert')).toHaveTextContent('déjà utilisé')
})

test('renomme un import', async () => {
  fakeApi([clients])
  renderWithProviders(<HomePage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Renommer Clients' }))
  const field = screen.getByLabelText('Nouveau nom')
  await userEvent.clear(field)
  await userEvent.type(field, 'Clients 2026')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

  expect(await screen.findByRole('link', { name: 'Clients 2026' })).toBeInTheDocument()
})

test('supprime un import après confirmation et oublie son tableau mémorisé', async () => {
  fakeApi([clients])
  localStorage.setItem('datahub:tableau:1', 'page=3')
  renderWithProviders(<HomePage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Supprimer Clients' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }))

  expect(await screen.findByText('Aucun import pour le moment.')).toBeInTheDocument()
  expect(localStorage.getItem('datahub:tableau:1')).toBeNull()
})

test('monter envoie la liste complète réordonnée', async () => {
  const api = fakeApi([clients, produits])
  renderWithProviders(<HomePage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Monter Produits' }))

  const order = api.calls.find((call) => call.url === '/api/imports/order')
  expect(order?.body).toEqual({ ids: ['2', '1'] })
  expect((await screen.findAllByRole('link')).map((link) => link.textContent)).toEqual([
    'Produits',
    'Clients',
  ])
})

test('désactive monter sur le premier et descendre sur le dernier', async () => {
  fakeApi([clients, produits])
  renderWithProviders(<HomePage />)

  expect(await screen.findByRole('button', { name: 'Monter Clients' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Descendre Produits' })).toBeDisabled()
})
