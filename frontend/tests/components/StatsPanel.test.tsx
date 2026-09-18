import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import StatsPanel from '../../src/components/StatsPanel'
import type { Import, Stats } from '../../src/types/imports'
import { fakeApi, makeImport } from '../fakeApi'
import { renderWithProviders } from '../helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const ventes: Import = makeImport('1', 'Ventes', 0, {
  status: 'ready',
  columns: [
    { label: 'Ville', key: 'ville', type: 'string' },
    { label: 'Âge', key: 'age', type: 'integer' },
  ],
})

const stats = (extra: Partial<Stats> = {}): Stats => ({
  column: { label: 'Ville', key: 'ville', type: 'string' },
  count: 1000,
  distinct: 2,
  minimum: null,
  maximum: null,
  average: null,
  true_count: null,
  false_count: null,
  occurrences: [
    { value: 'Évry', count: 700 },
    { value: 'Lyon', count: 300 },
  ],
  ...extra,
})

const calls = (api: ReturnType<typeof fakeApi>) =>
  api.calls.filter((call) => call.url.includes('/stats/')).map((call) => new URL(call.url, 'http://t'))

test("affiche le compte, les valeurs distinctes et le tableau des occurrences d'un texte", async () => {
  fakeApi([ventes], [], undefined, [], {}, stats())
  renderWithProviders(
    <Routes>
      <Route path="/imports/:importId" element={<StatsPanel item={ventes} />} />
    </Routes>,
    '/imports/1',
  )

  expect(await screen.findByText('1 000')).toBeInTheDocument()
  const row = (await screen.findAllByRole('row'))[1]
  expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Évry', '700'])
})

test("les chiffres d'un nombre sont le compte, le minimum, le maximum et la moyenne", async () => {
  const numbers = stats({
    column: { label: 'Âge', key: 'age', type: 'integer' },
    minimum: 18,
    maximum: 90,
    average: 42.5,
    occurrences: [{ value: 34, count: 12 }],
  })
  fakeApi([ventes], [], undefined, [], {}, numbers)
  renderWithProviders(
    <Routes>
      <Route path="/imports/:importId" element={<StatsPanel item={ventes} />} />
    </Routes>,
    '/imports/1',
  )

  await userEvent.selectOptions(await screen.findByLabelText('Colonne'), 'age')

  expect(await screen.findByText('Moyenne')).toBeInTheDocument()
  expect(screen.getByText('42,5')).toBeInTheDocument()
  // Pas de recherche dans le tableau : elle n'existe que pour les colonnes de texte.
  expect(screen.queryByLabelText('Valeur contient')).not.toBeInTheDocument()
})

test('la première case envoie les filtres du tableau, la seconde la recherche', async () => {
  const api = fakeApi([ventes], [], undefined, [], {}, stats())
  renderWithProviders(
    <Routes>
      <Route path="/imports/:importId" element={<StatsPanel item={ventes} />} />
    </Routes>,
    '/imports/1?f.ville=evry',
  )
  await screen.findByText('1 000')

  await userEvent.click(screen.getByRole('checkbox', { name: /filtres de l'onglet Données/ }))
  await waitFor(() => expect(calls(api).at(-1)?.searchParams.get('f.ville')).toBe('evry'))

  await userEvent.type(screen.getByLabelText('Valeur contient'), 'ly')
  await waitFor(() => expect(calls(api).at(-1)?.searchParams.get('search')).toBe('ly'))
  expect(calls(api).at(-1)?.searchParams.get('searched')).toBe(null)

  await userEvent.click(screen.getByRole('checkbox', { name: /recherche ci-dessous aux chiffres/ }))
  await waitFor(() => expect(calls(api).at(-1)?.searchParams.get('searched')).toBe('1'))
})

test('le tableau des occurrences se trie et se pagine', async () => {
  const api = fakeApi([ventes], [], undefined, [], {}, stats({ distinct: 45 }))
  renderWithProviders(
    <Routes>
      <Route path="/imports/:importId" element={<StatsPanel item={ventes} />} />
    </Routes>,
    '/imports/1',
  )
  await screen.findByText('1 000')
  expect(calls(api)[0].searchParams.get('sort')).toBe('-count')

  await userEvent.click(screen.getByRole('button', { name: /Valeur/ }))
  await waitFor(() => expect(calls(api).at(-1)?.searchParams.get('sort')).toBe('-value'))

  await userEvent.click(screen.getByRole('button', { name: 'Suivante' }))
  await waitFor(() => expect(calls(api).at(-1)?.searchParams.get('page')).toBe('2'))
})
