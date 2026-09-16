import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'

import { useImports, useMoveImport } from '../hooks/useImports'
import { COULEURS } from '../theme/statuts'
import Icon from './icons'

const lien = (actif: boolean) =>
  `flex items-center gap-2.5 border-l-[3px] px-[18px] py-1.5 ${
    actif
      ? 'border-rouge bg-nuit-2 font-medium text-white'
      : 'border-transparent hover:bg-nuit-2 hover:text-white'
  }`

const fleche =
  'grid h-5 w-5 place-items-center rounded-sm text-nuit-doux hover:bg-nuit-3 hover:text-white disabled:bg-transparent disabled:opacity-30'

/** Ossature de l'application : barre latérale des imports et fil d'Ariane. */
export default function AppShell({ children }: { children: ReactNode }) {
  const { data: imports } = useImports()
  const move = useMoveImport()
  const { pathname } = useLocation()
  const currentId = pathname.startsWith('/imports/') ? pathname.slice('/imports/'.length) : null
  const current = imports?.find((item) => item.id === currentId)

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="flex flex-col bg-nuit text-nuit-texte md:sticky md:top-0 md:h-screen">
        <div className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-4">
          <span className="grid h-[22px] w-[22px] place-items-center bg-rouge font-titre text-[13px] font-bold text-white">
            D
          </span>
          <span className="font-titre text-[15px] font-bold text-white">Datahub</span>
        </div>
        <p className="px-[18px] pb-4 text-[11px] text-nuit-doux">Aplusa · Études de marché santé</p>
        <p className="px-[18px] pt-2 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] text-nuit-doux uppercase">
          Imports
        </p>
        <nav
          aria-label="Imports"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-4 [scrollbar-color:#4E606D_transparent] [scrollbar-width:thin]"
        >
          <Link to="/" aria-current={pathname === '/' ? 'page' : undefined} className={`${lien(pathname === '/')} pl-[30px]`}>
            Tous les imports
          </Link>
          {imports?.map((item, index) => (
            <div key={item.id} className="group relative flex items-center">
              <Link
                to={`/imports/${item.id}`}
                aria-current={item.id === currentId ? 'page' : undefined}
                title={item.name}
                className={`${lien(item.id === currentId)} min-w-0 flex-1 group-hover:bg-nuit-2 group-hover:pr-13 group-hover:text-white group-focus-within:pr-13`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COULEURS[item.status]}`} />
                <span className="truncate">{item.name}</span>
              </Link>
              {/* Les flèches n'apparaissent qu'au survol : la liste reste lisible au repos. */}
              <span className="absolute right-1.5 hidden gap-0.5 bg-nuit-2 group-hover:flex group-focus-within:flex">
                <button
                  type="button"
                  onClick={() => move(item.id, -1)}
                  disabled={index === 0}
                  aria-label={`Monter ${item.name}`}
                  className={fleche}
                >
                  <Icon nom="monter" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(item.id, 1)}
                  disabled={index === (imports?.length ?? 0) - 1}
                  aria-label={`Descendre ${item.name}`}
                  className={fleche}
                >
                  <Icon nom="descendre" className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
        </nav>
      </aside>

      <div>
        <header className="sticky top-0 z-10 flex h-13 items-center gap-3 border-b border-bordure bg-surface px-6">
          <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-2 text-texte-doux">
            {current ? (
              <>
                <Link to="/" className="text-bleu hover:underline">
                  Imports
                </Link>
                <span className="text-texte-pale">/</span>
                <span className="truncate font-medium text-texte">{current.name}</span>
              </>
            ) : (
              <span className="font-medium text-texte">Imports</span>
            )}
          </nav>
        </header>
        {children}
      </div>
    </div>
  )
}
