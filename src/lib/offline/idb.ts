const DB_NAME = 'inventory-offline'
const DB_VERSION = 1
const STORE_QUEUED_SALES = 'queuedSales'

export type QueuedSale = {
  id: string // local uuid
  shopId: string
  createdAt: number // unix ms
  payload: unknown // recordSale input
  status: 'queued' | 'syncing' | 'failed'
  failureReason: string | null
  attemptCount: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_QUEUED_SALES)) {
        const store = db.createObjectStore(STORE_QUEUED_SALES, {
          keyPath: 'id',
        })
        store.createIndex('status', 'status')
        store.createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putQueuedSale(sale: QueuedSale): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUED_SALES, 'readwrite')
    const req = tx.objectStore(STORE_QUEUED_SALES).put(sale)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getQueuedSales(): Promise<QueuedSale[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUED_SALES, 'readonly')
    const req = tx.objectStore(STORE_QUEUED_SALES).getAll()
    req.onsuccess = () => resolve(req.result as QueuedSale[])
    req.onerror = () => reject(req.error)
  })
}

export async function deleteQueuedSale(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUED_SALES, 'readwrite')
    const req = tx.objectStore(STORE_QUEUED_SALES).delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function updateQueuedSaleStatus(
  id: string,
  status: QueuedSale['status'],
  failureReason: string | null,
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUED_SALES, 'readwrite')
    const store = tx.objectStore(STORE_QUEUED_SALES)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const sale = getReq.result as QueuedSale | undefined
      if (!sale) {
        resolve()
        return
      }
      const updated: QueuedSale = {
        ...sale,
        status,
        failureReason,
        attemptCount: sale.attemptCount + 1,
      }
      const putReq = store.put(updated)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

export async function clearAllQueuedSales(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUED_SALES, 'readwrite')
    const req = tx.objectStore(STORE_QUEUED_SALES).clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
