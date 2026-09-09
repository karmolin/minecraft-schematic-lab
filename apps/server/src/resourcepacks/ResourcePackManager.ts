import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ResourcePackInfo, ResourcePackList } from '@minecraft-schematic-lab/shared';
import {
  digest,
  folderSource,
  readJson,
  resourcePath,
  zipSource,
  type PackSource,
} from './PackSource';
import { HttpError } from '../httpError';
import { PackPreference } from './PackPreference';

interface InstalledPack {
  info: ResourcePackInfo;
  source?: PackSource;
  fingerprint: string;
}

export interface PackResources {
  packId: string;
  revision: string;
  read(path: string): { bytes: Buffer; source: 'pack' | 'vanilla' } | null;
  url(path: string): string;
}

const stripFormatting = (value: string) => value.replace(/§[0-9a-fk-or]/gi, '').trim();

export class ResourcePackManager {
  private readonly installed = new Map<string, InstalledPack>();
  private base: PackSource | null = null;
  private baseFingerprint = '';
  private baseError = '';
  private readonly preference: PackPreference;

  constructor(
    readonly directory: string,
    private readonly vanillaJar: string,
  ) {
    mkdirSync(directory, { recursive: true });
    this.preference = new PackPreference(directory);
  }

  list(force = false): ResourcePackList {
    try {
      const stat = statSync(this.vanillaJar);
      const stamp = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      if (force || stamp !== this.baseFingerprint) {
        const base = zipSource(this.vanillaJar, true);
        if (
          !base.names.has('assets/minecraft/blockstates/stone.json') ||
          !base.names.has('assets/minecraft/textures/blocks/stone.png')
        ) {
          throw new Error('原版底层资源必须来自 Minecraft Java 1.12.2 客户端 JAR。');
        }
        this.base = base;
        this.baseFingerprint = stamp;
      }
      this.baseError = '';
    } catch (error) {
      this.base = null;
      this.baseFingerprint = '';
      this.baseError = existsSync(this.vanillaJar)
        ? error instanceof Error
          ? error.message
          : String(error)
        : '尚未配置 1.12.2 原版底层资源。请将客户端 JAR 放入 resourcepacks/.base/minecraft-1.12.2.jar。';
    }

    const found = new Set<string>();
    for (const item of readdirSync(this.directory, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.isSymbolicLink()) continue;
      if (!item.isDirectory() && !(item.isFile() && /\.zip$/i.test(item.name))) continue;
      const id = digest(item.name);
      found.add(id);
      const path = join(this.directory, item.name);
      let fingerprint = '';
      try {
        const stat = statSync(path);
        fingerprint = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
        const previous = this.installed.get(id);
        // Folder children can change without touching the root directory's mtime.
        if (!force && item.isFile() && previous?.fingerprint === fingerprint) continue;
        const source = item.isDirectory() ? folderSource(path) : zipSource(path);
        const meta = readJson<{ pack?: { pack_format?: unknown; description?: unknown } }>(
          source.read('pack.mcmeta'),
          'pack.mcmeta',
        );
        if (meta?.pack?.pack_format !== 3)
          throw new Error('首版仅支持 1.12.2 材质包（pack_format 必须为 3）。');
        const description =
          typeof meta.pack.description === 'string' ? stripFormatting(meta.pack.description) : '';
        const info: ResourcePackInfo = {
          id,
          name: stripFormatting(item.name.replace(/\.zip$/i, '')),
          description,
          revision: source.revision,
          kind: item.isDirectory() ? 'folder' : 'zip',
          status: 'ready',
        };
        this.installed.set(id, { info, source, fingerprint });
      } catch (error) {
        this.installed.set(id, {
          fingerprint,
          info: {
            id,
            name: stripFormatting(item.name),
            description: '',
            revision: digest(fingerprint),
            kind: item.isDirectory() ? 'folder' : 'zip',
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    for (const id of this.installed.keys()) if (!found.has(id)) this.installed.delete(id);
    const packs: ResourcePackInfo[] = [
      {
        id: 'builtin',
        name: 'Pixel Perfection CE（项目内置）',
        description: '',
        revision: 'builtin',
        kind: 'builtin',
        status: 'ready',
      },
      {
        id: 'vanilla',
        name: 'Minecraft 1.12.2 原版',
        description: '',
        revision: this.base?.revision ?? 'missing',
        kind: 'vanilla',
        status: this.base ? 'ready' : 'error',
        ...(this.baseError ? { error: this.baseError } : {}),
      },
    ];
    for (const pack of [...this.installed.values()].sort((a, b) =>
      a.info.name.localeCompare(b.info.name),
    )) {
      const revision = digest(`${pack.info.revision}:${this.base?.revision ?? 'missing'}`);
      packs.push({
        ...pack.info,
        revision,
        ...(pack.source?.names.has('pack.png')
          ? { iconUrl: this.assetUrl(pack.info.id, revision, 'pack.png') }
          : {}),
      });
    }
    return {
      directory: this.directory,
      minecraftVersion: '1.12.2',
      selectedPackId: this.preference.read(),
      baseReady: !!this.base,
      ...(this.baseError ? { baseError: this.baseError } : {}),
      packs,
    };
  }

  select(packId: string): { selectedPackId: string } {
    const list = this.list();
    const pack = list.packs.find((item) => item.id === packId);
    if (!pack || pack.status !== 'ready' || (packId !== 'builtin' && !list.baseReady))
      throw new HttpError(400, '材质包不可用，未更改已保存的选择。');
    this.preference.save(packId);
    return { selectedPackId: packId };
  }

  private assetUrl(id: string, revision: string, path: string): string {
    return `/api/resource-packs/${id}/${revision}/assets/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  resources(id: string, revision: string): PackResources {
    if (id === 'builtin') throw new HttpError(400, '内置材质由网页直接加载。');
    const pack = id === 'vanilla' ? undefined : this.installed.get(id);
    if (id !== 'vanilla' && (!pack || !pack.source || pack.info.status !== 'ready')) {
      throw new HttpError(404, '材质包不可用，请刷新列表。');
    }
    const actualRevision =
      id === 'vanilla'
        ? this.base?.revision
        : digest(`${pack!.info.revision}:${this.base?.revision ?? 'missing'}`);
    if (revision !== actualRevision) throw new HttpError(409, '材质包已更新，请刷新列表后重试。');
    if (!this.base) throw new HttpError(409, this.baseError || '缺少 1.12.2 原版底层资源。');
    const base = this.base;
    return {
      packId: id,
      revision,
      read(path) {
        resourcePath(path);
        const own = pack?.source?.read(path);
        if (own) return { bytes: own, source: 'pack' };
        const original = base.read(path);
        return original ? { bytes: original, source: 'vanilla' } : null;
      },
      url: (path) => this.assetUrl(id, revision, path),
    };
  }

  icon(id: string, revision: string): Buffer | null {
    const pack = this.installed.get(id);
    if (
      !pack?.source ||
      digest(`${pack.info.revision}:${this.base?.revision ?? 'missing'}`) !== revision
    )
      return null;
    return pack.source.read('pack.png');
  }
}
