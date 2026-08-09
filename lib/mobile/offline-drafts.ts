const DATABASE = "erp-mobile-companion";
const STORE = "capture-drafts";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadOfflineDraft<T>(id: string): Promise<T | null> {
  if (!("indexedDB" in globalThis)) return null;
  const database = await openDatabase();
  return new Promise<T | null>((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result?.payload as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function saveOfflineDraft(id: string, payload: unknown) {
  if (!("indexedDB" in globalThis)) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite").objectStore(STORE).put({ id, payload, updatedAt: new Date().toISOString() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function deleteOfflineDraft(id: string) {
  if (!("indexedDB" in globalThis)) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}
