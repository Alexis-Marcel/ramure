import { useEffect, useMemo, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { currentSpace, joinSpace, loadUiPrefs, spaceFromHash } from './collab'
import { Canvas } from './components/Canvas'
import { CollabPanel } from './components/CollabPanel'
import { EditPanel } from './components/EditPanel'
import { EmptyState } from './components/EmptyState'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { TreeSvg } from './components/TreeSvg'
import { buildShareHtml } from './exportHtml'
import { downloadFile, pickFile } from './files'
import { parseGedcom, reconcile, serializeGedcom } from './gedcom'
import { computeLayout } from './layout'
import { useStore } from './store'
import type { Tree } from './types'
import { fullName } from './types'

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'arbre'
  )
}

export default function App() {
  const tree = useStore((s) => s.tree)
  const focalId = useStore((s) => s.focalId)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const setFocal = useStore((s) => s.setFocal)
  const setTree = useStore((s) => s.setTree)
  const addParents = useStore((s) => s.addParents)
  const addPartner = useStore((s) => s.addPartner)
  const addChild = useStore((s) => s.addChild)

  const hydrated = useStore((s) => s.hydrated)
  // la modale s'ouvre d'emblée quand on arrive par un lien d'invitation inconnu
  const [collabOpen, setCollabOpen] = useState(() => {
    const fromLink = spaceFromHash()
    return Boolean(fromLink && currentSpace()?.space !== fromLink.space)
  })

  // rejoint l'espace famille : celui du lien d'invitation, sinon celui mémorisé
  useEffect(() => {
    const space = spaceFromHash() ?? currentSpace()
    if (space) joinSpace(space, loadUiPrefs().name ?? 'Sans nom')
  }, [])

  const hasData = Object.keys(tree.persons).length > 0
  const layout = useMemo(
    () => computeLayout(tree, focalId ?? ''),
    [tree, focalId],
  )

  const focal = focalId ? tree.persons[focalId] : undefined
  const baseName = focal ? slugify(fullName(focal)) : 'arbre'

  const handleImport = async () => {
    const file = await pickFile('.ged,.gedcom,.json')
    if (!file) return
    try {
      let imported: Tree
      if (file.name.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(file.content) as { tree?: Tree } | Tree
        imported = 'persons' in data ? data : (data.tree ?? { persons: {}, unions: {} })
        reconcile(imported)
      } else {
        imported = parseGedcom(file.content)
      }
      const count = Object.keys(imported.persons).length
      if (count === 0) {
        alert('Aucune personne trouvée dans ce fichier.')
        return
      }
      if (hasData && !confirm(`Remplacer l'arbre actuel par « ${file.name} » (${count} personnes) ?`))
        return
      setTree(imported)
    } catch {
      alert("Ce fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un GEDCOM ou d'une sauvegarde Ramure.")
    }
  }

  const handleExportHtml = () => {
    if (!focal) return
    const shareLayout = { ...layout }
    const markup = renderToStaticMarkup(
      <TreeSvg layout={shareLayout} selectedId={null} onSelect={() => {}} onFocus={() => {}} />,
    )
    const m = 80
    const { minX, minY, maxX, maxY } = layout.bounds
    const html = buildShareHtml({
      title: `Arbre de ${fullName(focal)}`,
      svgMarkup: markup,
      viewBox: { x: minX - m, y: minY - m, w: maxX - minX + m * 2, h: maxY - minY + m * 2 },
    })
    downloadFile(`${baseName}.html`, html, 'text/html')
  }

  return (
    <div className="app">
      <TopBar
        hasData={hasData}
        onImport={handleImport}
        onExportGedcom={() =>
          downloadFile(`${baseName}.ged`, serializeGedcom(tree), 'text/plain')
        }
        onExportJson={() =>
          downloadFile(
            `${baseName}.json`,
            JSON.stringify({ app: 'ramure', version: 1, tree }, null, 2),
            'application/json',
          )
        }
        onExportHtml={handleExportHtml}
        onCollab={() => setCollabOpen(true)}
      />
      <div className="workspace">
        <Sidebar />
        {!hydrated ? (
          <div className="loading">Ouverture de votre arbre…</div>
        ) : hasData ? (
          <Canvas
            layout={layout}
            focalId={focalId}
            selectedId={selectedId}
            onSelect={select}
            onFocus={setFocal}
            actions={{ onAddParents: addParents, onAddPartner: addPartner, onAddChild: addChild }}
          />
        ) : (
          <EmptyState onImport={handleImport} />
        )}
        <EditPanel />
      </div>
      {collabOpen && <CollabPanel onClose={() => setCollabOpen(false)} />}
    </div>
  )
}
