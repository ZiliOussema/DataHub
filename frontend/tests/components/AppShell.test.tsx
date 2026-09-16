import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import AppShell from '../../src/components/AppShell'
import { fakeApi, makeImport } from '../fakeApi'
import { renderWithProviders } from '../helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

const clients = makeImport('1', 'Clients', 0)
const produits = makeImport('2', 'Produits', 1)

test('liste les imports dans la barre latérale', async () => {
  fakeApi([clients, produits])
  renderWithProviders(<AppShell>{null}</AppShell>)

  const barre = await screen.findByRole('navigation', { name: 'Imports' })
  // La barre existe dès le premier rendu : on attend le dernier import avant de compter.
  await within(barre).findByRole('link', { name: 'Produits' })

  expect(within(barre).getAllByRole('link').map((lien) => lien.textContent)).toEqual([
    'Tous les imports',
    'Clients',
    'Produits',
  ])
})

test('réordonne depuis la barre latérale', async () => {
  const api = fakeApi([clients, produits])
  renderWithProviders(<AppShell>{null}</AppShell>)

  await userEvent.click(await screen.findByRole('button', { name: 'Monter Produits' }))

  expect(api.calls.find((call) => call.url === '/api/imports/order')?.body).toEqual({
    ids: ['2', '1'],
  })
})

test("affiche le fil d'Ariane de l'import ouvert", async () => {
  fakeApi([clients])
  renderWithProviders(<AppShell>{null}</AppShell>, '/imports/1')

  const fil = await screen.findByRole('navigation', { name: "Fil d'Ariane" })

  expect(await within(fil).findByText('Clients')).toBeInTheDocument()
})
