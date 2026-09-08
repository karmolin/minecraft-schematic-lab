import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BlockInstance, PreviewData } from '@minecraft-schematic-lab/shared';
import { createPackGeometry } from './packGeometry';
import type { LoadedPack } from './packTextures';

function BlockBatch({
  state,
  positions,
  size,
  pack,
}: {
  state: string;
  positions: BlockInstance[];
  size: PreviewData['size'];
  pack: LoadedPack;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { geometry, materials } = useMemo(
    () => createPackGeometry(pack.appearance.blocks[state], pack, state),
    [pack, state],
  );
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    positions.forEach(([x, y, z], index) => {
      matrix.makeTranslation(x - size.x / 2 + 0.5, y - size.y / 2 + 0.5, z - size.z / 2 + 0.5);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [positions, size, geometry]);
  useEffect(
    () => () => {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
    [geometry, materials],
  );
  return (
    <instancedMesh
      key={`${state}:${positions.length}`}
      ref={ref}
      args={[geometry, materials, positions.length]}
      dispose={null}
    />
  );
}

export function PackBlocks({ data, pack }: { data: PreviewData; pack: LoadedPack }) {
  return (
    <>
      {Object.entries(data.instances)
        .filter(([, positions]) => positions.length > 0)
        .map(([state, positions]) => (
          <BlockBatch
            key={state}
            state={state}
            positions={positions}
            size={data.size}
            pack={pack}
          />
        ))}
    </>
  );
}
