import type {
  BlockFace,
  ModelVector,
  PackAppearance,
  PackElement,
  PackFace,
  PackModelPart,
  PackTexture,
} from '@minecraft-schematic-lab/shared';
import { readJson } from './PackSource';
import type { PackResources } from './ResourcePackManager';
import { legacyState } from './legacyState';

interface ModelFace {
  texture: string;
  uv?: [number, number, number, number];
  rotation?: number;
  tintindex?: number;
}
interface ModelElement extends Omit<PackElement, 'faces'> {
  faces: Partial<Record<BlockFace, ModelFace>>;
}
interface Model {
  parent?: string;
  textures?: Record<string, string>;
  elements?: ModelElement[];
}
interface Variant {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
  weight?: number;
}
type Condition = Record<string, string | Condition[]>;
interface BlockState {
  variants?: Record<string, Variant | Variant[]>;
  multipart?: { when?: Condition; apply: Variant | Variant[] }[];
}

const DIRECTIONS: BlockFace[] = ['east', 'west', 'up', 'down', 'south', 'north'];

function assetName(reference: string, kind: 'models' | 'textures'): string {
  const pieces = reference.split(':');
  const namespace = pieces.length === 2 ? pieces[0]! : 'minecraft';
  let name = pieces.length === 2 ? pieces[1]! : reference;
  if (!/^[a-z0-9_.-]+$/.test(namespace) || !/^[a-z0-9_./!-]+$/.test(name) || name.includes('..'))
    throw new Error(`资源路径不支持：${reference}`);
  if (kind === 'models' && !name.includes('/')) name = `block/${name}`;
  return `assets/${namespace}/${kind}/${name}.${kind === 'models' ? 'json' : 'png'}`;
}

function firstVariant(variant: Variant | Variant[]): Variant {
  const first = Array.isArray(variant) ? variant[0] : variant;
  if (!first || typeof first.model !== 'string') throw new Error('方块模型引用无效。');
  return first;
}

function matches(condition: Condition | undefined, properties: Record<string, string>): boolean {
  if (!condition) return true;
  return Object.entries(condition).every(([key, expected]) => {
    if (key === 'OR' && Array.isArray(expected))
      return expected.some((c) => matches(c, properties));
    if (key === 'AND' && Array.isArray(expected))
      return expected.every((c) => matches(c, properties));
    return typeof expected === 'string' && expected.split('|').includes(properties[key] ?? 'false');
  });
}

function variantsFor(blockstate: BlockState, properties: Record<string, string>): Variant[] {
  if (Array.isArray(blockstate.multipart)) {
    return blockstate.multipart
      .filter((part) => matches(part.when, properties))
      .map((part) => firstVariant(part.apply));
  }
  const variants = Object.entries(blockstate.variants ?? {});
  const match = variants.find(
    ([key]) =>
      key === 'normal' ||
      key === '' ||
      key.split(',').every((part) => {
        const [k, v] = part.split('=');
        return !!k && properties[k] === v;
      }),
  );
  if (!match) throw new Error('该方块状态暂未匹配到 1.12.2 模型。');
  return [firstVariant(match[1])];
}

function vec(value: unknown): value is ModelVector {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1024)
  );
}

function validateElement(element: ModelElement): void {
  if (
    !element ||
    !vec(element.from) ||
    !vec(element.to) ||
    !element.faces ||
    typeof element.faces !== 'object'
  )
    throw new Error('方块模型坐标无效。');
  if (
    element.rotation &&
    (!vec(element.rotation.origin) ||
      !['x', 'y', 'z'].includes(element.rotation.axis) ||
      !Number.isFinite(element.rotation.angle) ||
      Math.abs(element.rotation.angle) > 45)
  )
    throw new Error('方块模型旋转无效。');
}

function animationFrame(
  resources: PackResources,
  path: string,
  bytes: Buffer,
): PackTexture['frame'] {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error(`贴图不是有效 PNG：${path}`);
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16_777_216)
    throw new Error(`贴图尺寸过大：${path}`);
  const meta = resources.read(`${path}.mcmeta`);
  if (!meta) return undefined;
  const data = readJson<{
    animation?: { width?: number; height?: number; frames?: (number | { index: number })[] };
  }>(meta.bytes, `${path}.mcmeta`);
  if (!data.animation) return undefined;
  const animation = data.animation;
  // 1.12 uses square frames unless explicit dimensions override that default.
  const frameWidth = animation.width ?? width;
  const frameHeight = animation.height ?? frameWidth;
  const first = animation.frames?.[0] ?? 0;
  const index = typeof first === 'number' ? first : first.index;
  if (
    ![frameWidth, frameHeight, index].every(Number.isInteger) ||
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    index < 0 ||
    width % frameWidth !== 0 ||
    height % frameHeight !== 0 ||
    index >= (width / frameWidth) * (height / frameHeight)
  ) {
    throw new Error(`动画帧配置无效：${path}`);
  }
  return {
    x: (index % (width / frameWidth)) * frameWidth,
    y: Math.floor(index / (width / frameWidth)) * frameHeight,
    width: frameWidth,
    height: frameHeight,
  };
}

