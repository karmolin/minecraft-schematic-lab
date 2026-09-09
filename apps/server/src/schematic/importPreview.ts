import type { BlockVolume } from '@minecraft-schematic-lab/block-compiler';
import type { PreviewData } from '@minecraft-schematic-lab/shared';

type State = { name: string; props: Record<string, string> };
const directions: Record<string, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};
const left: Record<string, string> = { north: 'west', west: 'south', south: 'east', east: 'north' };
const opposite: Record<string, string> = {
  north: 'south',
  south: 'north',
  west: 'east',
  east: 'west',
};
const stairs = (s: State) => s.name.endsWith('_stairs');
const pane = (s: State) => s.name.endsWith('glass_pane') || s.name === 'minecraft:iron_bars';
const fence = (s: State) => s.name.endsWith('_fence');
const wall = (s: State) => s.name.endsWith('_wall');
const fullCube = (s: State) =>
  s.name.startsWith('minecraft:') &&
  !/(air|water|lava|_stairs|_slab|_fence|_gate|_wall|_pane|iron_bars|_door|_trapdoor|_torch|_carpet|_button|_plate|_sapling|_flower|_rail|_sign|_bed|_leaves|grass|fern|vine|ladder|snow|chest|brewing_stand|cobweb|tripwire|redstone_wire)$/.test(
    s.name,
  );

/** Legacy metadata omits these neighbour-derived shapes. Resolve for display only. */
export function importedPreview(volume: BlockVolume): PreviewData {
  const cache = new Map<string, State>();
  function at(x: number, y: number, z: number): State {
    const raw = volume.getBlock(x, y, z);
    let parsed = cache.get(raw);
    if (!parsed) {
      const [name, properties] = raw.replace(/\]$/, '').split('[');
      parsed = {
        name: name!,
        props: Object.fromEntries(
          (properties ?? '')
            .split(',')
            .filter(Boolean)
            .map((p) => p.split('=')),
        ),
      };
      cache.set(raw, parsed);
    }
    return parsed;
  }
  const instances: PreviewData['instances'] = {};
  volume.forEachYZX((x, y, z, raw) => {
    if (raw === 'minecraft:air') return;
    const state = at(x, y, z);
    let name = state.name;
    const props = { ...state.props };
    const neighbour = (facing: string, reverse = false) => {
      const [dx, dz] = directions[reverse ? opposite[facing]! : facing] ?? [0, 0];
      return at(x + dx, y, z + dz);
    };
    if (pane(state) || fence(state) || wall(state)) {
      for (const direction of Object.keys(directions)) {
        const other = neighbour(direction);
        const similar = pane(state) ? pane(other) : fence(state) ? fence(other) : wall(other);
        props[direction] = String(
          similar ||
            fullCube(other) ||
            ((fence(state) || wall(state)) && other.name.endsWith('_fence_gate')),
        );
      }
      if (wall(state))
        props.up = String(
          !(
            props.north === props.south &&
            props.east === props.west &&
            props.north !== props.east
          ) || at(x, y + 1, z).name !== 'minecraft:air',
        );
    }
    if (stairs(state)) {
      const facing = props.facing ?? 'east';
      const half = props.half ?? 'bottom';
      const differentAxis = (other: State) =>
        other.props.facing !== facing && other.props.facing !== opposite[facing];
      const same = (other: State) =>
        stairs(other) && other.props.half === half && other.props.facing === facing;
      const front = neighbour(facing);
      const back = neighbour(facing, true);
      props.shape = 'straight';
      if (
        stairs(front) &&
        front.props.half === half &&
        differentAxis(front) &&
        !same(neighbour(front.props.facing!, true))
      ) {
        props.shape = front.props.facing === left[facing] ? 'outer_left' : 'outer_right';
      } else if (
        stairs(back) &&
        back.props.half === half &&
        differentAxis(back) &&
        !same(neighbour(back.props.facing!))
      ) {
        props.shape = back.props.facing === left[facing] ? 'inner_left' : 'inner_right';
      }
    }
    if (name.endsWith('_door')) {
      const upper = props.half === 'upper';
      const other = at(x, y + (upper ? -1 : 1), z);
      if (other.name === name) {
        for (const key of upper ? ['facing', 'open'] : ['hinge', 'powered']) {
          if (other.props[key]) props[key] = other.props[key]!;
        }
      }
    }
    const legacy = volume.getLegacyBlock(x, y, z);
    if (legacy?.id === 175 && legacy.data & 8) {
      const lower = at(x, y - 1, z);
      if (volume.getLegacyBlock(x, y - 1, z)?.id === 175) {
        name = lower.name;
        props.half = 'upper';
      }
    }
    const properties = Object.entries(props)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    const displayState = properties ? `${name}[${properties}]` : name;
    (instances[displayState] ??= []).push([x, y, z]);
  });
  return { size: { x: volume.x, y: volume.y, z: volume.z }, instances };
}
