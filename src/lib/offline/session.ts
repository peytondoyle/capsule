const KEY = 'capsule-local-owner'
const CHANGE = 'capsule-local-owner-change'

export function localOwner(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}

// This selects local data only. Every upload still authenticates with the server.
export function rememberLocalOwner(ownerId: string) {
  localStorage.setItem(KEY, ownerId)
  window.dispatchEvent(new Event(CHANGE))
}

export function lockLocalArchive() {
  localStorage.removeItem(KEY)
  window.dispatchEvent(new Event(CHANGE))
}

export function watchLocalOwner(changed: () => void) {
  function storage(event: StorageEvent) { if (event.key === KEY || event.key === null) changed() }
  window.addEventListener('storage', storage)
  window.addEventListener(CHANGE, changed)
  return () => {
    window.removeEventListener('storage', storage)
    window.removeEventListener(CHANGE, changed)
  }
}

export async function offlineShellReady(repair = false): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  const registration = await navigator.serviceWorker.getRegistration()
  const worker = registration?.active
  if (!worker) return false
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const finish = (ready: boolean) => {
      clearTimeout(timeout)
      channel.port1.close()
      resolve(ready)
    }
    const timeout = setTimeout(() => finish(false), repair ? 30000 : 4000)
    channel.port1.onmessage = (event) => finish(event.data?.type === 'OFFLINE_READY' && event.data.ready === true)
    worker.postMessage({ type: repair ? 'PREPARE_OFFLINE' : 'OFFLINE_READY' }, [channel.port2])
  })
}