/** Resolve only models used by the build. Unreferenced broken files do not reject a pack. */
export function resolveAppearance(resources: PackResources, states: string[]): PackAppearance {
  const result: PackAppearance = {
    packId: resources.packId,
    revision: resources.revision,
    blocks: {},
    textures: {},
  };
  const models = new Map<string, { model: Model; custom: boolean }>();
  function modelFor(path: string, chain: string[] = []): { model: Model; custom: boolean } {
    if (chain.includes(path) || chain.length > 24) throw new Error('方块模型存在循环继承。');
    const cached = models.get(path);
    if (cached) return cached;
    const resource = resources.read(path);
    const own = readJson<Model>(resource?.bytes ?? null, path);
    if (!own || typeof own !== 'object') throw new Error(`无效模型：${path}`);
    const parent = own.parent ? modelFor(assetName(own.parent, 'models'), [...chain, path]) : null;
    const merged = {
      model: {
        ...parent?.model,
        ...own,
        textures: { ...parent?.model.textures, ...own.textures },
        elements: own.elements ?? parent?.model.elements,
      },
      custom: resource?.source === 'pack' || !!parent?.custom,
    };
    models.set(path, merged);
    return merged;
  }

  for (const state of [...new Set(states)]) {
    try {
      const { name, properties } = legacyState(state);
      const blockstatePath = `assets/minecraft/blockstates/${name}.json`;
      const source = resources.read(blockstatePath);
      if (!source) throw new Error('未找到该方块的 1.12.2 资源；方块 ID 未作修改。');
      const definition = readJson<BlockState>(source.bytes, blockstatePath);
      let custom = source.source === 'pack';
      const parts: PackModelPart[] = [];
      const localTextures: Record<string, PackTexture> = {};
      for (const variant of variantsFor(definition, properties)) {
        const resolved = modelFor(assetName(variant.model, 'models'));
        custom ||= resolved.custom;
        const model = resolved.model;
        if (!Array.isArray(model.elements) || model.elements.length === 0)
          throw new Error('该方块使用特殊渲染，首版暂不支持。');
        if (model.elements.length > 512) throw new Error('方块模型部件过多。');
        const elements: PackElement[] = [];
        for (const element of model.elements) {
          validateElement(element);
          const faces: Partial<Record<BlockFace, PackFace>> = {};
          for (const direction of DIRECTIONS) {
            const face = element.faces[direction];
            if (!face) continue;
            let texture = face.texture;
            const seen = new Set<string>();
            while (typeof texture === 'string' && texture.startsWith('#')) {
              if (seen.has(texture)) throw new Error('贴图引用存在循环。');
              seen.add(texture);
              texture = model.textures?.[texture.slice(1)] ?? '';
            }
            if (!texture) throw new Error('模型缺少贴图引用。');
            const path = assetName(texture, 'textures');
            let ref = localTextures[path] ?? result.textures[path];
            if (!ref) {
              const resource = resources.read(path);
              if (!resource) throw new Error(`缺少贴图：${path}`);
              ref = {
                url: resources.url(path),
                source: resource.source,
                frame: animationFrame(resources, path, resource.bytes),
              };
            }
            localTextures[path] = ref;
            custom ||= ref.source === 'pack';
            if (
              face.uv &&
              (!Array.isArray(face.uv) || face.uv.length !== 4 || !face.uv.every(Number.isFinite))
            )
              throw new Error('模型贴图坐标无效。');
            if (face.rotation !== undefined && ![0, 90, 180, 270].includes(face.rotation))
              throw new Error('模型贴图旋转无效。');
            faces[direction] = {
              texture: path,
              uv: face.uv,
              rotation: face.rotation,
              ...(face.tintindex !== undefined && face.tintindex >= 0
                ? {
                    tint: /spruce/.test(name)
                      ? '#619961'
                      : /birch/.test(name)
                        ? '#80a755'
                        : '#91bd59',
                  }
                : {}),
            };
          }
          elements.push({ from: element.from, to: element.to, rotation: element.rotation, faces });
        }
        if (![variant.x ?? 0, variant.y ?? 0].every((n) => Number.isFinite(n) && n % 90 === 0))
          throw new Error('方块状态旋转无效。');
        parts.push({
          elements,
          x: variant.x ?? 0,
          y: variant.y ?? 0,
          uvlock: variant.uvlock ?? false,
        });
      }
      if (parts.length === 0) throw new Error('该方块状态没有可显示模型。');
      result.blocks[state] = { parts, source: custom ? 'pack' : 'vanilla' };
      Object.assign(result.textures, localTextures);
    } catch (error) {
      result.blocks[state] = {
        parts: [],
        source: 'missing',
        warning: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return result;
}
