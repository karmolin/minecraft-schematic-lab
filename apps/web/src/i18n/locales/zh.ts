import type { Messages } from './en';

export const zh: Messages = {
  packs: {
    title: '材质包',
    select: '预览材质包',
    builtin: 'Pixel Perfection CE（项目内置）',
    vanilla: 'Minecraft 1.12.2 原版',
    refresh: '刷新列表 / 重试',
    refreshing: '刷新中…',
    loading: '正在加载贴图…',
    ready: '已就绪',
    keptPrevious: '已保留上一预览',
    unavailable: '不可用',
    directory: '材质包文件夹',
    instructions: '将 ZIP 或解压文件夹放入下面的目录，每 5 秒自动识别。',
    coverage: (custom: number, vanilla: number, missing: number) =>
      `方块种类：材质包 ${custom} · 原版 ${vanilla} · 不支持 ${missing}`,
    missing: '查看不支持的方块',
    limitations: '首版使用动画首帧、首个模型变体和固定草叶颜色，暂不支持特殊渲染。',
  },
  header: {
    tag: '由 Claude 驱动 · 本地预览',
    switchLang: 'English',
  },
  claudeHint: {
    title: '由 Claude 驱动',
    intro: '让 Claude 构建一些东西，例如：',
    example: '"帮我建一座 50×40×80 的奇幻城堡"',
    description:
      '当 Claude 构建或修改原理图时，此预览会自动更新。在下方导出，或返回 Claude 请求修改、导出或保存版本。',
  },
  build: {
    title: '构建信息',
    empty: '暂无内容 — 让 Claude 构建一些东西。',
    blocks: '方块数',
    size: '尺寸',
  },
  materials: {
    title: '材料清单',
    empty: '构建一些东西（让 Claude 来做）。',
    total: (n: string) => `合计：${n} 个方块`,
  },
  export: {
    title: '导出',
    formatLabel: '格式',
    formatMcedit: '旧版 MCEdit .schematic（WorldEdit 6 / 1.12）',
    formatSpongeV2: 'Sponge v2 .schem（兼容性最佳）',
    formatSpongeV3: 'Sponge v3 .schem',
    exportBtn: (ext: string) => `导出 ${ext}`,
    helpSummary: (ext: string) => `如何在 Minecraft 中使用 ${ext}`,
    helpStep1Pre: '将文件放入存档的',
    helpStep1Post: '文件夹（WorldEdit / FAWE）。',
    helpStep2Pre: '在游戏中运行',
    helpStep2Post: '。',
    helpStep3Pre: '站在目标位置并运行',
    helpStep3Post: '。',
  },
  preview: {
    screenshot: '📷 截图',
    empty: '让 Claude 构建一些东西 — 它将显示在这里。',
  },
};
