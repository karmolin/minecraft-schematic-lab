import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import AdmZip from 'adm-zip';

const MAX_ARCHIVE = 256 * 1024 * 1024;
const MAX_ENTRY = 32 * 1024 * 1024;
const MAX_ENTRIES = 40_000;
const MAX_TOTAL = 512 * 1024 * 1024;

export const digest = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex').slice(0, 20);

export function resourcePath(path: string): string {
  if (
    !path ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.includes(':') ||
    path.startsWith('/') ||
    path.split('/').some((p) => p === '..' || p === '.' || p === '')
  ) {
    throw new Error('Invalid resource path');
  }
  return path;
}

export interface PackSource {
  revision: string;
  names: Set<string>;
  read(path: string): Buffer | null;
}

function jsonRoot(names: Set<string>, vanilla: boolean): string {
  if (vanilla || names.has('pack.mcmeta')) return '';
  const roots = [...names].filter((n) => /^[^/]+\/pack\.mcmeta$/.test(n));
  if (roots.length === 1) return roots[0]!.slice(0, -'pack.mcmeta'.length);
  throw new Error('缺少 pack.mcmeta，请将 pack.mcmeta 和 assets 放在材质包根目录。');
}

/** Snapshot the archive so replacements cannot mix old metadata with new textures. */
export function zipSource(path: string, vanilla = false): PackSource {
  if (statSync(path).size > MAX_ARCHIVE) throw new Error('ZIP 超过 256 MB，首版暂不支持。');
  const bytes = readFileSync(path);
  const zip = new AdmZip(bytes);
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) throw new Error('材质包文件数量过多。');
  const all = new Map<string, (typeof entries)[number]>();
  let total = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = resourcePath(entry.entryName);
    if (name.includes('\uFFFD')) throw new Error('ZIP 内文件名编码异常，请使用 UTF-8 重新压缩。');
    if (all.has(name)) throw new Error(`ZIP 内存在重名文件：${name}`);
    if ((entry.header.flags & 1) !== 0) throw new Error('暂不支持加密 ZIP。');
    total += entry.header.size;
    if (total > MAX_TOTAL) throw new Error('材质包解压后过大。');
    all.set(name, entry);
  }
  const root = jsonRoot(new Set(all.keys()), vanilla);
  const names = new Set(
    [...all.keys()].filter((n) => n.startsWith(root)).map((n) => n.slice(root.length)),
  );
  return {
    revision: digest(bytes),
    names,
    read(path) {
      resourcePath(path);
      const entry = all.get(root + path);
      if (!entry) return null;
      if (entry.header.size > MAX_ENTRY) throw new Error(`资源文件超过 32 MB：${path}`);
      return entry.getData();
    },
  };
}

/** Directory packs are indexed recursively; symlinks never escape the configured pack. */
export function folderSource(path: string): PackSource {
  const root = realpathSync(path);
  const files = new Map<string, { size: number; mtimeMs: number; ctimeMs: number }>();
  function walk(dir: string, prefix: string, depth: number): void {
    if (depth > 24) throw new Error('材质包目录层级过深。');
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const name = prefix + item.name;
      resourcePath(name);
      if (item.isDirectory()) walk(join(dir, item.name), name + '/', depth + 1);
      else if (item.isFile()) {
        const stat = statSync(join(dir, item.name));
        files.set(name, { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs });
        if (files.size > MAX_ENTRIES) throw new Error('材质包文件数量过多。');
      }
    }
  }
  walk(root, '', 0);
  const prefix = jsonRoot(new Set(files.keys()), false);
  return {
    revision: digest(JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b)))),
    names: new Set(
      [...files.keys()].filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length)),
    ),
    read(path) {
      resourcePath(path);
      const name = prefix + path;
      const expected = files.get(name);
      if (!expected) return null;
      const file = resolve(root, name);
      const actual = realpathSync(file);
      const rel = relative(root, actual);
      if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\'))
        throw new Error('Invalid resource path');
      const stat = lstatSync(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size !== expected.size ||
        stat.mtimeMs !== expected.mtimeMs ||
        stat.ctimeMs !== expected.ctimeMs
      ) {
        throw new Error('材质包正在修改，请刷新列表后重试。');
      }
      if (stat.size > MAX_ENTRY) throw new Error(`资源文件超过 32 MB：${path}`);
      return readFileSync(file);
    },
  };
}

export function readJson<T>(bytes: Buffer | null, name: string): T {
  if (!bytes) throw new Error(`缺少资源：${name}`);
  if (bytes.length > 2 * 1024 * 1024) throw new Error(`JSON 文件过大：${name}`);
  try {
    return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as T;
  } catch {
    throw new Error(`JSON 格式错误：${name}`);
  }
}
