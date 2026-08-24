import { create } from 'zustand'
import type { Person, Tree, Union } from './types'
import { emptyTree } from './types'
import { reconcile } from './gedcom'
import { SAMPLE_FOCAL_ID, sampleTree } from './data/sample'
import { loadUiPrefs, localReady, onRemoteChange, readTree, saveUiPrefs, writeTree } from './collab'

/** Identifiants aléatoires : deux membres de la famille peuvent créer des
 * personnes hors-ligne sans risque de collision à la fusion. */
function randomId(prefix: 'I' | 'F'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const suffix = [...bytes].map((b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('')
  return `@${prefix}${suffix}@`
}

interface State {
  tree: Tree
  focalId: string | null
  selectedId: string | null
  hydrated: boolean
  setTree: (tree: Tree, focalId?: string | null) => void
  setFocal: (id: string) => void
  select: (id: string | null) => void
  addPerson: (fields?: Partial<Person>) => string
  updatePerson: (id: string, fields: Partial<Person>) => void
  deletePerson: (id: string) => void
  /** Relie un parent existant, ou crée les deux parents si existingId est absent. */
  addParents: (childId: string, existingId?: string) => void
  /** Relie un·e partenaire existant·e, ou en crée un·e si existingId est absent. */
  addPartner: (personId: string, existingId?: string) => void
  /** Relie un enfant existant (sans parents connus), ou en crée un si existingId est absent. */
  addChild: (personId: string, existingId?: string) => void
  updateUnion: (id: string, fields: Partial<Union>) => void
  loadSample: () => void
  clearAll: () => void
}

export const useStore = create<State>((set, get) => {
  const commit = (mutate: (tree: Tree) => void, extra?: Partial<State>) => {
    const tree = structuredClone(get().tree)
    mutate(tree)
    reconcile(tree)
    set({ tree, ...extra })
  }

  return {
    tree: emptyTree(),
    focalId: null,
    selectedId: null,
    hydrated: false,

    setTree: (tree, focalId) => {
      reconcile(tree)
      const focal =
        focalId !== undefined ? focalId : (Object.keys(tree.persons)[0] ?? null)
      set({ tree, focalId: focal, selectedId: null })
    },

    setFocal: (id) => set({ focalId: id, selectedId: id }),
    select: (id) => set({ selectedId: id }),

    addPerson: (fields) => {
      const id = randomId('I')
      commit(
        (tree) => {
          tree.persons[id] = { id, givenName: '', surname: '', sex: 'U', fams: [], ...fields }
        },
        { selectedId: id },
      )
      if (!get().focalId) set({ focalId: id })
      return id
    },

    updatePerson: (id, fields) =>
      commit((tree) => {
        const p = tree.persons[id]
        if (p) Object.assign(p, fields)
      }),

    deletePerson: (id) => {
      const { focalId, selectedId } = get()
      commit(
        (tree) => {
          delete tree.persons[id]
          for (const u of Object.values(tree.unions)) {
            u.partners = u.partners.filter((x) => x !== id)
            u.children = u.children.filter((x) => x !== id)
            if (u.partners.length === 0 && u.children.length === 0) delete tree.unions[u.id]
          }
        },
        {
          selectedId: selectedId === id ? null : selectedId,
        },
      )
      if (focalId === id) {
        const first = Object.keys(get().tree.persons)[0] ?? null
        set({ focalId: first })
      }
    },

    addParents: (childId, existingId) => {
      commit((tree) => {
        const child = tree.persons[childId]
        if (!child || child.famc) return
        const unionId = randomId('F')
        if (existingId && tree.persons[existingId]) {
          tree.unions[unionId] = { id: unionId, partners: [existingId], children: [childId] }
        } else {
          const fatherId = randomId('I')
          const motherId = randomId('I')
          tree.persons[fatherId] = {
            id: fatherId,
            givenName: '',
            surname: child.surname,
            sex: 'M',
            fams: [unionId],
          }
          tree.persons[motherId] = {
            id: motherId,
            givenName: '',
            surname: '',
            sex: 'F',
            fams: [unionId],
          }
          tree.unions[unionId] = { id: unionId, partners: [fatherId, motherId], children: [childId] }
        }
        child.famc = unionId
      })
    },

    addPartner: (personId, existingId) => {
      let partnerId = existingId ?? ''
      commit((tree) => {
        const p = tree.persons[personId]
        if (!p) return
        if (existingId) {
          if (!tree.persons[existingId] || existingId === personId) return
          // déjà en couple ensemble : rien à faire
          if (p.fams.some((u) => tree.unions[u]?.partners.includes(existingId))) return
          // une union monoparentale existante se complète plutôt que d'en créer une seconde
          const single = p.fams.find((u) => tree.unions[u]?.partners.length === 1)
          if (single) {
            tree.unions[single].partners.push(existingId)
            return
          }
          const unionId = randomId('F')
          tree.unions[unionId] = { id: unionId, partners: [personId, existingId], children: [] }
          return
        }
        partnerId = randomId('I')
        const unionId = randomId('F')
        const sex = p.sex === 'M' ? 'F' : p.sex === 'F' ? 'M' : 'U'
        tree.persons[partnerId] = { id: partnerId, givenName: '', surname: '', sex, fams: [unionId] }
        tree.unions[unionId] = { id: unionId, partners: [personId, partnerId], children: [] }
        p.fams.push(unionId)
      })
      if (partnerId) set({ selectedId: partnerId })
    },

    addChild: (personId, existingId) => {
      let childId = existingId ?? ''
      commit((tree) => {
        const p = tree.persons[personId]
        if (!p) return
        if (existingId) {
          const child = tree.persons[existingId]
          if (!child || child.famc || existingId === personId) return
        }
        let unionId = p.fams[0]
        if (!unionId) {
          unionId = randomId('F')
          tree.unions[unionId] = { id: unionId, partners: [personId], children: [] }
          p.fams.push(unionId)
        }
        if (existingId) {
          tree.persons[existingId].famc = unionId
          tree.unions[unionId].children.push(existingId)
          return
        }
        childId = randomId('I')
        tree.persons[childId] = {
          id: childId,
          givenName: '',
          surname: p.sex === 'F' ? '' : p.surname,
          sex: 'U',
          fams: [],
          famc: unionId,
        }
        tree.unions[unionId].children.push(childId)
      })
      if (childId) set({ selectedId: childId })
    },

    updateUnion: (id, fields) =>
      commit((tree) => {
        const u = tree.unions[id]
        if (u) Object.assign(u, fields)
      }),

    loadSample: () => {
      set({ tree: sampleTree(), focalId: SAMPLE_FOCAL_ID, selectedId: null })
    },

    clearAll: () => {
      set({ tree: emptyTree(), focalId: null, selectedId: null })
    },
  }
})

// ----- Pont avec le document collaboratif -----

let applyingRemote = false

localReady.then(() => {
  const tree = readTree()
  reconcile(tree)
  const prefs = loadUiPrefs()
  const focalId =
    prefs.focalId && tree.persons[prefs.focalId]
      ? prefs.focalId
      : (Object.keys(tree.persons)[0] ?? null)
  applyingRemote = true
  useStore.setState({ tree, focalId, hydrated: true })
  applyingRemote = false

  onRemoteChange((remoteTree) => {
    reconcile(remoteTree)
    const { focalId: cur, selectedId } = useStore.getState()
    applyingRemote = true
    useStore.setState({
      tree: remoteTree,
      focalId:
        cur && remoteTree.persons[cur] ? cur : (Object.keys(remoteTree.persons)[0] ?? null),
      selectedId: selectedId && remoteTree.persons[selectedId] ? selectedId : null,
    })
    applyingRemote = false
  })
})

useStore.subscribe((state, prev) => {
  if (!state.hydrated) return
  if (!applyingRemote && state.tree !== prev.tree) writeTree(state.tree)
  if (state.focalId !== prev.focalId) {
    saveUiPrefs({ ...loadUiPrefs(), focalId: state.focalId ?? undefined })
  }
})
