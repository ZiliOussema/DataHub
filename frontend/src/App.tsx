import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'

import AppShell from './components/AppShell'
import HomePage from './pages/HomePage'
import ImportPage from './pages/ImportPage'

// Une seule tentative : une erreur de l'API doit s'afficher tout de suite, pas après trois essais.
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

export default function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/imports/:importId" element={<ImportPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
