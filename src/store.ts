import { create } from 'zustand'
import type { Person, Tree, Union } from './types'
import { emptyTree } from './types'
import { reconcile } from './gedcom'
import { SAMPLE_FOCAL_ID, sampleTree } from './data/sample'

const STORAGE_KEY = 'ramure:v1'

interface Persisted {
  tree: Tree
  focalId: string | null
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Persisted
    reconcile(data.tree)
    return data
  } catch {
    return null
  }
}

let nextIds = { person: 1, union: 1 }

function initNextIds(tree: Tree) {
  const maxNum = (ids: string[]) =>
    ids.reduce((max, id) => {
      const m = id.match(/(\d+)/)
      return m ? Math.max(max, Number(m[1])) : max
    }, 0)
  nextIds = {
    person: maxNum(Object.keys(tree.persons)) + 1,
    union: maxNum(Object.keys(tree.unions)) + 1,
  }
}

function newPersonId(): string {
  return `@I${nextIds.person++}@`
}

function newUnionId(): string {
  return `@F${nextIds.union++}@`
}

interface State {
  tree: Tree
  focalId: string | null
  selectedId: string | null
  setTree: (tree: Tree, focalId?: string | null) => void
  setFocal: (id: string) => void
  select: (id: string | null) => void
  addPerson: (fields?: Partial<Person>) => string
  updatePerson: (id: string, fields: Partial<Person>) => void
  deletePerson: (id: string) => void
  addParents: (childId: string) => void
  addPartner: (personId: string) => void
  addChild: (personId: string) => void
  updateUnion: (id: string, fields: Partial<Union>) => void
  loadSample: () => void
  clearAll: () => void
}

export const useStore = create<State>((set, get) => {
  const persisted = load()
  const initialTree = persisted?.tree ?? emptyTree()
  initNextIds(initialTree)

  const commit = (mutate: (tree: Tree) => void, extra?: Partial<State>) => {
    const tree = structuredClone(get().tree)
    mutate(tree)
    reconcile(tree)
    set({ tree, ...extra })
  }

  return {
    tree: initialTree,
    focalId: persisted?.focalId ?? null,
    selectedId: null,

    setTree: (tree, focalId) => {
      reconcile(tree)
      initNextIds(tree)
      const focal =
        focalId !== undefined ? focalId : (Object.keys(tree.persons)[0] ?? null)
      set({ tree, focalId: focal, selectedId: null })
    },

    setFocal: (id) => set({ focalId: id, selectedId: id }),
    select: (id) => set({ selectedId: id }),

    addPerson: (fields) => {
      const id = newPersonId()
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

    addParents: (childId) => {
      commit((tree) => {
        const child = tree.persons[childId]
        if (!child || child.famc) return
        const fatherId = newPersonId()
        const motherId = newPersonId()
        const unionId = newUnionId()
        tree.persons[fatherId] = {
          id: fatherId,
          givenName: '',
          surname: child.surname,
          sex: 'M',
          fams: [unionId],
        }
        tree.persons[motherId] = { id: motherId, givenName: '', surname: '', sex: 'F', fams: [unionId] }
        tree.unions[unionId] = { id: unionId, partners: [fatherId, motherId], children: [childId] }
        child.famc = unionId
      })
    },

    addPartner: (personId) => {
      let partnerId = ''
      commit(
        (tree) => {
          const p = tree.persons[personId]
          if (!p) return
          partnerId = newPersonId()
          const unionId = newUnionId()
          const sex = p.sex === 'M' ? 'F' : p.sex === 'F' ? 'M' : 'U'
          tree.persons[partnerId] = { id: partnerId, givenName: '', surname: '', sex, fams: [unionId] }
          tree.unions[unionId] = { id: unionId, partners: [personId, partnerId], children: [] }
          p.fams.push(unionId)
        },
        {},
      )
      if (partnerId) set({ selectedId: partnerId })
    },

    addChild: (personId) => {
      let childId = ''
      commit((tree) => {
        const p = tree.persons[personId]
        if (!p) return
        let unionId = p.fams[0]
        if (!unionId) {
          unionId = newUnionId()
          tree.unions[unionId] = { id: unionId, partners: [personId], children: [] }
          p.fams.push(unionId)
        }
        childId = newPersonId()
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
      const tree = sampleTree()
      initNextIds(tree)
      set({ tree, focalId: SAMPLE_FOCAL_ID, selectedId: null })
    },

    clearAll: () => {
      set({ tree: emptyTree(), focalId: null, selectedId: null })
      nextIds = { person: 1, union: 1 }
    },
  }
})

useStore.subscribe((state) => {
  const data: Persisted = { tree: state.tree, focalId: state.focalId }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // stockage plein ou indisponible : l'app continue sans persistance
  }
})
