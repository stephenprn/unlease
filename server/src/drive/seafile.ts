/**
 * Seafile through a library API token (`/api/v2.1/via-repo-token/…`): the server holds no account,
 * only one library, revocable from Seafile. What its answers do not say:
 *  - upload and download links come back as a quoted JSON string, and point at Seafile's public
 *    address (`FILE_SERVER_ROOT`) whatever address was called: they are sent to the one configured;
 *  - an upload makes the folders of `relative_path` itself, whereas `mkdir` of an existing folder
 *    quietly makes "Foo (1)": folders are made only after checking they are missing;
 *  - a name already taken is not replaced: Seafile picks "name (1).jpg", and says which.
 */
import { basename, dirname } from 'node:path/posix';

export class SeafileError extends Error {
  constructor(
    /** The HTTP status, 0 when Seafile could not be reached. */
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The answer was not Seafile's JSON (a web page, another service). */
const NOT_SEAFILE = -1;

/** What went wrong, in the apps' words. */
export function seafileProblem(error: unknown): string {
  if (!(error instanceof SeafileError) || error.status === 0) return 'Seafile injoignable';
  if (error.status === NOT_SEAFILE) return 'Cette adresse ne répond pas comme un serveur Seafile';
  if (error.status === 401 || error.status === 403) return 'Jeton refusé par Seafile';
  if (error.status === 443) return 'Quota Seafile dépassé';
  if (error.status === 404) return 'Introuvable dans Seafile';
  return `Seafile a répondu ${error.status}`;
}

export interface Dirent {
  readonly name: string;
  readonly type: 'dir' | 'file';
  /** A file's bytes; -1 when Seafile did not say. */
  readonly size: number;
}

const TIMEOUT_MS = 30_000;

export class SeafileClient {
  private readonly base: URL;

  constructor(
    url: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.base = new URL(url.endsWith('/') ? url : `${url}/`);
  }

  private api(path: string, query: Record<string, string> = {}): string {
    const url = new URL(`api/v2.1/via-repo-token/${path}`, this.base);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return url.toString();
  }

  /** A file-server link, sent to the configured address. */
  private local(link: string): string {
    const url = new URL(link);
    url.protocol = this.base.protocol;
    url.host = this.base.host;
    return url.toString();
  }

  private async call(url: string, init: RequestInit = {}, signal?: AbortSignal, timeoutMs: number | null = TIMEOUT_MS): Promise<Response> {
    const signals = [signal, timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined].filter((entry): entry is AbortSignal => entry !== undefined);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: { Authorization: `Token ${this.token}`, Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
        signal: signals.length > 0 ? AbortSignal.any(signals) : undefined,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new SeafileError(0, error instanceof Error ? error.message : 'unreachable');
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SeafileError(response.status, text.slice(0, 200) || `Seafile answered ${response.status}`);
    }
    return response;
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.call(url, init);
    try {
      return (await response.json()) as T;
    } catch {
      throw new SeafileError(NOT_SEAFILE, 'not JSON');
    }
  }

  private form(fields: Record<string, string>): RequestInit {
    return { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() };
  }

  async repoInfo(): Promise<{ readonly id: string; readonly name: string }> {
    const info = await this.json<{ repo_id?: unknown; repo_name?: unknown }>(this.api('repo-info/'));
    if (typeof info.repo_id !== 'string') throw new SeafileError(502, 'no library in the answer');
    return { id: info.repo_id, name: typeof info.repo_name === 'string' ? info.repo_name : '' };
  }

  /** Uploading needs read and write: a read-only token is refused a link. */
  async canWrite(): Promise<boolean> {
    try {
      await this.uploadLink();
      return true;
    } catch (error) {
      if (error instanceof SeafileError && error.status === 403) return false;
      throw error;
    }
  }

  private async uploadLink(): Promise<string> {
    return this.local(String(await this.json<string>(this.api('upload-link/', { path: '/' }))));
  }

  /** A folder's entries, or null when it does not exist. */
  async list(dir: string): Promise<Dirent[] | null> {
    try {
      const body = await this.json<{ dirent_list?: unknown }>(this.api('dir/', { path: dir }));
      // Removing folders rests on this: anything but a list is an error, and every entry counts.
      if (!Array.isArray(body.dirent_list)) throw new SeafileError(NOT_SEAFILE, 'no dirent_list');
      return (body.dirent_list as { name?: unknown; type?: unknown; size?: unknown }[]).map(entry => ({
        name: String(entry.name ?? ''),
        type: entry.type === 'dir' ? 'dir' : 'file',
        size: typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : -1,
      }));
    } catch (error) {
      if (error instanceof SeafileError && error.status === 404) return null;
      throw error;
    }
  }

  /** Makes `dir` and its missing parents; `known` remembers the folders seen this pass. */
  async ensureDir(dir: string, known: Set<string> = new Set()): Promise<void> {
    let path = '';
    for (const segment of dir.split('/').filter(Boolean)) {
      path = `${path}/${segment}`;
      if (known.has(path)) continue;
      if ((await this.list(path)) === null) await this.call(this.api('dir/', { path }), this.form({ operation: 'mkdir' }));
      known.add(path);
    }
  }

  /** Sends a file as `dir/name` (folders made as needed) and gives the path it was stored at. */
  async upload(dir: string, name: string, file: Blob, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append('parent_dir', '/');
    form.append('relative_path', dir.replace(/^\/+/, ''));
    form.append('file', file, name);
    const link = new URL(await this.uploadLink());
    link.searchParams.set('ret-json', '1');
    const response = await this.call(link.toString(), { method: 'POST', body: form }, signal, null);
    const stored = (await response.json().catch(() => null)) as { name?: unknown; size?: unknown }[] | null;
    const storedName = Array.isArray(stored) && typeof stored[0]?.name === 'string' ? stored[0].name : name;
    const storedSize = Array.isArray(stored) ? stored[0]?.size : undefined;
    if (typeof storedSize === 'number' && storedSize !== file.size) throw new SeafileError(502, `${name}: ${storedSize} bytes stored instead of ${file.size}`);
    return `${dir}/${storedName}`;
  }

  async download(path: string, signal?: AbortSignal): Promise<{ readonly body: ReadableStream<Uint8Array>; readonly size: number }> {
    const link = this.local(String(await this.json<string>(this.api('download-link/', { path }))));
    const response = await this.call(link, {}, signal, null);
    if (!response.body) throw new SeafileError(502, 'empty download');
    return { body: response.body, size: Number(response.headers.get('content-length') ?? -1) };
  }

  /** Moves a file to `target` (a full path), making its folder; gives where it landed. */
  async place(path: string, target: string, known: Set<string> = new Set()): Promise<string> {
    let current = path;
    if (dirname(path) !== dirname(target)) {
      await this.ensureDir(dirname(target), known);
      const moved = await this.json<{ obj_name?: unknown }>(this.api('file/', { path }), this.form({ operation: 'move', dst_dir: dirname(target) }));
      current = `${dirname(target)}/${typeof moved.obj_name === 'string' ? moved.obj_name : basename(path)}`;
    }
    if (basename(current) !== basename(target)) {
      const renamed = await this.json<{ obj_name?: unknown }>(this.api('file/', { path: current }), this.form({ operation: 'rename', newname: basename(target) }));
      current = `${dirname(current)}/${typeof renamed.obj_name === 'string' ? renamed.obj_name : basename(target)}`;
    }
    return current;
  }

  /** Deleting a file that is already gone is fine. */
  async delete(path: string): Promise<void> {
    await this.call(this.api('file/', { path }), { method: 'DELETE' });
  }

  async deleteDir(path: string): Promise<void> {
    await this.call(this.api('dir/', { path }), { method: 'DELETE' });
  }
}
