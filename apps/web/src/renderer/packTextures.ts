import * as THREE from 'three';
import type { PackAppearance, PackTexture } from '@minecraft-schematic-lab/shared';

export interface LoadedPack {
  appearance: PackAppearance;
  textures: Record<string, THREE.Texture>;
}

export function disposePack(pack: LoadedPack | null): void {
  if (pack) for (const texture of Object.values(pack.textures)) texture.dispose();
}

function configure(texture: THREE.Texture): void {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
}

async function loadTexture(ref: PackTexture): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(ref.url);
  if (ref.frame) {
    const frame = ref.frame;
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      texture.dispose();
      throw new Error('无法创建贴图画布。');
    }
    ctx.drawImage(
      texture.image as HTMLImageElement,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    );
    texture.dispose();
    const cropped = new THREE.CanvasTexture(canvas);
    configure(cropped);
    return cropped;
  }
  configure(texture);
  return texture;
}

/** Prepare every required image before publishing a switch. Dispose failed/superseded loads. */
export async function loadPackTextures(
  appearance: PackAppearance,
  signal: AbortSignal,
): Promise<LoadedPack> {
  const pack: LoadedPack = { appearance, textures: {} };
  const entries = Object.entries(appearance.textures);
  let next = 0;
  let failure: unknown;
  async function worker(): Promise<void> {
    while (next < entries.length && !failure && !signal.aborted) {
      const [path, ref] = entries[next++]!;
      try {
        pack.textures[path] = await loadTexture(ref);
      } catch {
        failure = new Error(`贴图加载失败：${path}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, entries.length) }, () => worker()));
  if (failure || signal.aborted) {
    disposePack(pack);
    throw failure ?? new DOMException('Superseded', 'AbortError');
  }
  return pack;
}
