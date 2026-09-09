export const en = {
  import: {
    title: 'Import',
    button: 'Import .schematic',
    busy: 'Importing…',
    description: 'Open a MCEdit / WorldEdit 6 schematic in the 3D preview, then ask for changes.',
    hint: 'Up to 32 MiB / 2 million cells. Opens a new build and keeps your previous session.',
    invalidType:
      'Please choose a legacy .schematic file. Sponge .schem import is not supported yet.',
    invalidSize: 'Choose a non-empty file up to 32 MiB.',
    restartRequired:
      'The preview server is still running the old version. Restart start.bat, refresh this page, then import again.',
    success: (name: string) => `Imported: ${name}. You can now ask to modify this build.`,
  },
  packs: {
    title: 'Resource packs',
    select: 'Preview resource pack',
    builtin: 'Pixel Perfection CE (bundled)',
    vanilla: 'Minecraft 1.12.2 default',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    loading: 'Loading textures…',
    ready: 'Ready',
    keptPrevious: 'Previous preview retained',
    unavailable: 'Unavailable',
    directory: 'Resource pack folder',
    instructions:
      'Drop a ZIP or unpacked resource pack into this folder. Detected every 5 seconds.',
    coverage: (custom: number, vanilla: number, missing: number) =>
      `Block types: pack ${custom} · default ${vanilla} · unsupported ${missing}`,
    missing: 'Show unsupported blocks',
    limitations:
      'First animation frame and model variant; fixed foliage tint. Special renderers are not supported yet.',
  },
  header: {
    tag: 'driven by Claude · local preview',
    switchLang: '中文',
  },
  claudeHint: {
    title: 'Driven by Claude',
    intro: 'Ask Claude to build something, for example:',
    example: '"build me a 50×40×80 fantasy castle"',
    description:
      'This preview updates by itself as Claude builds or changes the schematic. Export it below, or go back to Claude and ask for changes, an export, or to save versions.',
  },
  build: {
    title: 'Build',
    empty: 'Nothing yet — ask Claude to build something.',
    blocks: 'Blocks',
    size: 'Size',
  },
  materials: {
    title: 'Materials',
    empty: 'Build something (ask Claude).',
    total: (n: string) => `Total: ${n} blocks`,
  },
  export: {
    saveSpec: 'Save editable BuildSpec JSON',
    title: 'Export',
    formatLabel: 'Format',
    formatMcedit: 'Legacy MCEdit .schematic (WorldEdit 6 / 1.12)',
    formatSpongeV2: 'Sponge v2 .schem (most compatible)',
    formatSpongeV3: 'Sponge v3 .schem',
    exportBtn: (ext: string) => `Export ${ext}`,
    helpSummary: (ext: string) => `How to use the ${ext} in Minecraft`,
    helpStep1Pre: "Put the file in your world's",
    helpStep1Post: 'folder (WorldEdit / FAWE).',
    helpStep2Pre: 'In-game run',
    helpStep2Post: '.',
    helpStep3Pre: 'Stand where you want it and run',
    helpStep3Post: '.',
  },
  preview: {
    screenshot: '📷 Screenshot',
    empty: "Ask Claude to build something — it'll appear here.",
  },
};

export type Messages = {
  import: {
    title: string;
    button: string;
    busy: string;
    description: string;
    hint: string;
    invalidType: string;
    invalidSize: string;
    restartRequired: string;
    success: (name: string) => string;
  };
  packs: {
    title: string;
    select: string;
    builtin: string;
    vanilla: string;
    refresh: string;
    refreshing: string;
    loading: string;
    ready: string;
    keptPrevious: string;
    unavailable: string;
    directory: string;
    instructions: string;
    coverage: (custom: number, vanilla: number, missing: number) => string;
    missing: string;
    limitations: string;
  };
  header: { tag: string; switchLang: string };
  claudeHint: { title: string; intro: string; example: string; description: string };
  build: { title: string; empty: string; blocks: string; size: string };
  materials: { title: string; empty: string; total: (n: string) => string };
  export: {
    saveSpec: string;
    title: string;
    formatLabel: string;
    formatMcedit: string;
    formatSpongeV2: string;
    formatSpongeV3: string;
    exportBtn: (ext: string) => string;
    helpSummary: (ext: string) => string;
    helpStep1Pre: string;
    helpStep1Post: string;
    helpStep2Pre: string;
    helpStep2Post: string;
    helpStep3Pre: string;
    helpStep3Post: string;
  };
  preview: { screenshot: string; empty: string };
};
