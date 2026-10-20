// Data-access layer. Everything above this file talks to `repo`, so swapping
// IndexedDB for a server (Supabase, Postgres API …) means re-implementing this
// interface only.
import { get, set, del, createStore, keys } from 'idb-keyval';
import type { PhotoRecord, Settings, WorkspaceData, WorkspaceId } from '../lib/types';

export interface Repository {
  kind: 'local' | 'remote';
  loadSettings(): Promise<Partial<Settings> | undefined>;
  saveSettings(s: Settings): Promise<void>;
  loadWorkspace(id: WorkspaceId): Promise<Partial<WorkspaceData> | undefined>;
  saveWorkspace(id: WorkspaceId, data: WorkspaceData): Promise<void>;
  clearWorkspace(id: WorkspaceId): Promise<void>;
  getPhoto(id: string): Promise<PhotoRecord | undefined>;
  putPhoto(p: PhotoRecord): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  listPhotoIds(): Promise<string[]>;
  getActiveWorkspace(): Promise<WorkspaceId | undefined>;
  setActiveWorkspace(id: WorkspaceId): Promise<void>;
}

let store: ReturnType<typeof createStore> | null = null;
let memory: Map<string, unknown> | null = null;

function idb() {
  if (!store) store = createStore('skylog', 'kv');
  return store;
}

async function safeGet<T>(k: string): Promise<T | undefined> {
  if (memory) return memory.get(k) as T | undefined;
  try {
    return await get<T>(k, idb());
  } catch {
    memory = new Map();
    return undefined;
  }
}
async function safeSet(k: string, v: unknown) {
  if (memory) { memory.set(k, v); return; }
  try {
    await set(k, v, idb());
  } catch (e) {
    memory = new Map();
    memory.set(k, v);
    throw new Error('Your browser blocked local storage, so changes will be lost when you close this tab. Private browsing often causes this.');
  }
}
async function safeDel(k: string) {
  if (memory) { memory.delete(k); return; }
  try { await del(k, idb()); } catch { /* ignore */ }
}

export const isMemoryOnly = () => memory !== null;

export const localRepo: Repository = {
  kind: 'local',
  loadSettings: () => safeGet<Partial<Settings>>('settings'),
  saveSettings: (s) => safeSet('settings', s),
  loadWorkspace: (id) => safeGet<Partial<WorkspaceData>>(`ws:${id}`),
  saveWorkspace: (id, data) => safeSet(`ws:${id}`, data),
  clearWorkspace: (id) => safeDel(`ws:${id}`),
  getPhoto: (id) => safeGet<PhotoRecord>(`photo:${id}`),
  putPhoto: (p) => safeSet(`photo:${p.id}`, p),
  deletePhoto: (id) => safeDel(`photo:${id}`),
  listPhotoIds: async () => {
    if (memory) return [...memory.keys()].filter((k) => k.startsWith('photo:')).map((k) => k.slice(6));
    try { return (await keys(idb())).map(String).filter((k) => k.startsWith('photo:')).map((k) => k.slice(6)); } catch { return []; }
  },
  getActiveWorkspace: () => safeGet<WorkspaceId>('active-workspace'),
  setActiveWorkspace: (id) => safeSet('active-workspace', id),
};

export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return null;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
