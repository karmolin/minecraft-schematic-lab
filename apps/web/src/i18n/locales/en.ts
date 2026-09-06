export const en = {
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
  header: { tag: string; switchLang: string };
  claudeHint: { title: string; intro: string; example: string; description: string };
  build: { title: string; empty: string; blocks: string; size: string };
  materials: { title: string; empty: string; total: (n: string) => string };
  export: {
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
