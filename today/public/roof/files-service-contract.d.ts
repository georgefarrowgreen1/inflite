// Integration contract for the account-owned service extracted by the OS host.
// No changes to REGISTRY, native module instances or app-private stores.
export type App = 'fitness' | 'weather' | 'markets' | 'chats' | 'mail';
export type Location =
  | { kind: 'drive'; folderId: string | null; view: 'folder' | 'recent' }
  | { kind: 'apps'; app: App | null; category?: 'routes' | 'workouts' | 'images' | 'audio' | 'documents' };
export interface Action { id: string; label: string; icon?: string; enabled?: boolean; destructive?: boolean; primary?: boolean }
export interface Resource {
  key: string; id: string; source: { kind: 'drive'; id: 'drive' } | { kind: 'app'; id: App };
  kind: 'file' | 'folder'; name: string; parentId?: string | null; mime?: string;
  size?: number; modifiedAt?: number; version?: number; sourceLabel?: string; category?: 'image' | 'audio' | 'route' | 'workout' | 'document';
  actions: Action[]; primaryAction?: string; location?: Location;
}
export interface Listing {
  items: Resource[]; status?: 'ready' | 'loading' | 'error'; error?: string;
  folder?: { id: string; name: string } | null;
  ancestors?: Array<{ id: string; name: string }>;
  breadcrumbs?: Array<{ name: string; location: Location }>;
  name?: string; cursor?: string | null;
  capabilities?: { upload?: boolean; newFolder?: boolean };
  usage?: { used: number; reserved: number; limit: number; nodes: number; nodeLimit: number; fileLimit: number };
  notices?: Array<{ id: string; resourceKey: string; text: string; actions: Action[] }>;
}
export interface Lease { current(): boolean; signal?: AbortSignal }
export interface Transfer { id: string; name: string; status: string; label?: string; progress?: number; cancelable?: boolean }
export interface FilesService {
  // browse() is an independent read and MUST NOT replace a process-wide selected
  // folder. The Explorer's Move chooser and quick picker may read another folder.
  // Drive reads are stable server-sorted pages (100 items). A cursor belongs to
  // its query/sort/location; all three changes reset it. App indexes can paginate
  // their own bounded current metadata and report a recent-items notice.
  browse(location: Location, options: Lease & { query?: string; sort?: 'name' | 'modified' | 'size'; cursor?: string | null; foldersOnly?: boolean }): Promise<Listing>;
  // Names and content never go into browser history, workspace storage or SW.
  // Drive search uses POST; global command search continues to read RAM only.
  locations(current: Location): Array<{ name: string; kind?: 'drive' | 'apps'; icon?: string; selected?: boolean; location: Location }>;
  subscribe(listener: (change: { kind: 'transfers' | 'resources'; source?: Resource['source']; folderId?: string | null }) => void): () => void;
  // Drive normalizes action IDs to preview/download/rename/move/delete.
  // App action IDs are capability-driven and remain owned by native providers.
  // create-folder has resourceKey=null and explicit parentId in input.
  run(resourceKey: string | null, actionId: string, options: Lease & { input?: Record<string, unknown> }): Promise<{ ok: boolean; error?: string; cancelled?: boolean; blob?: Blob; file?: Blob }>;
  // Upload keeps the account lease, never an Explorer/folder-navigation lease.
  // The service captures folderId before work, owns File references and releases
  // them on success/cancel/account abort. No silent retry of an uncertain write.
  upload(files: File[], options: { folderId: string | null; current(): boolean }): Promise<unknown>;
  transfers(): Transfer[];
  cancelTransfer?(id: string): void;
  // Parent wires these system transfer hooks into frame busy()/flush(), so the
  // updater cannot reload during writes. Navigation is allowed; sign-out aborts.
  busy(): boolean;
  flush(options?: { timeoutMs?: number }): Promise<{ lost: number }>;
  destroy(): void;
}
