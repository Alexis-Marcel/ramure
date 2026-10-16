import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type TreeSummary } from './api'
import App from './App'
import {
  getToken,
  onUserChange,
  setupAuth,
  signIn,
  signOut,
  startSession,
  toAccount,
  type Account,
  type AuthConfig,
} from './auth'
import { closeTree, forgetTreeCaches, markLocalTreeImported, openLocal, openTree, setPresence } from './collab'
import { InviteView, Landing } from './components/Landing'
import { SharePanel } from './components/SharePanel'
import { TreesHome } from './components/TreesHome'
import { beginTreeSwitch, useStore } from './store'
import type { Tree } from './types'

type View =
  | { kind: 'loading' }
  | { kind: 'landing'; reason?: string }
  | { kind: 'local' }
  | { kind: 'home'; notice?: string }
  | { kind: 'invite'; token: string }
  | { kind: 'tree'; tree: TreeSummary }

const base = () => new URL('.', document.baseURI).pathname

function go(search: string, replace = false) {
  const url = base() + search
  if (replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
}

/** Serveur sans comptes (ou GitHub Pages) : l'arbre de ce navigateur, comme avant. */
export function LegacyRoot() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    beginTreeSwitch(false)
    void openLocal().then(() => setReady(true))
  }, [])
  return ready ? <App mode={{ kind: 'legacy' }} /> : <div className="loading">Ouverture de votre arbre…</div>
}

/** Serveur à comptes : mes arbres, partage, invitations. */
export function AccountRoot({ config }: { config: AuthConfig }) {
  const [me, setMe] = useState<Account | null>(null)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [shareOpen, setShareOpen] = useState(false)
  const meRef = useRef<Account | null>(null)
  useEffect(() => {
    meRef.current = me
  }, [me])
  /** pour rouvrir l'arbre depuis ses propres rappels (changement de rôle) */
  const reopenRef = useRef<(treeId: string) => void>(() => {})

  const home = useCallback(async (notice?: string) => {
    await closeTree()
    go('')
    setView({ kind: 'home', notice })
  }, [])

  const showTree = useCallback(
    async (treeId: string, then?: () => void) => {
      setView({ kind: 'loading' })
      let tree: TreeSummary | undefined
      try {
        tree = (await api.listTrees()).find((t) => t.id === treeId)
      } catch {
        // réseau indisponible : on tente quand même la copie hors-ligne plus bas
      }
      if (!tree) {
        await home("Cet arbre n'existe pas, ou tu n'y as plus accès.")
        return
      }
      beginTreeSwitch(tree.role === 'viewer')
      await openTree(tree.id, {
        getToken,
        // le propriétaire a retiré l'accès ou changé le rôle pendant la session
        onAccessChanged: () => {
          void api.listTrees().then((list) => {
            const now = list.find((t) => t.id === treeId)
            if (!now) {
              void forgetTreeCaches(list.map((t) => t.id))
              void home('Ton accès à cet arbre a été retiré.')
            } else if (now.role !== tree.role) reopenRef.current(treeId)
          })
        },
      })
      if (meRef.current) setPresence(meRef.current.name)
      setView({ kind: 'tree', tree })
      then?.()
    },
    [home],
  )
  useEffect(() => {
    reopenRef.current = (treeId) => void showTree(treeId)
  }, [showTree])

  const route = useCallback(
    (account: Account | null) => {
      const params = new URLSearchParams(location.search)
      const treeId = params.get('arbre')
      const invite = params.get('invitation')
      if (!account) {
        setView({
          kind: 'landing',
          reason: invite
            ? 'Connecte-toi pour rejoindre l’arbre auquel tu es invité·e.'
            : treeId
              ? 'Connecte-toi pour ouvrir cet arbre.'
              : undefined,
        })
      } else if (invite) setView({ kind: 'invite', token: invite })
      else if (treeId) void showTree(treeId)
      else void home()
    },
    [home, showTree],
  )

  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    setupAuth(config)
    void startSession().then(({ user, next }) => {
      // retour de connexion : on nettoie ?code=… et on revient où l'on allait
      if (next !== null || new URLSearchParams(location.search).has('state')) go(next ?? '', true)
      const account = toAccount(user)
      setMe(account)
      route(account)
    })
    const off = onUserChange((u) => {
      const account = toAccount(u)
      setMe(account)
      if (!account) setView({ kind: 'landing', reason: 'Ta session a expiré.' })
    })
    const onPop = () => route(meRef.current)
    window.addEventListener('popstate', onPop)
    return () => {
      off()
      window.removeEventListener('popstate', onPop)
    }
  }, [config, route])

  const leave = async () => {
    await closeTree()
    await forgetTreeCaches()
    await signOut()
  }

  const importLocal = (tree: TreeSummary, local: Tree) => {
    go(`?arbre=${tree.id}`)
    void showTree(tree.id, () => {
      useStore.getState().setTree(local)
      // la copie locale reste (filet de sécurité) mais n'est plus proposée à l'import
      markLocalTreeImported()
    })
  }

  switch (view.kind) {
    case 'loading':
      return <div className="loading">Ouverture…</div>
    case 'landing':
      return (
        <Landing
          reason={view.reason}
          onLocal={() => {
            beginTreeSwitch(false)
            void openLocal().then(() => setView({ kind: 'local' }))
          }}
        />
      )
    case 'local':
      return <App mode={{ kind: 'local', onLeave: () => void signIn('') }} />
    case 'invite':
      return (
        <InviteView
          token={view.token}
          onAccepted={(id) => {
            go(`?arbre=${id}`, true)
            void showTree(id)
          }}
          onCancel={() => void home()}
        />
      )
    case 'home':
      return (
        <TreesHome
          me={me!}
          notice={view.notice}
          onOpen={(t) => {
            go(`?arbre=${t.id}`)
            void showTree(t.id)
          }}
          onImportLocal={importLocal}
        />
      )
    case 'tree':
      return (
        <>
          <App
            mode={{
              kind: 'account',
              tree: view.tree,
              me: me!,
              onHome: () => void home(),
              onShare: () => setShareOpen(true),
              onRename: (name) =>
                void api
                  .renameTree(view.tree.id, name)
                  .then((tree) => setView({ kind: 'tree', tree }))
                  .catch((e: Error) => alert(e.message)),
              onSignOut: () => void leave(),
            }}
          />
          {shareOpen && (
            <SharePanel
              tree={view.tree}
              me={me!}
              onClose={() => setShareOpen(false)}
              onLeft={() => {
                setShareOpen(false)
                // la liste efface d'elle-même la copie locale des arbres qui ne sont plus accessibles
                void home()
              }}
            />
          )}
        </>
      )
  }
}
