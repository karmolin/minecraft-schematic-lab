import * as THREE from 'three';
import type {
  BlockFace,
  PackBlockAppearance,
  PackElement,
  PackFace,
  PackModelPart,
} from '@minecraft-schematic-lab/shared';
import type { LoadedPack } from './packTextures';

const FACES: BlockFace[] = ['east', 'west', 'up', 'down', 'south', 'north'];
const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const UV_BASIS: Record<BlockFace, [THREE.Vector3, THREE.Vector3]> = {
  east: [new THREE.Vector3(0, 0, -1), AXES.y],
  west: [AXES.z, AXES.y],
  up: [AXES.x, new THREE.Vector3(0, 0, -1)],
  down: [AXES.x, AXES.z],
  south: [AXES.x, AXES.y],
  north: [new THREE.Vector3(-1, 0, 0), AXES.y],
};

export function defaultFaceUV(
  element: PackElement,
  face: BlockFace,
): [number, number, number, number] {
  const [x1, y1, z1] = element.from,
    [x2, y2, z2] = element.to;
  switch (face) {
    case 'down':
      return [x1, 16 - z2, x2, 16 - z1];
    case 'up':
      return [x1, z1, x2, z2];
    case 'north':
      return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south':
      return [x1, 16 - y2, x2, 16 - y1];
    case 'west':
      return [z1, 16 - y2, z2, 16 - y1];
    case 'east':
      return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
  }
}

function lockedUV(
  u: number,
  v: number,
  direction: BlockFace,
  rotation: THREE.Matrix4,
): [number, number] {
  const [basisU, basisV] = UV_BASIS[direction];
  const rotatedU = basisU.clone().transformDirection(rotation),
    rotatedV = basisV.clone().transformDirection(rotation);
  const normal = rotatedU.clone().cross(rotatedV);
  const target: BlockFace =
    Math.abs(normal.x) > 0.5
      ? normal.x > 0
        ? 'east'
        : 'west'
      : Math.abs(normal.y) > 0.5
        ? normal.y > 0
          ? 'up'
          : 'down'
        : normal.z > 0
          ? 'south'
          : 'north';
  const [destU, destV] = UV_BASIS[target];
  return [
    0.5 + (u - 0.5) * rotatedU.dot(destU) + (v - 0.5) * rotatedV.dot(destU),
    0.5 + (u - 0.5) * rotatedU.dot(destV) + (v - 0.5) * rotatedV.dot(destV),
  ];
}

function applyUV(
  geometry: THREE.BufferGeometry,
  group: number,
  element: PackElement,
  direction: BlockFace,
  face: PackFace,
  part: PackModelPart,
  rotation: THREE.Matrix4,
): void {
  const uv = geometry.getAttribute('uv');
  const [u1, v1, u2, v2] = face.uv ?? defaultFaceUV(element, direction);
  for (let index = group * 4; index < group * 4 + 4; index++) {
    let u = uv.getX(index),
      v = uv.getY(index);
    if (part.uvlock) [u, v] = lockedUV(u, v, direction, rotation);
    for (let turns = (face.rotation ?? 0) / 90; turns > 0; turns--) [u, v] = [1 - v, u];
    uv.setXY(index, (u1 + u * (u2 - u1)) / 16, 1 - (v1 + (1 - v) * (v2 - v1)) / 16);
  }
}

export function createPackGeometry(
  block: PackBlockAppearance | undefined,
  pack: LoadedPack,
  state: string,
): {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
} {
  if (!block || block.parts.length === 0) {
    return {
      geometry: new THREE.BoxGeometry(1, 1, 1),
      materials: [new THREE.MeshStandardMaterial({ color: '#dc43b6', roughness: 1 })],
    };
  }
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const materials: THREE.Material[] = [];
  const materialKeys = new Map<string, number>();
  const transparent = /glass|ice|slime/.test(state);
  function materialFor(face: PackFace): number {
    const key = `${face.texture}:${face.tint ?? 'white'}`;
    const previous = materialKeys.get(key);
    if (previous !== undefined) return previous;
    const index = materials.length;
    materials.push(
      new THREE.MeshStandardMaterial({
        map: pack.textures[face.texture] ?? null,
        color: face.tint ?? '#ffffff',
        roughness: 1,
        metalness: 0,
        transparent,
        alphaTest: transparent ? 0.01 : 0.5,
        depthWrite: !transparent,
        side: THREE.DoubleSide,
      }),
    );
    materialKeys.set(key, index);
    return index;
  }
  for (const part of block.parts) {
    const rotation = new THREE.Matrix4()
      .makeRotationY(THREE.MathUtils.degToRad(-part.y))
      .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(-part.x)));
    for (const element of part.elements) {
      const [x1, y1, z1] = element.from,
        [x2, y2, z2] = element.to;
      const box = new THREE.BoxGeometry((x2 - x1) / 16, (y2 - y1) / 16, (z2 - z1) / 16);
      box.translate((x1 + x2) / 32 - 0.5, (y1 + y2) / 32 - 0.5, (z1 + z2) / 32 - 0.5);
      FACES.forEach((direction, index) => {
        const face = element.faces[direction];
        if (face) applyUV(box, index, element, direction, face, part, rotation);
      });
      if (element.rotation) {
        const rot = element.rotation;
        const origin = new THREE.Vector3(...rot.origin).divideScalar(16).addScalar(-0.5);
        box.translate(-origin.x, -origin.y, -origin.z);
        if (rot.rescale) {
          const scale = 1 / Math.cos(THREE.MathUtils.degToRad(rot.angle));
          box.scale(
            rot.axis === 'x' ? 1 : scale,
            rot.axis === 'y' ? 1 : scale,
            rot.axis === 'z' ? 1 : scale,
          );
        }
        box.applyMatrix4(
          new THREE.Matrix4().makeRotationAxis(AXES[rot.axis], THREE.MathUtils.degToRad(rot.angle)),
        );
        box.translate(origin.x, origin.y, origin.z);
      }
      box.applyMatrix4(rotation);
      const offset = positions.length / 3;
      positions.push(...box.getAttribute('position').array);
      normals.push(...box.getAttribute('normal').array);
      uvs.push(...box.getAttribute('uv').array);
      FACES.forEach((direction, faceIndex) => {
        const face = element.faces[direction];
        if (!face) return;
        const start = indices.length;
        for (let n = faceIndex * 6; n < faceIndex * 6 + 6; n++)
          indices.push(box.index!.getX(n) + offset);
        groups.push({ start, count: 6, materialIndex: materialFor(face) });
      });
      box.dispose();
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // One draw group per material, not per face/element (important for instanced builds).
  const groupedIndices: number[] = [];
  for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
    const start = groupedIndices.length;
    for (const group of groups)
      if (group.materialIndex === materialIndex)
        groupedIndices.push(...indices.slice(group.start, group.start + group.count));
    geometry.addGroup(start, groupedIndices.length - start, materialIndex);
  }
  geometry.setIndex(groupedIndices);
  geometry.computeBoundingSphere();
  return { geometry, materials };
}
