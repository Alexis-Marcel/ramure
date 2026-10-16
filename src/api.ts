import { getToken } from './auth'

/** Client de l'API du mode comptes (voir server/api.mjs). */

export type Role = 'owner' | 'editor' | 'viewer'

export interface TreeSummary {
  id: string
  name: string
  role: Role
  owner: string
  members: number
  createdAt: string
  updatedAt: string
}

export interface Member {
  id: string
  role: Role
  name: string
  email?: string
  addedAt: string
}

export interface Invite {
  token: string
  role: Exclude<Role, 'owner'>
  expiresAt: string
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'propriétaire',
  editor: 'éditeur',
  viewer: 'lecteur',
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken()
  const res = await fetch(new URL(path, document.baseURI), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Erreur ${res.status}`)
  return data as T
}

const t = (id: string) => `api/trees/${encodeURIComponent(id)}`

export const api = {
  listTrees: () => call<TreeSummary[]>('GET', 'api/trees'),
  createTree: (name: string) => call<TreeSummary>('POST', 'api/trees', { name }),
  renameTree: (id: string, name: string) => call<TreeSummary>('PATCH', t(id), { name }),
  deleteTree: (id: string) => call<{ ok: true }>('DELETE', t(id)),
  members: (id: string) => call<{ members: Member[]; invites: Invite[] }>('GET', `${t(id)}/members`),
  setRole: (id: string, memberId: string, role: Role) =>
    call<{ ok: true }>('PATCH', `${t(id)}/members/${encodeURIComponent(memberId)}`, { role }),
  removeMember: (id: string, memberId: string) =>
    call<{ ok: true }>('DELETE', `${t(id)}/members/${encodeURIComponent(memberId)}`),
  createInvite: (id: string, role: Invite['role']) => call<Invite>('POST', `${t(id)}/invites`, { role }),
  revokeInvite: (id: string, token: string) => call<{ ok: true }>('DELETE', `${t(id)}/invites/${token}`),
  describeInvite: (token: string) =>
    call<{ treeName: string; role: Invite['role']; inviter: string }>('GET', `api/invites/${token}`),
  acceptInvite: (token: string) => call<TreeSummary>('POST', `api/invites/${token}/accept`),
}

/** Lien d'invitation à partager. */
export function inviteUrl(token: string): string {
  return new URL(`?invitation=${token}`, new URL('.', document.baseURI)).toString()
}
