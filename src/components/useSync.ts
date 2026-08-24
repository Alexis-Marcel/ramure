import { useEffect, useState } from 'react'
import { onSyncStatus, type SyncStatus } from '../collab'

export function useSync(): { status: SyncStatus; peers: string[] } {
  const [state, setState] = useState<{ status: SyncStatus; peers: string[] }>({
    status: 'off',
    peers: [],
  })
  useEffect(() => onSyncStatus((status, peers) => setState({ status, peers })), [])
  return state
}
