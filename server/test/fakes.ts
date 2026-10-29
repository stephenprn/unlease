/**
 * S3 and Seafile in memory, answering the requests the server sends as the real ones do, so the
 * backup, the restore and the drive run end to end without a network.
 */

const xmlEscape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function bodyBytes(init?: RequestInit): Promise<Buffer> {
  if (!init?.body) return Buffer.alloc(0);
  return Buffer.from(await new Response(init.body).arrayBuffer());
}

/** One bucket, path-style (`/<bucket>/<key>`). */
export class FakeS3 {
  readonly objects = new Map<string, { data: Buffer; type: string; at: number }>();
  /** Every request, `METHOD key`. */
  readonly log: string[] = [];
  /** Set to make every request fail this way. */
  failWith: { status: number; code: string } | null = null;
  /** Set to make some requests fail: what to answer for this one, or null to answer it. */
  failOn: ((method: string, key: string) => { status: number; code: string } | null) | null = null;
  unreachable = false;

  constructor(
    readonly bucket = 'carnet-test',
    private readonly now: () => number = Date.now,
  ) {}

  readonly fetch: typeof fetch = async (input, init) => {
    if (this.unreachable) throw new TypeError('fetch failed');
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    if (!headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256 Credential=')) return this.error(403, 'AccessDenied');
    if (this.failWith) return this.error(this.failWith.status, this.failWith.code);
    const [, bucket, ...rest] = url.pathname.split('/');
    if (bucket !== this.bucket) return this.error(404, 'NoSuchBucket');
    const key = rest.map(decodeURIComponent).join('/');
    const failure = this.failOn?.(method, key);
    if (failure) return this.error(failure.status, failure.code);
    this.log.push(`${method} ${key}`);
    if (method === 'PUT') {
      this.objects.set(key, { data: await bodyBytes(init), type: headers.get('content-type') ?? '', at: this.now() });
      return new Response(null, { status: 200 });
    }
    if (method === 'DELETE') {
      this.objects.delete(key);
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && key === '') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const max = Number(url.searchParams.get('max-keys') ?? 1000);
      const keys = [...this.objects.keys()].filter(name => name.startsWith(prefix)).sort().slice(0, max);
      const contents = keys
        .map(name => `<Contents><Key>${xmlEscape(name)}</Key><LastModified>${new Date(this.objects.get(name)!.at).toISOString()}</LastModified><Size>${this.objects.get(name)!.data.length}</Size></Contents>`)
        .join('');
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`, { headers: { 'content-type': 'application/xml' } });
    }
    if (method === 'GET') {
      const object = this.objects.get(key);
      if (!object) return this.error(404, 'NoSuchKey');
      return new Response(new Uint8Array(object.data), { headers: { 'content-length': String(object.data.length), 'content-type': object.type } });
    }
    return this.error(405, 'MethodNotAllowed');
  };

  private error(status: number, code: string): Response {
    return new Response(`<?xml version="1.0"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`, { status, headers: { 'content-type': 'application/xml' } });
  }
}

type Node = { readonly type: 'dir' } | { readonly type: 'file'; readonly data: Buffer };

/**
 * One library behind a repo token. Like Seafile, its links name a public address (`publicUrl`),
 * whatever address was called; a taken name gets " (1)"; `mkdir` of an existing folder makes "x (1)".
 */
export class FakeSeafile {
  readonly tree = new Map<string, Node>([['/', { type: 'dir' }]]);
  readonly log: string[] = [];
  token = 'repo-token-0123456789abcdef';
  readOnly = false;
  repoId = 'repo-1';
  unreachable = false;

  constructor(readonly publicUrl = 'https://drive.public.example') {}

  file(path: string): Buffer | undefined {
    const node = this.tree.get(path);
    return node?.type === 'file' ? node.data : undefined;
  }

  files(): string[] {
    return [...this.tree.entries()].filter(([, node]) => node.type === 'file').map(([path]) => path).sort();
  }

  dirs(): string[] {
    return [...this.tree.entries()].filter(([path, node]) => node.type === 'dir' && path !== '/').map(([path]) => path).sort();
  }

  private parent(path: string): string {
    const at = path.lastIndexOf('/');
    return at <= 0 ? '/' : path.slice(0, at);
  }

  private free(dir: string, name: string): string {
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let candidate = name;
    for (let n = 1; this.tree.has(`${dir === '/' ? '' : dir}/${candidate}`); n += 1) candidate = `${stem} (${n})${ext}`;
    return candidate;
  }

  private mkdirs(dir: string): void {
    let path = '';
    for (const segment of dir.split('/').filter(Boolean)) {
      path = `${path}/${segment}`;
      if (!this.tree.has(path)) this.tree.set(path, { type: 'dir' });
    }
  }

  readonly fetch: typeof fetch = async (input, init) => {
    if (this.unreachable) throw new TypeError('fetch failed');
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    this.log.push(`${method} ${url.host}${url.pathname}`);
    if (url.pathname.startsWith('/seafhttp/')) return this.fileServer(url, method, init);
    const headers = new Headers(init?.headers);
    if (headers.get('authorization') !== `Token ${this.token}`) return Response.json({ detail: 'Invalid token' }, { status: 401 });
    const route = url.pathname.replace('/api/v2.1/via-repo-token/', '');
    const path = url.searchParams.get('path') ?? '/';
    const form = method === 'POST' ? new URLSearchParams(String(init?.body ?? '')) : new URLSearchParams();
    switch (`${method} ${route}`) {
      case 'GET repo-info/':
        return Response.json({ repo_id: this.repoId, repo_name: 'Documents', size: 0 });
      case 'GET upload-link/':
        return this.readOnly ? Response.json({ error_msg: 'denied' }, { status: 403 }) : Response.json(`${this.publicUrl}/seafhttp/upload-api/tok`);
      case 'GET download-link/':
        return this.tree.get(path)?.type === 'file' ? Response.json(`${this.publicUrl}/seafhttp/files/tok${path}`) : Response.json({ error_msg: 'missing' }, { status: 404 });
      case 'GET dir/': {
        const dir = path.replace(/\/+$/, '') || '/';
        if (this.tree.get(dir)?.type !== 'dir') return Response.json({ error_msg: 'Folder not found' }, { status: 404 });
        const prefix = dir === '/' ? '/' : `${dir}/`;
        const dirent_list = [...this.tree.entries()].filter(([child]) => child !== dir && child.startsWith(prefix) && !child.slice(prefix.length).includes('/')).map(([child, node]) => ({ type: node.type, name: child.slice(prefix.length), ...(node.type === 'file' ? { size: node.data.length } : {}) }));
        return Response.json({ dirent_list });
      }
      case 'POST dir/': {
        const dir = path.replace(/\/+$/, '');
        if (this.tree.get(this.parent(dir))?.type !== 'dir') return Response.json({ error_msg: 'parent missing' }, { status: 404 });
        const name = this.free(this.parent(dir), dir.slice(dir.lastIndexOf('/') + 1));
        this.tree.set(`${this.parent(dir) === '/' ? '' : this.parent(dir)}/${name}`, { type: 'dir' });
        return Response.json({ type: 'dir', obj_name: name });
      }
      case 'DELETE dir/': {
        for (const key of [...this.tree.keys()]) if (key === path || key.startsWith(`${path}/`)) this.tree.delete(key);
        return Response.json({ success: true });
      }
      case 'POST file/': {
        const node = this.tree.get(path);
        if (node?.type !== 'file') return Response.json({ error_msg: 'File not found' }, { status: 404 });
        if (form.get('operation') === 'move') {
          const dst = (form.get('dst_dir') ?? '/').replace(/\/+$/, '') || '/';
          if (this.tree.get(dst)?.type !== 'dir') return Response.json({ error_msg: 'Folder not found' }, { status: 404 });
          if (this.parent(path) === dst) return Response.json({ obj_name: path.slice(path.lastIndexOf('/') + 1) });
          const name = this.free(dst, path.slice(path.lastIndexOf('/') + 1));
          this.tree.delete(path);
          this.tree.set(`${dst === '/' ? '' : dst}/${name}`, node);
          return Response.json({ obj_name: name, parent_dir: dst });
        }
        if (form.get('operation') === 'rename') {
          const name = this.free(this.parent(path), form.get('newname') ?? '');
          this.tree.delete(path);
          this.tree.set(`${this.parent(path) === '/' ? '' : this.parent(path)}/${name}`, node);
          return Response.json({ obj_name: name });
        }
        return Response.json({ error_msg: 'operation' }, { status: 400 });
      }
      case 'DELETE file/':
        this.tree.delete(path);
        return Response.json({ success: true });
      default:
        return Response.json({ error_msg: 'not found' }, { status: 404 });
    }
  };

  private async fileServer(url: URL, method: string, init?: RequestInit): Promise<Response> {
    if (url.pathname === '/seafhttp/upload-api/tok' && method === 'POST') {
      const form = await new Request(url, { method: 'POST', body: init?.body ?? null }).formData();
      const file = form.get('file') as File;
      const dir = `/${String(form.get('relative_path') ?? '')}`.replace(/\/+$/, '') || '/';
      this.mkdirs(dir);
      const name = this.free(dir, file.name);
      this.tree.set(`${dir === '/' ? '' : dir}/${name}`, { type: 'file', data: Buffer.from(await file.arrayBuffer()) });
      return Response.json([{ name, id: 'x', size: file.size }]);
    }
    if (url.pathname.startsWith('/seafhttp/files/tok/') && method === 'GET') {
      const data = this.file(decodeURIComponent(url.pathname.slice('/seafhttp/files/tok'.length)));
      return data ? new Response(new Uint8Array(data), { headers: { 'content-length': String(data.length) } }) : new Response('missing', { status: 404 });
    }
    return new Response('no', { status: 404 });
  }
}
