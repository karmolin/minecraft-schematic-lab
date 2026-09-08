/** The first resource-pack implementation deliberately targets Java 1.12.2 only. */
export interface ResourcePackInfo {
  id: string;
  name: string;
  description: string;
  revision: string;
  kind: 'builtin' | 'vanilla' | 'zip' | 'folder';
  status: 'ready' | 'error';
  error?: string;
  iconUrl?: string;
}

export interface ResourcePackList {
  directory: string;
  minecraftVersion: '1.12.2';
  baseReady: boolean;
  baseError?: string;
  packs: ResourcePackInfo[];
}

export type BlockFace = 'east' | 'west' | 'up' | 'down' | 'south' | 'north';
export type ModelVector = [number, number, number];

export interface PackTexture {
  url: string;
  source: 'pack' | 'vanilla';
  /** The first declared animation frame, cropped rather than squeezed onto a face. */
  frame?: { x: number; y: number; width: number; height: number };
}

export interface PackFace {
  texture: string;
  uv?: [number, number, number, number];
  rotation?: number;
  tint?: string;
}

export interface PackElement {
  from: ModelVector;
  to: ModelVector;
  rotation?: { origin: ModelVector; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean };
  faces: Partial<Record<BlockFace, PackFace>>;
}

export interface PackModelPart {
  elements: PackElement[];
  x: number;
  y: number;
  uvlock: boolean;
}

export interface PackBlockAppearance {
  parts: PackModelPart[];
  source: 'pack' | 'vanilla' | 'missing';
  warning?: string;
}

export interface PackAppearance {
  packId: string;
  revision: string;
  blocks: Record<string, PackBlockAppearance>;
  textures: Record<string, PackTexture>;
}
