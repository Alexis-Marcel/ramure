import { useEffect, useState } from 'react'
import { api, ROLE_LABEL, type TreeSummary } from '../api'
import type { Account } from '../auth'
import { clearLocalTree, forgetTreeCaches, localTreeImported, peekLocalTree } from '../collab'
import { confirmTreeDeletion } from '../confirm'
import type { Tree } from '../types'

interface Props {
  me: Account
  onOpen: (tree: TreeSummary) => void
  /** importe l'arbre de ce navigateur dans un nouvel arbre du compte */
  onImportLocal: (tree: TreeSummary, local: Tree) => void
  notice?: string | null
}

/** « Mes arbres » : ceux que j'ai créés et ceux qu'on m'a partagés. */
export function TreesHome({ me, onOpen, onImportLocal, notice }: Props) {
  const [trees, setTrees] = useState<TreeSummary[] | null>(null)
  const [local, setLocal] = useState<Tree | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .listTrees()
      .then((list) => {
        if (cancelled) return
        setTrees(list)
        // copies hors-ligne d'arbres qui ne sont plus accessibles : on les efface
        void forgetTreeCaches(list.map((t) => t.id))
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    if (!localTreeImported()) {
      peekLocalTree().then((t) => !cancelled && setLocal(Object.keys(t.persons).length > 0 ? t : null))
    }
    return () => {
      cancelled = true
    }
  }, [])

  const create = async (name: string, then: (t: TreeSummary) => void) => {
    setBusy(true)
    setError(null)
    try {
      then(await api.createTree(name))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Propriétaire : supprime l'arbre pour tous (nom à retaper). Sinon : quitte l'arbre. */
  const remove = async (t: TreeSummary) => {
    let confirmName: string | null = null
    if (t.role === 'owner') {
      confirmName = confirmTreeDeletion(t)
      if (confirmName === null) return
    } else if (!confirm(`Quitter « ${t.name} » ? Il faudra une nouvelle invitation pour y revenir.`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (t.role === 'owner') await api.deleteTree(t.id, confirmName ?? '')
      else await api.removeMember(t.id, me.id)
      const rest = (trees ?? []).filter((x) => x.id !== t.id)
      setTrees(rest)
      await forgetTreeCaches(rest.map((x) => x.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const localCount = local ? Object.keys(local.persons).length : 0

  return (
    <div className="home">
      <div className="home-head">
        <h1>Mes arbres</h1>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            const name = prompt('Nom du nouvel arbre', `Famille ${me.name.split(/\s+/).pop() ?? ''}`.trim())
            if (name?.trim()) void create(name.trim(), onOpen)
          }}
        >
          Nouvel arbre
        </button>
      </div>

      {notice && <p className="home-notice">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      {local && (
        <div className="home-import">
          <p>
            Ce navigateur contient un arbre créé sans compte ({localCount} personne{localCount > 1 ? 's' : ''}).
            Tu peux l'ajouter à ton compte pour le retrouver partout et le partager.
          </p>
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              const name = prompt("Nom de l'arbre importé", 'Mon arbre')
              if (name?.trim()) void create(name.trim(), (t) => onImportLocal(t, local))
            }}
          >
            Importer dans mon compte
          </button>
          <button
            className="link"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Effacer l'arbre de ce navigateur (${localCount} personne${localCount > 1 ? 's' : ''}) ? Il n'est pas dans ton compte : il sera perdu.`)) return
              void clearLocalTree().then(() => setLocal(null))
            }}
          >
            Effacer de ce navigateur
          </button>
        </div>
      )}

      {trees === null && !error && <p className="muted">Chargement…</p>}
      {trees?.length === 0 && (
        <p className="muted">
          Aucun arbre pour l'instant. Crée le premier, ou ouvre un lien d'invitation reçu de la famille.
        </p>
      )}
      <ul className="tree-list">
        {trees?.map((t) => (
          <li key={t.id} className="tree-row">
            <button
              className="tree-remove"
              disabled={busy}
              onClick={() => void remove(t)}
              title={t.role === 'owner' ? "Supprimer l'arbre" : "Quitter l'arbre"}
            >
              {t.role === 'owner' ? 'Supprimer' : 'Quitter'}
            </button>
            <button className="tree-card" onClick={() => onOpen(t)}>
              <span className="tree-card-name">{t.name}</span>
              <span className="tree-card-meta">
                {t.role === 'owner' ? 'à toi' : `partagé par ${t.owner} · ${ROLE_LABEL[t.role]}`}
                {' · '}
                {t.members} membre{t.members > 1 ? 's' : ''}
                {' · modifié le '}
                {new Date(t.updatedAt).toLocaleDateString('fr-FR')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
