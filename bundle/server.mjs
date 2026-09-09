#!/usr/bin/env node

// apps/server/src/index.ts
import { existsSync as existsSync5 } from "node:fs";
import { createServer } from "node:net";

// apps/server/src/config.ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
function resolveWebDist() {
  const candidates = [];
  if (process.env.WEB_DIST_PATH) {
    candidates.push(process.env.WEB_DIST_PATH);
  }
  candidates.push(fileURLToPath(new URL("./web/dist", import.meta.url)));
  candidates.push(fileURLToPath(new URL("../../web/dist", import.meta.url)));
  for (const dir of candidates) {
    if (existsSync(`${dir}/index.html`)) {
      return dir;
    }
  }
  return candidates[candidates.length - 1];
}
function loadConfig(argv = process.argv.slice(2)) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number.parseInt(process.env.PORT ?? "", 10) || 8765;
  const mcpMode = argv.includes("--mcp") || process.env.MCP === "1";
  const baseUrl = `http://${host}:${port}`;
  const webDist = resolveWebDist();
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const installRoot = existsSync(join(moduleDir, "config.ts")) ? resolve(moduleDir, "../../..") : resolve(moduleDir, "..");
  const resourcePacksDir = resolve(
    process.env.RESOURCE_PACKS_DIR || join(installRoot, "resourcepacks")
  );
  const vanillaJar = resolve(
    process.env.MINECRAFT_112_JAR || join(resourcePacksDir, ".base", "minecraft-1.12.2.jar")
  );
  return { host, port, baseUrl, mcpMode, webDist, resourcePacksDir, vanillaJar };
}

// apps/server/src/git/GitProjectService.ts
import { existsSync as existsSync2, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname2, isAbsolute, join as join2, relative, resolve as resolve2, sep } from "node:path";
import { execa } from "execa";

// apps/server/src/httpError.ts
var HttpError = class extends Error {
  statusCode;
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
};
function statusCodeOf(error) {
  if (error instanceof HttpError) return error.statusCode;
  return 500;
}
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// apps/server/src/git/GitProjectService.ts
var GitProjectService = class {
  /** Resolve and validate a path: symlink-safe, must live under (not be) the home directory. */
  resolveSafePath(input) {
    if (!input || !input.trim()) {
      throw new HttpError(400, "A project path is required.");
    }
    const abs = isAbsolute(input) ? input : resolve2(homedir(), input);
    let existing = abs;
    while (!existsSync2(existing) && dirname2(existing) !== existing) {
      existing = dirname2(existing);
    }
    const realExisting = realpathSync(existing);
    const remainder = relative(existing, abs);
    const realAbs = remainder ? join2(realExisting, remainder) : realExisting;
    const realHome = realpathSync(homedir());
    if (realAbs === realHome) {
      throw new HttpError(400, "Refusing to use the home directory itself; pick a subfolder.");
    }
    if (!realAbs.startsWith(realHome + sep)) {
      throw new HttpError(400, "Project path must be inside your home directory.");
    }
    return realAbs;
  }
  ensureDir(dir) {
    mkdirSync(dir, { recursive: true });
  }
  async checkGitAvailable() {
    try {
      await execa("git", ["--version"]);
    } catch {
      throw new HttpError(500, "git is not installed. Install git and try again.");
    }
  }
  async isRepo(dir) {
    try {
      const { stdout } = await execa("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir });
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }
  async initRepo(dir) {
    await execa("git", ["init", "-b", "main"], { cwd: dir });
  }
  async readLocalIdentity(dir) {
    const get = async (key) => {
      try {
        const { stdout } = await execa("git", ["config", "--local", key], { cwd: dir });
        return stdout.trim() || null;
      } catch {
        return null;
      }
    };
    return { name: await get("user.name"), email: await get("user.email") };
  }
  async setLocalIdentity(dir, name, email) {
    await execa("git", ["config", "--local", "user.name", name], { cwd: dir });
    await execa("git", ["config", "--local", "user.email", email], { cwd: dir });
  }
  writeFiles(dir, files) {
    this.ensureDir(dir);
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join2(dir, name), content, "utf8");
    }
  }
  async commitAll(cwd, message) {
    await execa("git", ["add", "-A"], { cwd });
    const status = await execa("git", ["status", "--porcelain"], { cwd });
    if (!status.stdout.trim()) {
      return { committed: false, commit: null };
    }
    await execa("git", ["commit", "-m", message], { cwd });
    const head = await execa("git", ["rev-parse", "HEAD"], { cwd });
    return { committed: true, commit: head.stdout.trim() };
  }
  async currentBranch(cwd) {
    try {
      const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
  async listBranches(cwd) {
    try {
      const { stdout } = await execa("git", ["branch", "--format=%(refname:short)"], { cwd });
      return stdout.split("\n").map((b) => b.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  async createBranch(cwd, name) {
    this.assertGitRef(name, "branch");
    await execa("git", ["branch", name], { cwd });
  }
  async checkoutBranch(cwd, name) {
    this.assertGitRef(name, "branch");
    await execa("git", ["checkout", name], { cwd });
  }
  async remotes(cwd) {
    try {
      const { stdout } = await execa("git", ["remote"], { cwd });
      return stdout.split("\n").map((r) => r.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  async setRemote(cwd, name, url) {
    this.assertGitRef(name, "remote");
    this.assertRemoteUrl(url);
    const existing = await this.remotes(cwd);
    if (existing.includes(name)) {
      await execa("git", ["remote", "set-url", name, url], { cwd });
    } else {
      await execa("git", ["remote", "add", name, url], { cwd });
    }
  }
  async push(cwd, remote, branch) {
    this.assertGitRef(remote, "remote");
    this.assertGitRef(branch, "branch");
    const { stdout, stderr } = await execa("git", ["push", "--set-upstream", remote, branch], {
      cwd
    });
    return [stdout, stderr].filter(Boolean).join("\n");
  }
  assertGitRef(name, kind) {
    if (typeof name !== "string" || !name.trim()) {
      throw new HttpError(400, `A ${kind} name is required.`);
    }
    if (name.startsWith("-") || !/^[A-Za-z0-9._/-]+$/.test(name)) {
      throw new HttpError(400, `Invalid ${kind} name: "${name}".`);
    }
  }
  assertRemoteUrl(url) {
    if (typeof url !== "string" || !url.trim()) {
      throw new HttpError(400, "A remote URL is required.");
    }
    if (url.startsWith("-") || !/^(https:\/\/|git@|ssh:\/\/)[\w@.:/~-]+$/.test(url)) {
      throw new HttpError(400, "Remote URL must be an https or ssh git URL.");
    }
  }
};

// apps/server/src/http/createHttpServer.ts
import { existsSync as existsSync4 } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

// apps/server/src/http/routes/exportRoutes.ts
function registerExportRoutes(app, sm) {
  app.get("/api/session/export.schem", async (request, reply) => {
    const { version, format } = request.query;
    const schematicFormat = format === "mcedit" ? "mcedit" : version === "3" ? "sponge-v3" : "sponge-v2";
    const { buffer, filename } = await sm.exportSchematic(schematicFormat);
    return reply.type("application/octet-stream").header("content-disposition", `attachment; filename="${filename}"`).send(buffer);
  });
}

// packages/shared/src/blockColor.ts
function cleanName(state) {
  const s = state.toLowerCase();
  const withoutNs = s.includes(":") ? s.slice(s.indexOf(":") + 1) : s;
  return withoutNs.replace(/\[.*$/, "");
}
var KEYWORD_COLORS = [
  { re: /sea_lantern|prismarine/, hex: "#9fc6bd" },
  { re: /end_rod/, hex: "#e6e2d6" },
  { re: /glass|pane/, hex: "#a9e0f5" },
  { re: /water/, hex: "#3b6feb" },
  { re: /lava|magma/, hex: "#d8662a" },
  { re: /glowstone|shroomlight|redstone_lamp|lantern|torch|lamp|^light$/, hex: "#f4d27a" },
  { re: /mossy/, hex: "#6f7f53" },
  { re: /cobble/, hex: "#7c7c7c" },
  { re: /stone_brick|brick_stone/, hex: "#8a8a8a" },
  { re: /deepslate/, hex: "#3b3b40" },
  { re: /blackstone|basalt|obsidian/, hex: "#2b2b33" },
  { re: /andesite|gravel/, hex: "#9a9a9a" },
  { re: /diorite|quartz|calcite/, hex: "#e7e5dd" },
  { re: /amethyst/, hex: "#9a70c4" },
  { re: /purpur/, hex: "#ab63ab" },
  { re: /granite/, hex: "#9a6a5a" },
  { re: /stone|smooth_stone/, hex: "#8f8f8f" },
  { re: /dark_oak|stripped_spruce/, hex: "#4b3621" },
  { re: /spruce/, hex: "#6f4f2a" },
  { re: /birch/, hex: "#d8c896" },
  { re: /acacia/, hex: "#b5642e" },
  { re: /jungle/, hex: "#9b6b3f" },
  { re: /mangrove/, hex: "#7a3f3a" },
  { re: /cherry/, hex: "#e3b6c8" },
  { re: /bamboo/, hex: "#c2b24a" },
  { re: /crimson/, hex: "#7b3a4b" },
  { re: /warped/, hex: "#2c8374" },
  { re: /oak|plank|log|wood|fence|stripped/, hex: "#9c7a48" },
  { re: /red_sand/, hex: "#bd6b3a" },
  { re: /sand|sandstone/, hex: "#dcd0a0" },
  { re: /nether_brick/, hex: "#3f2226" },
  { re: /brick/, hex: "#9b5b4a" },
  { re: /netherrack|nether/, hex: "#6e3334" },
  { re: /dirt|coarse|podzol|mud|clay|mycelium/, hex: "#7a5a3a" },
  { re: /grass|moss|leaves|vine|fern|kelp|lily/, hex: "#5d8a3a" },
  { re: /snow|powder_snow/, hex: "#eef3f6" },
  { re: /ice/, hex: "#9fd0ff" },
  { re: /wool|concrete|terracotta|glazed/, hex: "#b0795a" },
  { re: /netherite/, hex: "#4a4348" },
  { re: /iron/, hex: "#d8d8d8" },
  { re: /gold/, hex: "#f4d35e" },
  { re: /diamond/, hex: "#5fded0" },
  { re: /emerald/, hex: "#37c87a" },
  { re: /lapis/, hex: "#1f4ea1" },
  { re: /redstone/, hex: "#b32d2d" },
  { re: /coal/, hex: "#2a2a2a" },
  { re: /copper/, hex: "#c1714b" },
  { re: /bone/, hex: "#e3e0ca" }
];
var DYE_COLORS = {
  white: "#e3e6e6",
  light_gray: "#8e8e86",
  gray: "#3f4448",
  black: "#1a1c20",
  brown: "#7a4d2b",
  red: "#a52722",
  orange: "#f07613",
  yellow: "#f8c627",
  lime: "#64ab18",
  green: "#5a7d1d",
  cyan: "#158a8f",
  light_blue: "#3ab3da",
  blue: "#3a3cc1",
  purple: "#8a2db5",
  magenta: "#c14cc4",
  pink: "#ed9ab4"
};
var DYE_NAMES = Object.keys(DYE_COLORS).sort((a, b) => b.length - a.length);
var COLORED_BLOCK = /concrete|wool|terracotta|stained_glass|carpet|candle|shulker_box|glazed|bed|banner/;
function dyeColorFor(name) {
  for (const dye of DYE_NAMES) {
    if (name.startsWith(`${dye}_`)) return DYE_COLORS[dye] ?? null;
  }
  return null;
}
function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = h * 31 + s.charCodeAt(i) | 0;
  }
  return (h % 360 + 360) % 360;
}
function isTransparent(state) {
  return /glass|pane|ice|slime|honey|barrier|tinted/.test(cleanName(state));
}
function blockShape(state) {
  const s = cleanName(state);
  if (/stairs/.test(s)) return "stairs";
  if (/slab/.test(s)) return "slab";
  if (/_bars|^bars$|fence|_pane$|chain|end_rod|lightning_rod|_wall$|wall$|_rail|^rail$|ladder/.test(s)) {
    return "thin";
  }
  if (/glass/.test(s)) return "glass";
  return "full";
}
function colorFor(state) {
  const s = state.toLowerCase();
  const name = cleanName(state);
  if (COLORED_BLOCK.test(name)) {
    const dye = dyeColorFor(name);
    if (dye) return dye;
  }
  for (const { re, hex } of KEYWORD_COLORS) {
    if (re.test(s)) return hex;
  }
  return `hsl(${hashHue(s)}, 42%, 55%)`;
}

// packages/shared/src/textureData.ts
var TEXTURE_NAMES = [
  "acacia_door_bottom",
  "acacia_door_top",
  "acacia_fence",
  "acacia_fence_gate",
  "acacia_fence_side",
  "acacia_fence_top",
  "acacia_leaves",
  "acacia_leaves1",
  "acacia_log",
  "acacia_log1",
  "acacia_log_top",
  "acacia_planks",
  "acacia_planks1",
  "acacia_planks2",
  "acacia_sapling",
  "acacia_trapdoor",
  "activator_rail",
  "activator_rail_on",
  "allium",
  "andesite",
  "andesite1",
  "anvil_base",
  "anvil_side",
  "anvil_top",
  "attached_melon_stem",
  "attached_pumpkin_stem",
  "azure_bluet",
  "bamboo_large_leaves",
  "bamboo_singleleaf",
  "bamboo_small_leaves",
  "bamboo_stage0",
  "bamboo_stalk",
  "barrel_bottom",
  "barrel_side",
  "barrel_top",
  "barrel_top_open",
  "beacon",
  "bedrock",
  "bee_nest_bottom",
  "bee_nest_front",
  "bee_nest_front_honey",
  "bee_nest_side",
  "bee_nest_top",
  "beehive_end",
  "beehive_front",
  "beehive_front_honey",
  "beehive_side",
  "beetroots_stage0",
  "beetroots_stage1",
  "beetroots_stage2",
  "beetroots_stage3",
  "bell_bottom",
  "bell_side",
  "bell_top",
  "birch_door_bottom",
  "birch_door_side",
  "birch_door_top",
  "birch_fence",
  "birch_fence_gate",
  "birch_fence_side",
  "birch_fence_top",
  "birch_leaves",
  "birch_leaves1",
  "birch_log",
  "birch_log1",
  "birch_log_top",
  "birch_planks",
  "birch_planks1",
  "birch_planks2",
  "birch_sapling",
  "birch_trapdoor",
  "black_concrete",
  "black_concrete_powder",
  "black_glazed_terracotta",
  "black_stained_glass",
  "black_stained_glass_pane_top",
  "black_terracotta",
  "black_wool",
  "blast_furnace_front",
  "blast_furnace_front_on",
  "blast_furnace_side",
  "blast_furnace_top",
  "blue_concrete",
  "blue_concrete_powder",
  "blue_glazed_terracotta",
  "blue_ice",
  "blue_orchid",
  "blue_stained_glass",
  "blue_stained_glass_pane_top",
  "blue_terracotta",
  "blue_wool",
  "bone_block_side",
  "bone_block_top",
  "bookshelf",
  "bookshelf1",
  "bookshelf2",
  "bookshelf_top",
  "brain_coral",
  "brain_coral_block",
  "brain_coral_fan",
  "brewing_stand",
  "brewing_stand_base",
  "bricks",
  "bricks1",
  "bricks2",
  "bricks3",
  "bricks4",
  "bricks5",
  "bricks6",
  "bricks7",
  "brown_concrete",
  "brown_concrete_powder",
  "brown_glazed_terracotta",
  "brown_mushroom",
  "brown_mushroom_block",
  "brown_stained_glass",
  "brown_stained_glass_pane_top",
  "brown_terracotta",
  "brown_wool",
  "bubble_coral",
  "bubble_coral_block",
  "bubble_coral_fan",
  "cactus_bottom",
  "cactus_side",
  "cactus_top",
  "cake_bottom",
  "cake_inner",
  "cake_side",
  "cake_top",
  "campfire_fire",
  "campfire_log",
  "campfire_log_lit",
  "carrots_stage0",
  "carrots_stage1",
  "carrots_stage2",
  "carrots_stage3",
  "cartography_table_side1",
  "cartography_table_side2",
  "cartography_table_side3",
  "cartography_table_top",
  "carved_pumpkin",
  "cauldron_bottom",
  "cauldron_inner",
  "cauldron_side",
  "cauldron_top",
  "chain_command_block_back",
  "chain_command_block_conditional",
  "chain_command_block_front",
  "chain_command_block_side",
  "chipped_anvil_top",
  "chiseled_quartz_block",
  "chiseled_quartz_block_top",
  "chiseled_red_sandstone",
  "chiseled_red_sandstone1",
  "chiseled_sandstone",
  "chiseled_sandstone1",
  "chiseled_stone_bricks",
  "chorus_flower",
  "chorus_flower_dead",
  "chorus_plant",
  "clay",
  "coal_block",
  "coal_ore",
  "coal_ore1",
  "coal_ore2",
  "coarse_dirt",
  "cobble_mossy_wall_side",
  "cobble_mossy_wall_top",
  "cobble_wall_side",
  "cobble_wall_top",
  "cobblestone",
  "cobblestone1",
  "cobblestone2",
  "cobweb",
  "cocoa_stage0",
  "cocoa_stage1",
  "cocoa_stage2",
  "command_block_back",
  "command_block_conditional",
  "command_block_front",
  "command_block_side",
  "comparator",
  "comparator_on",
  "composter_bottom",
  "composter_compost",
  "composter_ready",
  "composter_side",
  "composter_top",
  "conduit",
  "cornflower",
  "cracked_stone_bricks",
  "crafting_table_front",
  "crafting_table_side",
  "crafting_table_top",
  "cut_red_sandstone",
  "cut_sandstone",
  "cyan_concrete",
  "cyan_concrete_powder",
  "cyan_glazed_terracotta",
  "cyan_stained_glass",
  "cyan_stained_glass_pane_top",
  "cyan_terracotta",
  "cyan_wool",
  "damaged_anvil_top",
  "dandelion",
  "dark_oak_door_bottom",
  "dark_oak_door_top",
  "dark_oak_fence",
  "dark_oak_fence_gate",
  "dark_oak_fence_side",
  "dark_oak_fence_top",
  "dark_oak_leaves",
  "dark_oak_leaves1",
  "dark_oak_log",
  "dark_oak_log1",
  "dark_oak_log_top",
  "dark_oak_planks",
  "dark_oak_planks1",
  "dark_oak_planks2",
  "dark_oak_sapling",
  "dark_oak_trapdoor",
  "dark_prismarine",
  "daylight_detector_inverted_top",
  "daylight_detector_side",
  "daylight_detector_top",
  "dead_brain_coral",
  "dead_brain_coral_block",
  "dead_brain_coral_fan",
  "dead_bubble_coral",
  "dead_bubble_coral_block",
  "dead_bubble_coral_fan",
  "dead_bush",
  "dead_fire_coral",
  "dead_fire_coral_block",
  "dead_fire_coral_fan",
  "dead_horn_coral",
  "dead_horn_coral_block",
  "dead_horn_coral_fan",
  "dead_tube_coral",
  "dead_tube_coral_block",
  "dead_tube_coral_fan",
  "debug",
  "debug2",
  "destroy_stage_0",
  "destroy_stage_1",
  "destroy_stage_2",
  "destroy_stage_3",
  "destroy_stage_4",
  "destroy_stage_5",
  "destroy_stage_6",
  "destroy_stage_7",
  "destroy_stage_8",
  "destroy_stage_9",
  "detector_rail",
  "detector_rail_on",
  "diamond_block",
  "diamond_ore",
  "diamond_ore1",
  "diorite",
  "diorite1",
  "dirt",
  "dirt1",
  "dirt2",
  "dirt3",
  "dirt4",
  "dispenser_front",
  "dispenser_front_vertical",
  "dragon_egg",
  "dried_kelp_bottom",
  "dried_kelp_side",
  "dried_kelp_top",
  "dropper_front",
  "dropper_front_vertical",
  "emerald_block",
  "emerald_ore",
  "emerald_ore1",
  "enchanting_table_bottom",
  "enchanting_table_side",
  "enchanting_table_top",
  "end_portal_frame_eye",
  "end_portal_frame_side",
  "end_portal_frame_top",
  "end_rod",
  "end_stone",
  "end_stone_bricks",
  "farmland",
  "farmland_moist",
  "fern",
  "fern1",
  "fire_0",
  "fire_1",
  "fire_coral",
  "fire_coral_block",
  "fire_coral_fan",
  "fletching_table_front",
  "fletching_table_side",
  "fletching_table_top",
  "flower_pot",
  "frosted_ice_0",
  "frosted_ice_1",
  "frosted_ice_2",
  "frosted_ice_3",
  "furnace_front",
  "furnace_front_on",
  "furnace_side",
  "furnace_top",
  "glass",
  "glass_pane_top",
  "glowstone",
  "gold_block",
  "gold_ore",
  "gold_ore1",
  "granite",
  "granite1",
  "grass",
  "grass1",
  "grass2",
  "grass_block_side",
  "grass_block_side_overlay",
  "grass_block_snow",
  "grass_block_top",
  "grass_block_top1",
  "grass_block_top2",
  "grass_block_top3",
  "grass_block_top_extra",
  "grass_block_top_extra1",
  "grass_path_side",
  "grass_path_top",
  "grass_path_top1",
  "gravel",
  "gray_concrete",
  "gray_concrete_powder",
  "gray_glazed_terracotta",
  "gray_stained_glass",
  "gray_stained_glass_pane_top",
  "gray_terracotta",
  "gray_wool",
  "green_concrete",
  "green_concrete_powder",
  "green_glazed_terracotta",
  "green_stained_glass",
  "green_stained_glass_pane_top",
  "green_terracotta",
  "green_wool",
  "grindstone_pivot",
  "grindstone_round",
  "grindstone_side",
  "hay_block_side",
  "hay_block_top",
  "honey_block_bottom",
  "honey_block_side",
  "honey_block_top",
  "honeycomb_block",
  "hopper_inside",
  "hopper_outside",
  "hopper_top",
  "horn_coral",
  "horn_coral_block",
  "horn_coral_fan",
  "ice",
  "iron_bars",
  "iron_bars_hor",
  "iron_block",
  "iron_door_bottom",
  "iron_door_top",
  "iron_ore",
  "iron_ore1",
  "iron_trapdoor",
  "item_frame",
  "item_frame_border",
  "jack_o_lantern",
  "jigsaw_bottom",
  "jigsaw_side",
  "jigsaw_top",
  "jukebox_side",
  "jukebox_top",
  "jungle_door_bottom",
  "jungle_door_side",
  "jungle_door_top",
  "jungle_fence",
  "jungle_fence_gate",
  "jungle_fence_side",
  "jungle_fence_top",
  "jungle_leaves",
  "jungle_leaves1",
  "jungle_log",
  "jungle_log1",
  "jungle_log_top",
  "jungle_planks",
  "jungle_planks1",
  "jungle_planks2",
  "jungle_sapling",
  "jungle_trapdoor",
  "kelp",
  "kelp_plant",
  "ladder",
  "lantern",
  "lapis_block",
  "lapis_ore",
  "lapis_ore1",
  "large_fern_bottom",
  "large_fern_top",
  "lava_flow",
  "lava_still",
  "lectern_base",
  "lectern_front",
  "lectern_sides",
  "lectern_top",
  "lever",
  "light_blue_concrete",
  "light_blue_concrete_powder",
  "light_blue_glazed_terracotta",
  "light_blue_stained_glass",
  "light_blue_stained_glass_pane_top",
  "light_blue_terracotta",
  "light_blue_wool",
  "light_gray_concrete",
  "light_gray_concrete_powder",
  "light_gray_glazed_terracotta",
  "light_gray_stained_glass",
  "light_gray_stained_glass_pane_top",
  "light_gray_terracotta",
  "light_gray_wool",
  "lilac_bottom",
  "lilac_top",
  "lily_of_the_valley",
  "lily_pad",
  "lily_pad_flowers",
  "lime_concrete",
  "lime_concrete_powder",
  "lime_glazed_terracotta",
  "lime_stained_glass",
  "lime_stained_glass_pane_top",
  "lime_terracotta",
  "lime_wool",
  "loom_bottom",
  "loom_front",
  "loom_side",
  "loom_top",
  "magenta_concrete",
  "magenta_concrete_powder",
  "magenta_glazed_terracotta",
  "magenta_stained_glass",
  "magenta_stained_glass_pane_top",
  "magenta_terracotta",
  "magenta_wool",
  "magma",
  "melon_side",
  "melon_stem",
  "melon_top",
  "mossy_cobblestone",
  "mossy_stone_bricks",
  "mushroom_block_inside",
  "mushroom_stem",
  "mycelium_side",
  "mycelium_top",
  "nether_bricks",
  "nether_bricks_fence",
  "nether_portal",
  "nether_quartz_ore",
  "nether_wart_block",
  "nether_wart_stage0",
  "nether_wart_stage1",
  "nether_wart_stage2",
  "netherrack",
  "note_block",
  "oak_door_bottom",
  "oak_door_top",
  "oak_fence",
  "oak_fence_gate",
  "oak_fence_side",
  "oak_fence_top",
  "oak_leaves",
  "oak_leaves1",
  "oak_log",
  "oak_log1",
  "oak_log_top",
  "oak_planks",
  "oak_planks1",
  "oak_planks2",
  "oak_sapling",
  "oak_trapdoor",
  "observer_back",
  "observer_back_on",
  "observer_front",
  "observer_front1",
  "observer_side",
  "observer_top",
  "obsidian",
  "orange_concrete",
  "orange_concrete_powder",
  "orange_glazed_terracotta",
  "orange_stained_glass",
  "orange_stained_glass_pane_top",
  "orange_terracotta",
  "orange_tulip",
  "orange_wool",
  "oxeye_daisy",
  "packed_ice",
  "peony_bottom",
  "peony_top",
  "pink_concrete",
  "pink_concrete_powder",
  "pink_glazed_terracotta",
  "pink_stained_glass",
  "pink_stained_glass_pane_top",
  "pink_terracotta",
  "pink_tulip",
  "pink_wool",
  "piston_bottom",
  "piston_inner",
  "piston_side",
  "piston_top",
  "piston_top_sticky",
  "podzol_side",
  "podzol_top",
  "polished_andesite",
  "polished_diorite",
  "polished_granite",
  "poppy",
  "portal",
  "potatoes_stage0",
  "potatoes_stage1",
  "potatoes_stage2",
  "potatoes_stage3",
  "powered_rail",
  "powered_rail_on",
  "prismarine",
  "prismarine_bricks",
  "pumpkin_side",
  "pumpkin_stem",
  "pumpkin_top",
  "purple_concrete",
  "purple_concrete_powder",
  "purple_glazed_terracotta",
  "purple_stained_glass",
  "purple_stained_glass_pane_top",
  "purple_terracotta",
  "purple_wool",
  "purpur_block",
  "purpur_pillar",
  "purpur_pillar_top",
  "quartz_block_bottom",
  "quartz_block_side",
  "quartz_block_top",
  "quartz_pillar",
  "quartz_pillar_top",
  "rail",
  "rail_corner",
  "red_concrete",
  "red_concrete_powder",
  "red_glazed_terracotta",
  "red_mushroom",
  "red_mushroom_block",
  "red_nether_bricks",
  "red_sand",
  "red_sand1",
  "red_sand2",
  "red_sandstone",
  "red_sandstone1",
  "red_sandstone2",
  "red_sandstone_bottom",
  "red_sandstone_top",
  "red_stained_glass",
  "red_stained_glass_pane_top",
  "red_terracotta",
  "red_tulip",
  "red_wool",
  "redstone_block",
  "redstone_dust_cross_overlay",
  "redstone_dust_dot",
  "redstone_dust_line0",
  "redstone_dust_line1",
  "redstone_dust_line_overlay",
  "redstone_dust_overlay",
  "redstone_lamp",
  "redstone_lamp_on",
  "redstone_ore",
  "redstone_ore1",
  "redstone_torch",
  "redstone_torch_off",
  "repeater",
  "repeater_on",
  "repeating_command_block_back",
  "repeating_command_block_conditional",
  "repeating_command_block_front",
  "repeating_command_block_side",
  "rose_bush_bottom",
  "rose_bush_top",
  "sand",
  "sand1",
  "sand2",
  "sand3",
  "sandstone",
  "sandstone1",
  "sandstone2",
  "sandstone_bottom",
  "sandstone_top",
  "scaffolding_bottom",
  "scaffolding_side",
  "scaffolding_top",
  "sea_lantern",
  "sea_pickle",
  "seagrass",
  "slime_block",
  "slime_block1",
  "slime_block2",
  "slime_block3",
  "slime_block4",
  "smithing_table_bottom",
  "smithing_table_front",
  "smithing_table_side",
  "smithing_table_top",
  "smoker_bottom",
  "smoker_front",
  "smoker_front_on",
  "smoker_side",
  "smoker_top",
  "smooth_stone",
  "smooth_stone_slab_side",
  "snow",
  "soul_sand",
  "spawner",
  "sponge",
  "spruce_door_bottom",
  "spruce_door_top",
  "spruce_fence",
  "spruce_fence_gate",
  "spruce_fence_side",
  "spruce_fence_top",
  "spruce_leaves",
  "spruce_leaves1",
  "spruce_log",
  "spruce_log1",
  "spruce_log_top",
  "spruce_planks",
  "spruce_planks1",
  "spruce_planks2",
  "spruce_sapling",
  "spruce_trapdoor",
  "stone",
  "stone1",
  "stone2",
  "stone3",
  "stone4",
  "stone5",
  "stone_bricks",
  "stone_bricks1",
  "stone_bricks2",
  "stone_bricks3",
  "stone_bricks4",
  "stone_slab_side",
  "stone_slab_top",
  "stonecutter_bottom",
  "stonecutter_saw",
  "stonecutter_side",
  "stonecutter_top",
  "stripped_acacia_log",
  "stripped_acacia_log_top",
  "stripped_birch_log",
  "stripped_birch_log_top",
  "stripped_dark_oak_log",
  "stripped_dark_oak_log_top",
  "stripped_jungle_log",
  "stripped_jungle_log_top",
  "stripped_oak_log",
  "stripped_oak_log_top",
  "stripped_spruce_log",
  "stripped_spruce_log_top",
  "structure_block",
  "structure_block_corner",
  "structure_block_data",
  "structure_block_load",
  "structure_block_save",
  "sugar_cane",
  "sugar_cane_extra",
  "sunflower_back",
  "sunflower_bottom",
  "sunflower_front",
  "sunflower_top",
  "sweet_berry_bush_stage0",
  "sweet_berry_bush_stage1",
  "sweet_berry_bush_stage2",
  "sweet_berry_bush_stage3",
  "tall_grass_bottom",
  "tall_grass_top",
  "tall_seagrass_bottom",
  "tall_seagrass_top",
  "terracotta",
  "tnt_bottom",
  "tnt_side",
  "tnt_top",
  "torch",
  "tripwire",
  "tripwire_hook",
  "tube_coral",
  "tube_coral_block",
  "tube_coral_fan",
  "turtle_egg",
  "turtle_egg_slightly_cracked",
  "turtle_egg_very_cracked",
  "vine",
  "water_flow",
  "water_overlay",
  "water_still",
  "wet_sponge",
  "wheat_stage0",
  "wheat_stage1",
  "wheat_stage2",
  "wheat_stage3",
  "wheat_stage4",
  "wheat_stage5",
  "wheat_stage6",
  "wheat_stage7",
  "wheat_stage7-1",
  "wheat_stage7-2",
  "white_concrete",
  "white_concrete_powder",
  "white_glazed_terracotta",
  "white_stained_glass",
  "white_stained_glass_pane_top",
  "white_terracotta",
  "white_tulip",
  "white_wool",
  "wither_rose",
  "yellow_concrete",
  "yellow_concrete_powder",
  "yellow_glazed_terracotta",
  "yellow_stained_glass",
  "yellow_stained_glass_pane_top",
  "yellow_terracotta",
  "yellow_wool"
];

// packages/shared/src/blockTexture.ts
var NAMES = new Set(TEXTURE_NAMES);

// packages/shared/src/ids.ts
function newBuildId() {
  return `build_${crypto.randomUUID()}`;
}
function newSessionId() {
  return `session_${crypto.randomUUID()}`;
}

// packages/shared/src/version.ts
var APP_VERSION = "0.1.0";

// apps/server/src/http/routes/healthRoutes.ts
function registerHealthRoutes(app) {
  app.get("/api/health", async () => ({
    ok: true,
    name: "minecraft-schematic-lab",
    version: APP_VERSION
  }));
}

// apps/server/src/http/routes/projectRoutes.ts
function registerProjectRoutes(app, sm) {
  app.post("/api/project/init-local", async (request) => {
    const { path } = request.body ?? {};
    return sm.initLocalProject(String(path ?? ""));
  });
  app.post("/api/project/init-git", async (request) => {
    const { path, userName, userEmail } = request.body ?? {};
    return sm.initGitProject(String(path ?? ""), userName, userEmail);
  });
  app.post("/api/project/save-version", async (request) => {
    const { message } = request.body ?? {};
    return sm.saveVersion(String(message ?? "Update schematic"));
  });
  app.get("/api/project/status", async () => sm.projectStatus());
  app.get("/api/project/branches", async () => sm.branches());
  app.post("/api/project/branch", async (request) => {
    const { name, create } = request.body ?? {};
    return sm.branch(String(name ?? ""), Boolean(create));
  });
  app.post("/api/project/push", async (request) => {
    const { remote, remoteUrl } = request.body ?? {};
    return sm.push(remote ?? "origin", remoteUrl);
  });
}

// apps/server/src/schematic/readSchematic.ts
import { gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import nbt from "prismarine-nbt";

// apps/server/src/schematic/data/legacy-blocks.json
var legacy_blocks_default = {
  "0:0": "minecraft:air",
  "1:0": "minecraft:stone",
  "1:1": "minecraft:granite",
  "1:2": "minecraft:polished_granite",
  "1:3": "minecraft:diorite",
  "1:4": "minecraft:polished_diorite",
  "1:5": "minecraft:andesite",
  "1:6": "minecraft:polished_andesite",
  "2:0": "minecraft:grass_block[snowy=false]",
  "3:0": "minecraft:dirt",
  "3:1": "minecraft:coarse_dirt",
  "3:2": "minecraft:podzol[snowy=false]",
  "4:0": "minecraft:cobblestone",
  "5:0": "minecraft:oak_planks",
  "5:1": "minecraft:spruce_planks",
  "5:2": "minecraft:birch_planks",
  "5:3": "minecraft:jungle_planks",
  "5:4": "minecraft:acacia_planks",
  "5:5": "minecraft:dark_oak_planks",
  "6:0": "minecraft:oak_sapling[stage=0]",
  "6:1": "minecraft:spruce_sapling[stage=0]",
  "6:2": "minecraft:birch_sapling[stage=0]",
  "6:3": "minecraft:jungle_sapling[stage=0]",
  "6:4": "minecraft:acacia_sapling[stage=0]",
  "6:5": "minecraft:dark_oak_sapling[stage=0]",
  "6:8": "minecraft:oak_sapling[stage=1]",
  "6:9": "minecraft:spruce_sapling[stage=1]",
  "6:10": "minecraft:birch_sapling[stage=1]",
  "6:11": "minecraft:jungle_sapling[stage=1]",
  "6:12": "minecraft:acacia_sapling[stage=1]",
  "6:13": "minecraft:dark_oak_sapling[stage=1]",
  "7:0": "minecraft:bedrock",
  "8:0": "minecraft:water[level=0]",
  "8:1": "minecraft:water[level=1]",
  "8:2": "minecraft:water[level=2]",
  "8:3": "minecraft:water[level=3]",
  "8:4": "minecraft:water[level=4]",
  "8:5": "minecraft:water[level=5]",
  "8:6": "minecraft:water[level=6]",
  "8:7": "minecraft:water[level=7]",
  "8:8": "minecraft:water[level=8]",
  "8:9": "minecraft:water[level=9]",
  "8:10": "minecraft:water[level=10]",
  "8:11": "minecraft:water[level=11]",
  "8:12": "minecraft:water[level=12]",
  "8:13": "minecraft:water[level=13]",
  "8:14": "minecraft:water[level=14]",
  "8:15": "minecraft:water[level=15]",
  "9:0": "minecraft:water[level=0]",
  "9:1": "minecraft:water[level=1]",
  "9:2": "minecraft:water[level=2]",
  "9:3": "minecraft:water[level=3]",
  "9:4": "minecraft:water[level=4]",
  "9:5": "minecraft:water[level=5]",
  "9:6": "minecraft:water[level=6]",
  "9:7": "minecraft:water[level=7]",
  "9:8": "minecraft:water[level=8]",
  "9:9": "minecraft:water[level=9]",
  "9:10": "minecraft:water[level=10]",
  "9:11": "minecraft:water[level=11]",
  "9:12": "minecraft:water[level=12]",
  "9:13": "minecraft:water[level=13]",
  "9:14": "minecraft:water[level=14]",
  "9:15": "minecraft:water[level=15]",
  "10:0": "minecraft:lava[level=0]",
  "10:1": "minecraft:lava[level=1]",
  "10:2": "minecraft:lava[level=2]",
  "10:3": "minecraft:lava[level=3]",
  "10:4": "minecraft:lava[level=4]",
  "10:5": "minecraft:lava[level=5]",
  "10:6": "minecraft:lava[level=6]",
  "10:7": "minecraft:lava[level=7]",
  "10:8": "minecraft:lava[level=8]",
  "10:9": "minecraft:lava[level=9]",
  "10:10": "minecraft:lava[level=10]",
  "10:11": "minecraft:lava[level=11]",
  "10:12": "minecraft:lava[level=12]",
  "10:13": "minecraft:lava[level=13]",
  "10:14": "minecraft:lava[level=14]",
  "10:15": "minecraft:lava[level=15]",
  "11:0": "minecraft:lava[level=0]",
  "11:1": "minecraft:lava[level=1]",
  "11:2": "minecraft:lava[level=2]",
  "11:3": "minecraft:lava[level=3]",
  "11:4": "minecraft:lava[level=4]",
  "11:5": "minecraft:lava[level=5]",
  "11:6": "minecraft:lava[level=6]",
  "11:7": "minecraft:lava[level=7]",
  "11:8": "minecraft:lava[level=8]",
  "11:9": "minecraft:lava[level=9]",
  "11:10": "minecraft:lava[level=10]",
  "11:11": "minecraft:lava[level=11]",
  "11:12": "minecraft:lava[level=12]",
  "11:13": "minecraft:lava[level=13]",
  "11:14": "minecraft:lava[level=14]",
  "11:15": "minecraft:lava[level=15]",
  "12:0": "minecraft:sand",
  "12:1": "minecraft:red_sand",
  "13:0": "minecraft:gravel",
  "14:0": "minecraft:gold_ore",
  "15:0": "minecraft:iron_ore",
  "16:0": "minecraft:coal_ore",
  "17:0": "minecraft:oak_log[axis=y]",
  "17:1": "minecraft:spruce_log[axis=y]",
  "17:2": "minecraft:birch_log[axis=y]",
  "17:3": "minecraft:jungle_log[axis=y]",
  "17:4": "minecraft:oak_log[axis=x]",
  "17:5": "minecraft:spruce_log[axis=x]",
  "17:6": "minecraft:birch_log[axis=x]",
  "17:7": "minecraft:jungle_log[axis=x]",
  "17:8": "minecraft:oak_log[axis=z]",
  "17:9": "minecraft:spruce_log[axis=z]",
  "17:10": "minecraft:birch_log[axis=z]",
  "17:11": "minecraft:jungle_log[axis=z]",
  "17:12": "minecraft:oak_wood",
  "17:13": "minecraft:spruce_wood",
  "17:14": "minecraft:birch_wood",
  "17:15": "minecraft:jungle_wood",
  "18:0": "minecraft:oak_leaves[persistent=false,distance=1]",
  "18:1": "minecraft:spruce_leaves[persistent=false,distance=1]",
  "18:2": "minecraft:birch_leaves[persistent=false,distance=1]",
  "18:3": "minecraft:jungle_leaves[persistent=false,distance=1]",
  "18:4": "minecraft:oak_leaves[persistent=true,distance=1]",
  "18:5": "minecraft:spruce_leaves[persistent=true,distance=1]",
  "18:6": "minecraft:birch_leaves[persistent=true,distance=1]",
  "18:7": "minecraft:jungle_leaves[persistent=true,distance=1]",
  "18:8": "minecraft:oak_leaves[persistent=false,distance=1]",
  "18:9": "minecraft:spruce_leaves[persistent=false,distance=1]",
  "18:10": "minecraft:birch_leaves[persistent=false,distance=1]",
  "18:11": "minecraft:jungle_leaves[persistent=false,distance=1]",
  "18:12": "minecraft:oak_leaves[persistent=true,distance=1]",
  "18:13": "minecraft:spruce_leaves[persistent=true,distance=1]",
  "18:14": "minecraft:birch_leaves[persistent=true,distance=1]",
  "18:15": "minecraft:jungle_leaves[persistent=true,distance=1]",
  "19:0": "minecraft:sponge",
  "19:1": "minecraft:wet_sponge",
  "20:0": "minecraft:glass",
  "21:0": "minecraft:lapis_ore",
  "22:0": "minecraft:lapis_block",
  "23:0": "minecraft:dispenser[triggered=false,facing=down]",
  "23:1": "minecraft:dispenser[triggered=false,facing=up]",
  "23:2": "minecraft:dispenser[triggered=false,facing=north]",
  "23:3": "minecraft:dispenser[triggered=false,facing=south]",
  "23:4": "minecraft:dispenser[triggered=false,facing=west]",
  "23:5": "minecraft:dispenser[triggered=false,facing=east]",
  "23:8": "minecraft:dispenser[triggered=true,facing=down]",
  "23:9": "minecraft:dispenser[triggered=true,facing=up]",
  "23:10": "minecraft:dispenser[triggered=true,facing=north]",
  "23:11": "minecraft:dispenser[triggered=true,facing=south]",
  "23:12": "minecraft:dispenser[triggered=true,facing=west]",
  "23:13": "minecraft:dispenser[triggered=true,facing=east]",
  "24:0": "minecraft:sandstone",
  "24:1": "minecraft:chiseled_sandstone",
  "24:2": "minecraft:cut_sandstone",
  "25:0": "minecraft:note_block",
  "26:0": "minecraft:red_bed[part=foot,facing=south,occupied=false]",
  "26:1": "minecraft:red_bed[part=foot,facing=west,occupied=false]",
  "26:2": "minecraft:red_bed[part=foot,facing=north,occupied=false]",
  "26:3": "minecraft:red_bed[part=foot,facing=east,occupied=false]",
  "26:4": "minecraft:red_bed[part=foot,facing=south,occupied=true]",
  "26:5": "minecraft:red_bed[part=foot,facing=west,occupied=true]",
  "26:6": "minecraft:red_bed[part=foot,facing=north,occupied=true]",
  "26:7": "minecraft:red_bed[part=foot,facing=east,occupied=true]",
  "26:8": "minecraft:red_bed[part=head,facing=south,occupied=false]",
  "26:9": "minecraft:red_bed[part=head,facing=west,occupied=false]",
  "26:10": "minecraft:red_bed[part=head,facing=north,occupied=false]",
  "26:11": "minecraft:red_bed[part=head,facing=east,occupied=false]",
  "26:12": "minecraft:red_bed[part=head,facing=south,occupied=true]",
  "26:13": "minecraft:red_bed[part=head,facing=west,occupied=true]",
  "26:14": "minecraft:red_bed[part=head,facing=north,occupied=true]",
  "26:15": "minecraft:red_bed[part=head,facing=east,occupied=true]",
  "27:0": "minecraft:powered_rail[shape=north_south,powered=false]",
  "27:1": "minecraft:powered_rail[shape=east_west,powered=false]",
  "27:2": "minecraft:powered_rail[shape=ascending_east,powered=false]",
  "27:3": "minecraft:powered_rail[shape=ascending_west,powered=false]",
  "27:4": "minecraft:powered_rail[shape=ascending_north,powered=false]",
  "27:5": "minecraft:powered_rail[shape=ascending_south,powered=false]",
  "27:8": "minecraft:powered_rail[shape=north_south,powered=true]",
  "27:9": "minecraft:powered_rail[shape=east_west,powered=true]",
  "27:10": "minecraft:powered_rail[shape=ascending_east,powered=true]",
  "27:11": "minecraft:powered_rail[shape=ascending_west,powered=true]",
  "27:12": "minecraft:powered_rail[shape=ascending_north,powered=true]",
  "27:13": "minecraft:powered_rail[shape=ascending_south,powered=true]",
  "28:0": "minecraft:detector_rail[shape=north_south,powered=false]",
  "28:1": "minecraft:detector_rail[shape=east_west,powered=false]",
  "28:2": "minecraft:detector_rail[shape=ascending_east,powered=false]",
  "28:3": "minecraft:detector_rail[shape=ascending_west,powered=false]",
  "28:4": "minecraft:detector_rail[shape=ascending_north,powered=false]",
  "28:5": "minecraft:detector_rail[shape=ascending_south,powered=false]",
  "28:8": "minecraft:detector_rail[shape=north_south,powered=true]",
  "28:9": "minecraft:detector_rail[shape=east_west,powered=true]",
  "28:10": "minecraft:detector_rail[shape=ascending_east,powered=true]",
  "28:11": "minecraft:detector_rail[shape=ascending_west,powered=true]",
  "28:12": "minecraft:detector_rail[shape=ascending_north,powered=true]",
  "28:13": "minecraft:detector_rail[shape=ascending_south,powered=true]",
  "29:0": "minecraft:sticky_piston[facing=down,extended=false]",
  "29:1": "minecraft:sticky_piston[facing=up,extended=false]",
  "29:2": "minecraft:sticky_piston[facing=north,extended=false]",
  "29:3": "minecraft:sticky_piston[facing=south,extended=false]",
  "29:4": "minecraft:sticky_piston[facing=west,extended=false]",
  "29:5": "minecraft:sticky_piston[facing=east,extended=false]",
  "29:8": "minecraft:sticky_piston[facing=down,extended=true]",
  "29:9": "minecraft:sticky_piston[facing=up,extended=true]",
  "29:10": "minecraft:sticky_piston[facing=north,extended=true]",
  "29:11": "minecraft:sticky_piston[facing=south,extended=true]",
  "29:12": "minecraft:sticky_piston[facing=west,extended=true]",
  "29:13": "minecraft:sticky_piston[facing=east,extended=true]",
  "30:0": "minecraft:cobweb",
  "31:0": "minecraft:dead_bush",
  "31:1": "minecraft:grass",
  "31:2": "minecraft:fern",
  "32:0": "minecraft:dead_bush",
  "33:0": "minecraft:piston[facing=down,extended=false]",
  "33:1": "minecraft:piston[facing=up,extended=false]",
  "33:2": "minecraft:piston[facing=north,extended=false]",
  "33:3": "minecraft:piston[facing=south,extended=false]",
  "33:4": "minecraft:piston[facing=west,extended=false]",
  "33:5": "minecraft:piston[facing=east,extended=false]",
  "33:8": "minecraft:piston[facing=down,extended=true]",
  "33:9": "minecraft:piston[facing=up,extended=true]",
  "33:10": "minecraft:piston[facing=north,extended=true]",
  "33:11": "minecraft:piston[facing=south,extended=true]",
  "33:12": "minecraft:piston[facing=west,extended=true]",
  "33:13": "minecraft:piston[facing=east,extended=true]",
  "34:0": "minecraft:piston_head[short=false,facing=down,type=normal]",
  "34:1": "minecraft:piston_head[short=false,facing=up,type=normal]",
  "34:2": "minecraft:piston_head[short=false,facing=north,type=normal]",
  "34:3": "minecraft:piston_head[short=false,facing=south,type=normal]",
  "34:4": "minecraft:piston_head[short=false,facing=west,type=normal]",
  "34:5": "minecraft:piston_head[short=false,facing=east,type=normal]",
  "34:8": "minecraft:piston_head[short=false,facing=down,type=sticky]",
  "34:9": "minecraft:piston_head[short=false,facing=up,type=sticky]",
  "34:10": "minecraft:piston_head[short=false,facing=north,type=sticky]",
  "34:11": "minecraft:piston_head[short=false,facing=south,type=sticky]",
  "34:12": "minecraft:piston_head[short=false,facing=west,type=sticky]",
  "34:13": "minecraft:piston_head[short=false,facing=east,type=sticky]",
  "35:0": "minecraft:white_wool",
  "35:1": "minecraft:orange_wool",
  "35:2": "minecraft:magenta_wool",
  "35:3": "minecraft:light_blue_wool",
  "35:4": "minecraft:yellow_wool",
  "35:5": "minecraft:lime_wool",
  "35:6": "minecraft:pink_wool",
  "35:7": "minecraft:gray_wool",
  "35:8": "minecraft:light_gray_wool",
  "35:9": "minecraft:cyan_wool",
  "35:10": "minecraft:purple_wool",
  "35:11": "minecraft:blue_wool",
  "35:12": "minecraft:brown_wool",
  "35:13": "minecraft:green_wool",
  "35:14": "minecraft:red_wool",
  "35:15": "minecraft:black_wool",
  "36:0": "minecraft:moving_piston[facing=down,type=normal]",
  "36:1": "minecraft:moving_piston[facing=up,type=normal]",
  "36:2": "minecraft:moving_piston[facing=north,type=normal]",
  "36:3": "minecraft:moving_piston[facing=south,type=normal]",
  "36:4": "minecraft:moving_piston[facing=west,type=normal]",
  "36:5": "minecraft:moving_piston[facing=east,type=normal]",
  "36:8": "minecraft:moving_piston[facing=down,type=sticky]",
  "36:9": "minecraft:moving_piston[facing=up,type=sticky]",
  "36:10": "minecraft:moving_piston[facing=north,type=sticky]",
  "36:11": "minecraft:moving_piston[facing=south,type=sticky]",
  "36:12": "minecraft:moving_piston[facing=west,type=sticky]",
  "36:13": "minecraft:moving_piston[facing=east,type=sticky]",
  "37:0": "minecraft:dandelion",
  "38:0": "minecraft:poppy",
  "38:1": "minecraft:blue_orchid",
  "38:2": "minecraft:allium",
  "38:3": "minecraft:azure_bluet",
  "38:4": "minecraft:red_tulip",
  "38:5": "minecraft:orange_tulip",
  "38:6": "minecraft:white_tulip",
  "38:7": "minecraft:pink_tulip",
  "38:8": "minecraft:oxeye_daisy",
  "39:0": "minecraft:brown_mushroom",
  "40:0": "minecraft:red_mushroom",
  "41:0": "minecraft:gold_block",
  "42:0": "minecraft:iron_block",
  "43:0": "minecraft:stone_slab[type=double]",
  "43:1": "minecraft:sandstone_slab[type=double]",
  "43:2": "minecraft:petrified_oak_slab[type=double]",
  "43:3": "minecraft:cobblestone_slab[type=double]",
  "43:4": "minecraft:brick_slab[type=double]",
  "43:5": "minecraft:stone_brick_slab[type=double]",
  "43:6": "minecraft:nether_brick_slab[type=double]",
  "43:7": "minecraft:quartz_slab[type=double]",
  "43:8": "minecraft:smooth_stone",
  "43:9": "minecraft:smooth_sandstone",
  "43:10": "minecraft:petrified_oak_slab[type=double]",
  "43:11": "minecraft:cobblestone_slab[type=double]",
  "43:12": "minecraft:brick_slab[type=double]",
  "43:13": "minecraft:stone_brick_slab[type=double]",
  "43:14": "minecraft:nether_brick_slab[type=double]",
  "43:15": "minecraft:smooth_quartz",
  "44:0": "minecraft:stone_slab[type=bottom]",
  "44:1": "minecraft:sandstone_slab[type=bottom]",
  "44:2": "minecraft:petrified_oak_slab[type=bottom]",
  "44:3": "minecraft:cobblestone_slab[type=bottom]",
  "44:4": "minecraft:brick_slab[type=bottom]",
  "44:5": "minecraft:stone_brick_slab[type=bottom]",
  "44:6": "minecraft:nether_brick_slab[type=bottom]",
  "44:7": "minecraft:quartz_slab[type=bottom]",
  "44:8": "minecraft:stone_slab[type=top]",
  "44:9": "minecraft:sandstone_slab[type=top]",
  "44:10": "minecraft:petrified_oak_slab[type=top]",
  "44:11": "minecraft:cobblestone_slab[type=top]",
  "44:12": "minecraft:brick_slab[type=top]",
  "44:13": "minecraft:stone_brick_slab[type=top]",
  "44:14": "minecraft:nether_brick_slab[type=top]",
  "44:15": "minecraft:quartz_slab[type=top]",
  "45:0": "minecraft:bricks",
  "46:0": "minecraft:tnt[unstable=false]",
  "46:1": "minecraft:tnt[unstable=true]",
  "47:0": "minecraft:bookshelf",
  "48:0": "minecraft:mossy_cobblestone",
  "49:0": "minecraft:obsidian",
  "50:1": "minecraft:wall_torch[facing=east]",
  "50:2": "minecraft:wall_torch[facing=west]",
  "50:3": "minecraft:wall_torch[facing=south]",
  "50:4": "minecraft:wall_torch[facing=north]",
  "50:5": "minecraft:torch",
  "51:0": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=0]",
  "51:1": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=1]",
  "51:2": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=2]",
  "51:3": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=3]",
  "51:4": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=4]",
  "51:5": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=5]",
  "51:6": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=6]",
  "51:7": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=7]",
  "51:8": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=8]",
  "51:9": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=9]",
  "51:10": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=10]",
  "51:11": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=11]",
  "51:12": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=12]",
  "51:13": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=13]",
  "51:14": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=14]",
  "51:15": "minecraft:fire[east=false,south=false,north=false,west=false,up=false,age=15]",
  "52:0": "minecraft:spawner",
  "53:0": "minecraft:oak_stairs[half=bottom,shape=outer_right,facing=east]",
  "53:1": "minecraft:oak_stairs[half=bottom,shape=outer_right,facing=west]",
  "53:2": "minecraft:oak_stairs[half=bottom,shape=outer_right,facing=south]",
  "53:3": "minecraft:oak_stairs[half=bottom,shape=outer_right,facing=north]",
  "53:4": "minecraft:oak_stairs[half=top,shape=outer_right,facing=east]",
  "53:5": "minecraft:oak_stairs[half=top,shape=outer_right,facing=west]",
  "53:6": "minecraft:oak_stairs[half=top,shape=outer_right,facing=south]",
  "53:7": "minecraft:oak_stairs[half=top,shape=outer_right,facing=north]",
  "54:2": "minecraft:chest[facing=north,type=single]",
  "54:3": "minecraft:chest[facing=south,type=single]",
  "54:4": "minecraft:chest[facing=west,type=single]",
  "54:5": "minecraft:chest[facing=east,type=single]",
  "55:0": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=0]",
  "55:1": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=1]",
  "55:2": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=2]",
  "55:3": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=3]",
  "55:4": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=4]",
  "55:5": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=5]",
  "55:6": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=6]",
  "55:7": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=7]",
  "55:8": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=8]",
  "55:9": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=9]",
  "55:10": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=10]",
  "55:11": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=11]",
  "55:12": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=12]",
  "55:13": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=13]",
  "55:14": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=14]",
  "55:15": "minecraft:redstone_wire[east=none,south=none,north=none,west=none,power=15]",
  "56:0": "minecraft:diamond_ore",
  "57:0": "minecraft:diamond_block",
  "58:0": "minecraft:crafting_table",
  "59:0": "minecraft:wheat[age=0]",
  "59:1": "minecraft:wheat[age=1]",
  "59:2": "minecraft:wheat[age=2]",
  "59:3": "minecraft:wheat[age=3]",
  "59:4": "minecraft:wheat[age=4]",
  "59:5": "minecraft:wheat[age=5]",
  "59:6": "minecraft:wheat[age=6]",
  "59:7": "minecraft:wheat[age=7]",
  "60:0": "minecraft:farmland[moisture=0]",
  "60:1": "minecraft:farmland[moisture=1]",
  "60:2": "minecraft:farmland[moisture=2]",
  "60:3": "minecraft:farmland[moisture=3]",
  "60:4": "minecraft:farmland[moisture=4]",
  "60:5": "minecraft:farmland[moisture=5]",
  "60:6": "minecraft:farmland[moisture=6]",
  "60:7": "minecraft:farmland[moisture=7]",
  "61:2": "minecraft:furnace[facing=north,lit=false]",
  "61:3": "minecraft:furnace[facing=south,lit=false]",
  "61:4": "minecraft:furnace[facing=west,lit=false]",
  "61:5": "minecraft:furnace[facing=east,lit=false]",
  "62:2": "minecraft:furnace[facing=north,lit=true]",
  "62:3": "minecraft:furnace[facing=south,lit=true]",
  "62:4": "minecraft:furnace[facing=west,lit=true]",
  "62:5": "minecraft:furnace[facing=east,lit=true]",
  "63:0": "minecraft:sign[rotation=0]",
  "63:1": "minecraft:sign[rotation=1]",
  "63:2": "minecraft:sign[rotation=2]",
  "63:3": "minecraft:sign[rotation=3]",
  "63:4": "minecraft:sign[rotation=4]",
  "63:5": "minecraft:sign[rotation=5]",
  "63:6": "minecraft:sign[rotation=6]",
  "63:7": "minecraft:sign[rotation=7]",
  "63:8": "minecraft:sign[rotation=8]",
  "63:9": "minecraft:sign[rotation=9]",
  "63:10": "minecraft:sign[rotation=10]",
  "63:11": "minecraft:sign[rotation=11]",
  "63:12": "minecraft:sign[rotation=12]",
  "63:13": "minecraft:sign[rotation=13]",
  "63:14": "minecraft:sign[rotation=14]",
  "63:15": "minecraft:sign[rotation=15]",
  "64:0": "minecraft:oak_door[hinge=right,half=lower,powered=false,facing=east,open=false]",
  "64:1": "minecraft:oak_door[hinge=right,half=lower,powered=false,facing=south,open=false]",
  "64:2": "minecraft:oak_door[hinge=right,half=lower,powered=false,facing=west,open=false]",
  "64:3": "minecraft:oak_door[hinge=right,half=lower,powered=false,facing=north,open=false]",
  "64:4": "minecraft:oak_door[hinge=right,half=lower,powered=false,facing=east,open=true]",
  "64:5": "minecraft:oak_door[hinge=right,half=lower,powered=false,facing=south,open=true]",
  "64:6": "minecraft:oak_door[hinge=right,half=lower,powered=false,facing=west,open=true]",
  "64:7": "minecraft:oak_door[hinge=right,half=lower,powered=false,facing=north,open=true]",
  "64:8": "minecraft:oak_door[hinge=left,half=upper,powered=false,facing=east,open=false]",
  "64:9": "minecraft:oak_door[hinge=right,half=upper,powered=false,facing=east,open=false]",
  "64:10": "minecraft:oak_door[hinge=left,half=upper,powered=true,facing=east,open=false]",
  "64:11": "minecraft:oak_door[hinge=right,half=upper,powered=true,facing=east,open=false]",
  "65:2": "minecraft:ladder[facing=north]",
  "65:3": "minecraft:ladder[facing=south]",
  "65:4": "minecraft:ladder[facing=west]",
  "65:5": "minecraft:ladder[facing=east]",
  "66:0": "minecraft:rail[shape=north_south]",
  "66:1": "minecraft:rail[shape=east_west]",
  "66:2": "minecraft:rail[shape=ascending_east]",
  "66:3": "minecraft:rail[shape=ascending_west]",
  "66:4": "minecraft:rail[shape=ascending_north]",
  "66:5": "minecraft:rail[shape=ascending_south]",
  "66:6": "minecraft:rail[shape=south_east]",
  "66:7": "minecraft:rail[shape=south_west]",
  "66:8": "minecraft:rail[shape=north_west]",
  "66:9": "minecraft:rail[shape=north_east]",
  "67:0": "minecraft:cobblestone_stairs[half=bottom,shape=straight,facing=east]",
  "67:1": "minecraft:cobblestone_stairs[half=bottom,shape=straight,facing=west]",
  "67:2": "minecraft:cobblestone_stairs[half=bottom,shape=straight,facing=south]",
  "67:3": "minecraft:cobblestone_stairs[half=bottom,shape=straight,facing=north]",
  "67:4": "minecraft:cobblestone_stairs[half=top,shape=straight,facing=east]",
  "67:5": "minecraft:cobblestone_stairs[half=top,shape=straight,facing=west]",
  "67:6": "minecraft:cobblestone_stairs[half=top,shape=straight,facing=south]",
  "67:7": "minecraft:cobblestone_stairs[half=top,shape=straight,facing=north]",
  "68:2": "minecraft:wall_sign[facing=north]",
  "68:3": "minecraft:wall_sign[facing=south]",
  "68:4": "minecraft:wall_sign[facing=west]",
  "68:5": "minecraft:wall_sign[facing=east]",
  "69:0": "minecraft:lever[powered=false,facing=north,face=ceiling]",
  "69:1": "minecraft:lever[powered=false,facing=east,face=wall]",
  "69:2": "minecraft:lever[powered=false,facing=west,face=wall]",
  "69:3": "minecraft:lever[powered=false,facing=south,face=wall]",
  "69:4": "minecraft:lever[powered=false,facing=north,face=wall]",
  "69:5": "minecraft:lever[powered=false,facing=east,face=floor]",
  "69:6": "minecraft:lever[powered=false,facing=north,face=floor]",
  "69:7": "minecraft:lever[powered=false,facing=east,face=ceiling]",
  "69:8": "minecraft:lever[powered=true,facing=north,face=ceiling]",
  "69:9": "minecraft:lever[powered=true,facing=east,face=wall]",
  "69:10": "minecraft:lever[powered=true,facing=west,face=wall]",
  "69:11": "minecraft:lever[powered=true,facing=south,face=wall]",
  "69:12": "minecraft:lever[powered=true,facing=north,face=wall]",
  "69:13": "minecraft:lever[powered=true,facing=east,face=floor]",
  "69:14": "minecraft:lever[powered=true,facing=north,face=floor]",
  "69:15": "minecraft:lever[powered=true,facing=east,face=ceiling]",
  "70:0": "minecraft:stone_pressure_plate[powered=false]",
  "70:1": "minecraft:stone_pressure_plate[powered=true]",
  "71:0": "minecraft:iron_door[hinge=right,half=lower,powered=false,facing=east,open=false]",
  "71:1": "minecraft:iron_door[hinge=right,half=lower,powered=false,facing=south,open=false]",
  "71:2": "minecraft:iron_door[hinge=right,half=lower,powered=false,facing=west,open=false]",
  "71:3": "minecraft:iron_door[hinge=right,half=lower,powered=false,facing=north,open=false]",
  "71:4": "minecraft:iron_door[hinge=right,half=lower,powered=false,facing=east,open=true]",
  "71:5": "minecraft:iron_door[hinge=right,half=lower,powered=false,facing=south,open=true]",
  "71:6": "minecraft:iron_door[hinge=right,half=lower,powered=false,facing=west,open=true]",
  "71:7": "minecraft:iron_door[hinge=right,half=lower,powered=false,facing=north,open=true]",
  "71:8": "minecraft:iron_door[hinge=left,half=upper,powered=false,facing=east,open=false]",
  "71:9": "minecraft:iron_door[hinge=right,half=upper,powered=false,facing=east,open=false]",
  "71:10": "minecraft:iron_door[hinge=left,half=upper,powered=true,facing=east,open=false]",
  "71:11": "minecraft:iron_door[hinge=right,half=upper,powered=true,facing=east,open=false]",
  "72:0": "minecraft:oak_pressure_plate[powered=false]",
  "72:1": "minecraft:oak_pressure_plate[powered=true]",
  "73:0": "minecraft:redstone_ore[lit=false]",
  "74:0": "minecraft:redstone_ore[lit=true]",
  "75:1": "minecraft:redstone_wall_torch[facing=east,lit=false]",
  "75:2": "minecraft:redstone_wall_torch[facing=west,lit=false]",
  "75:3": "minecraft:redstone_wall_torch[facing=south,lit=false]",
  "75:4": "minecraft:redstone_wall_torch[facing=north,lit=false]",
  "75:5": "minecraft:redstone_torch[lit=false]",
  "76:1": "minecraft:redstone_wall_torch[facing=east,lit=true]",
  "76:2": "minecraft:redstone_wall_torch[facing=west,lit=true]",
  "76:3": "minecraft:redstone_wall_torch[facing=south,lit=true]",
  "76:4": "minecraft:redstone_wall_torch[facing=north,lit=true]",
  "76:5": "minecraft:redstone_torch[lit=true]",
  "77:0": "minecraft:stone_button[powered=false,facing=east,face=ceiling]",
  "77:1": "minecraft:stone_button[powered=false,facing=east,face=wall]",
  "77:2": "minecraft:stone_button[powered=false,facing=west,face=wall]",
  "77:3": "minecraft:stone_button[powered=false,facing=south,face=wall]",
  "77:4": "minecraft:stone_button[powered=false,facing=north,face=wall]",
  "77:5": "minecraft:stone_button[powered=false,facing=east,face=floor]",
  "77:8": "minecraft:stone_button[powered=true,facing=south,face=ceiling]",
  "77:9": "minecraft:stone_button[powered=true,facing=east,face=wall]",
  "77:10": "minecraft:stone_button[powered=true,facing=west,face=wall]",
  "77:11": "minecraft:stone_button[powered=true,facing=south,face=wall]",
  "77:12": "minecraft:stone_button[powered=true,facing=north,face=wall]",
  "77:13": "minecraft:stone_button[powered=true,facing=south,face=floor]",
  "78:0": "minecraft:snow[layers=1]",
  "78:1": "minecraft:snow[layers=2]",
  "78:2": "minecraft:snow[layers=3]",
  "78:3": "minecraft:snow[layers=4]",
  "78:4": "minecraft:snow[layers=5]",
  "78:5": "minecraft:snow[layers=6]",
  "78:6": "minecraft:snow[layers=7]",
  "78:7": "minecraft:snow[layers=8]",
  "79:0": "minecraft:ice",
  "80:0": "minecraft:snow_block",
  "81:0": "minecraft:cactus[age=0]",
  "81:1": "minecraft:cactus[age=1]",
  "81:2": "minecraft:cactus[age=2]",
  "81:3": "minecraft:cactus[age=3]",
  "81:4": "minecraft:cactus[age=4]",
  "81:5": "minecraft:cactus[age=5]",
  "81:6": "minecraft:cactus[age=6]",
  "81:7": "minecraft:cactus[age=7]",
  "81:8": "minecraft:cactus[age=8]",
  "81:9": "minecraft:cactus[age=9]",
  "81:10": "minecraft:cactus[age=10]",
  "81:11": "minecraft:cactus[age=11]",
  "81:12": "minecraft:cactus[age=12]",
  "81:13": "minecraft:cactus[age=13]",
  "81:14": "minecraft:cactus[age=14]",
  "81:15": "minecraft:cactus[age=15]",
  "82:0": "minecraft:clay",
  "83:0": "minecraft:sugar_cane[age=0]",
  "83:1": "minecraft:sugar_cane[age=1]",
  "83:2": "minecraft:sugar_cane[age=2]",
  "83:3": "minecraft:sugar_cane[age=3]",
  "83:4": "minecraft:sugar_cane[age=4]",
  "83:5": "minecraft:sugar_cane[age=5]",
  "83:6": "minecraft:sugar_cane[age=6]",
  "83:7": "minecraft:sugar_cane[age=7]",
  "83:8": "minecraft:sugar_cane[age=8]",
  "83:9": "minecraft:sugar_cane[age=9]",
  "83:10": "minecraft:sugar_cane[age=10]",
  "83:11": "minecraft:sugar_cane[age=11]",
  "83:12": "minecraft:sugar_cane[age=12]",
  "83:13": "minecraft:sugar_cane[age=13]",
  "83:14": "minecraft:sugar_cane[age=14]",
  "83:15": "minecraft:sugar_cane[age=15]",
  "84:0": "minecraft:jukebox[has_record=false]",
  "84:1": "minecraft:jukebox[has_record=true]",
  "85:0": "minecraft:oak_fence[east=false,south=false,north=false,west=false]",
  "86:0": "minecraft:carved_pumpkin[facing=south]",
  "86:1": "minecraft:carved_pumpkin[facing=west]",
  "86:2": "minecraft:carved_pumpkin[facing=north]",
  "86:3": "minecraft:carved_pumpkin[facing=east]",
  "87:0": "minecraft:netherrack",
  "88:0": "minecraft:soul_sand",
  "89:0": "minecraft:glowstone",
  "90:1": "minecraft:nether_portal[axis=x]",
  "90:2": "minecraft:nether_portal[axis=z]",
  "91:0": "minecraft:jack_o_lantern[facing=south]",
  "91:1": "minecraft:jack_o_lantern[facing=west]",
  "91:2": "minecraft:jack_o_lantern[facing=north]",
  "91:3": "minecraft:jack_o_lantern[facing=east]",
  "92:0": "minecraft:cake[bites=0]",
  "92:1": "minecraft:cake[bites=1]",
  "92:2": "minecraft:cake[bites=2]",
  "92:3": "minecraft:cake[bites=3]",
  "92:4": "minecraft:cake[bites=4]",
  "92:5": "minecraft:cake[bites=5]",
  "92:6": "minecraft:cake[bites=6]",
  "93:0": "minecraft:repeater[delay=1,facing=south,locked=false,powered=false]",
  "93:1": "minecraft:repeater[delay=1,facing=west,locked=false,powered=false]",
  "93:2": "minecraft:repeater[delay=1,facing=north,locked=false,powered=false]",
  "93:3": "minecraft:repeater[delay=1,facing=east,locked=false,powered=false]",
  "93:4": "minecraft:repeater[delay=2,facing=south,locked=false,powered=false]",
  "93:5": "minecraft:repeater[delay=2,facing=west,locked=false,powered=false]",
  "93:6": "minecraft:repeater[delay=2,facing=north,locked=false,powered=false]",
  "93:7": "minecraft:repeater[delay=2,facing=east,locked=false,powered=false]",
  "93:8": "minecraft:repeater[delay=3,facing=south,locked=false,powered=false]",
  "93:9": "minecraft:repeater[delay=3,facing=west,locked=false,powered=false]",
  "93:10": "minecraft:repeater[delay=3,facing=north,locked=false,powered=false]",
  "93:11": "minecraft:repeater[delay=3,facing=east,locked=false,powered=false]",
  "93:12": "minecraft:repeater[delay=4,facing=south,locked=false,powered=false]",
  "93:13": "minecraft:repeater[delay=4,facing=west,locked=false,powered=false]",
  "93:14": "minecraft:repeater[delay=4,facing=north,locked=false,powered=false]",
  "93:15": "minecraft:repeater[delay=4,facing=east,locked=false,powered=false]",
  "94:0": "minecraft:repeater[delay=1,facing=south,locked=false,powered=true]",
  "94:1": "minecraft:repeater[delay=1,facing=west,locked=false,powered=true]",
  "94:2": "minecraft:repeater[delay=1,facing=north,locked=false,powered=true]",
  "94:3": "minecraft:repeater[delay=1,facing=east,locked=false,powered=true]",
  "94:4": "minecraft:repeater[delay=2,facing=south,locked=false,powered=true]",
  "94:5": "minecraft:repeater[delay=2,facing=west,locked=false,powered=true]",
  "94:6": "minecraft:repeater[delay=2,facing=north,locked=false,powered=true]",
  "94:7": "minecraft:repeater[delay=2,facing=east,locked=false,powered=true]",
  "94:8": "minecraft:repeater[delay=3,facing=south,locked=false,powered=true]",
  "94:9": "minecraft:repeater[delay=3,facing=west,locked=false,powered=true]",
  "94:10": "minecraft:repeater[delay=3,facing=north,locked=false,powered=true]",
  "94:11": "minecraft:repeater[delay=3,facing=east,locked=false,powered=true]",
  "94:12": "minecraft:repeater[delay=4,facing=south,locked=false,powered=true]",
  "94:13": "minecraft:repeater[delay=4,facing=west,locked=false,powered=true]",
  "94:14": "minecraft:repeater[delay=4,facing=north,locked=false,powered=true]",
  "94:15": "minecraft:repeater[delay=4,facing=east,locked=false,powered=true]",
  "95:0": "minecraft:white_stained_glass",
  "95:1": "minecraft:orange_stained_glass",
  "95:2": "minecraft:magenta_stained_glass",
  "95:3": "minecraft:light_blue_stained_glass",
  "95:4": "minecraft:yellow_stained_glass",
  "95:5": "minecraft:lime_stained_glass",
  "95:6": "minecraft:pink_stained_glass",
  "95:7": "minecraft:gray_stained_glass",
  "95:8": "minecraft:light_gray_stained_glass",
  "95:9": "minecraft:cyan_stained_glass",
  "95:10": "minecraft:purple_stained_glass",
  "95:11": "minecraft:blue_stained_glass",
  "95:12": "minecraft:brown_stained_glass",
  "95:13": "minecraft:green_stained_glass",
  "95:14": "minecraft:red_stained_glass",
  "95:15": "minecraft:black_stained_glass",
  "96:0": "minecraft:oak_trapdoor[half=bottom,facing=north,open=false,powered=false]",
  "96:1": "minecraft:oak_trapdoor[half=bottom,facing=south,open=false,powered=false]",
  "96:2": "minecraft:oak_trapdoor[half=bottom,facing=west,open=false,powered=false]",
  "96:3": "minecraft:oak_trapdoor[half=bottom,facing=east,open=false,powered=false]",
  "96:4": "minecraft:oak_trapdoor[half=bottom,facing=north,open=true,powered=true]",
  "96:5": "minecraft:oak_trapdoor[half=bottom,facing=south,open=true,powered=true]",
  "96:6": "minecraft:oak_trapdoor[half=bottom,facing=west,open=true,powered=true]",
  "96:7": "minecraft:oak_trapdoor[half=bottom,facing=east,open=true,powered=true]",
  "96:8": "minecraft:oak_trapdoor[half=top,facing=north,open=false,powered=false]",
  "96:9": "minecraft:oak_trapdoor[half=top,facing=south,open=false,powered=false]",
  "96:10": "minecraft:oak_trapdoor[half=top,facing=west,open=false,powered=false]",
  "96:11": "minecraft:oak_trapdoor[half=top,facing=east,open=false,powered=false]",
  "96:12": "minecraft:oak_trapdoor[half=top,facing=north,open=true,powered=true]",
  "96:13": "minecraft:oak_trapdoor[half=top,facing=south,open=true,powered=true]",
  "96:14": "minecraft:oak_trapdoor[half=top,facing=west,open=true,powered=true]",
  "96:15": "minecraft:oak_trapdoor[half=top,facing=east,open=true,powered=true]",
  "97:0": "minecraft:infested_stone",
  "97:1": "minecraft:infested_cobblestone",
  "97:2": "minecraft:infested_stone_bricks",
  "97:3": "minecraft:infested_mossy_stone_bricks",
  "97:4": "minecraft:infested_cracked_stone_bricks",
  "97:5": "minecraft:infested_chiseled_stone_bricks",
  "98:0": "minecraft:stone_bricks",
  "98:1": "minecraft:mossy_stone_bricks",
  "98:2": "minecraft:cracked_stone_bricks",
  "98:3": "minecraft:chiseled_stone_bricks",
  "99:0": "minecraft:brown_mushroom_block[north=false,east=false,south=false,west=false,up=false,down=false]",
  "99:1": "minecraft:brown_mushroom_block[north=true,east=false,south=false,west=true,up=true,down=false]",
  "99:2": "minecraft:brown_mushroom_block[north=true,east=false,south=false,west=false,up=true,down=false]",
  "99:3": "minecraft:brown_mushroom_block[north=true,east=true,south=false,west=false,up=true,down=false]",
  "99:4": "minecraft:brown_mushroom_block[north=false,east=false,south=false,west=true,up=true,down=false]",
  "99:5": "minecraft:brown_mushroom_block[north=false,east=false,south=false,west=false,up=true,down=false]",
  "99:6": "minecraft:brown_mushroom_block[north=false,east=true,south=false,west=false,up=true,down=false]",
  "99:7": "minecraft:brown_mushroom_block[north=false,east=false,south=true,west=true,up=true,down=false]",
  "99:8": "minecraft:brown_mushroom_block[north=false,east=false,south=true,west=false,up=true,down=false]",
  "99:9": "minecraft:brown_mushroom_block[north=false,east=true,south=true,west=false,up=true,down=false]",
  "99:10": "minecraft:mushroom_stem[north=true,east=true,south=true,west=true,up=false,down=false]",
  "99:14": "minecraft:brown_mushroom_block[north=true,east=true,south=true,west=true,up=true,down=true]",
  "99:15": "minecraft:mushroom_stem[north=true,east=true,south=true,west=true,up=true,down=true]",
  "100:0": "minecraft:red_mushroom_block[north=false,east=false,south=false,west=false,up=false,down=false]",
  "100:1": "minecraft:red_mushroom_block[north=true,east=false,south=false,west=true,up=true,down=false]",
  "100:2": "minecraft:red_mushroom_block[north=true,east=false,south=false,west=false,up=true,down=false]",
  "100:3": "minecraft:red_mushroom_block[north=true,east=true,south=false,west=false,up=true,down=false]",
  "100:4": "minecraft:red_mushroom_block[north=false,east=false,south=false,west=true,up=true,down=false]",
  "100:5": "minecraft:red_mushroom_block[north=false,east=false,south=false,west=false,up=true,down=false]",
  "100:6": "minecraft:red_mushroom_block[north=false,east=true,south=false,west=false,up=true,down=false]",
  "100:7": "minecraft:red_mushroom_block[north=false,east=false,south=true,west=true,up=true,down=false]",
  "100:8": "minecraft:red_mushroom_block[north=false,east=false,south=true,west=false,up=true,down=false]",
  "100:9": "minecraft:red_mushroom_block[north=false,east=true,south=true,west=false,up=true,down=false]",
  "100:10": "minecraft:mushroom_stem[north=true,east=true,south=true,west=true,up=false,down=false]",
  "100:14": "minecraft:red_mushroom_block[north=true,east=true,south=true,west=true,up=true,down=true]",
  "100:15": "minecraft:mushroom_stem[north=true,east=true,south=true,west=true,up=true,down=true]",
  "101:0": "minecraft:iron_bars[east=false,south=false,north=false,west=false]",
  "102:0": "minecraft:glass_pane[east=false,south=false,north=false,west=false]",
  "103:0": "minecraft:melon",
  "104:0": "minecraft:pumpkin_stem[age=0]",
  "104:1": "minecraft:pumpkin_stem[age=1]",
  "104:2": "minecraft:pumpkin_stem[age=2]",
  "104:3": "minecraft:pumpkin_stem[age=3]",
  "104:4": "minecraft:pumpkin_stem[age=4]",
  "104:5": "minecraft:pumpkin_stem[age=5]",
  "104:6": "minecraft:pumpkin_stem[age=6]",
  "104:7": "minecraft:pumpkin_stem[age=7]",
  "105:0": "minecraft:melon_stem[age=0]",
  "105:1": "minecraft:melon_stem[age=1]",
  "105:2": "minecraft:melon_stem[age=2]",
  "105:3": "minecraft:melon_stem[age=3]",
  "105:4": "minecraft:melon_stem[age=4]",
  "105:5": "minecraft:melon_stem[age=5]",
  "105:6": "minecraft:melon_stem[age=6]",
  "105:7": "minecraft:melon_stem[age=7]",
  "106:0": "minecraft:vine[east=false,south=false,north=false,west=false,up=false]",
  "106:1": "minecraft:vine[east=false,south=true,north=false,west=false,up=false]",
  "106:2": "minecraft:vine[east=false,south=false,north=false,west=true,up=false]",
  "106:3": "minecraft:vine[east=false,south=true,north=false,west=true,up=false]",
  "106:4": "minecraft:vine[east=false,south=false,north=true,west=false,up=false]",
  "106:5": "minecraft:vine[east=false,south=true,north=true,west=false,up=false]",
  "106:6": "minecraft:vine[east=false,south=false,north=true,west=true,up=false]",
  "106:7": "minecraft:vine[east=false,south=true,north=true,west=true,up=false]",
  "106:8": "minecraft:vine[east=true,south=false,north=false,west=false,up=false]",
  "106:9": "minecraft:vine[east=true,south=true,north=false,west=false,up=false]",
  "106:10": "minecraft:vine[east=true,south=false,north=false,west=true,up=false]",
  "106:11": "minecraft:vine[east=true,south=true,north=false,west=true,up=false]",
  "106:12": "minecraft:vine[east=true,south=false,north=true,west=false,up=false]",
  "106:13": "minecraft:vine[east=true,south=true,north=true,west=false,up=false]",
  "106:14": "minecraft:vine[east=true,south=false,north=true,west=true,up=false]",
  "106:15": "minecraft:vine[east=true,south=true,north=true,west=true,up=false]",
  "107:0": "minecraft:oak_fence_gate[in_wall=false,powered=false,facing=south,open=false]",
  "107:1": "minecraft:oak_fence_gate[in_wall=false,powered=false,facing=west,open=false]",
  "107:2": "minecraft:oak_fence_gate[in_wall=false,powered=false,facing=north,open=false]",
  "107:3": "minecraft:oak_fence_gate[in_wall=false,powered=false,facing=east,open=false]",
  "107:4": "minecraft:oak_fence_gate[in_wall=false,powered=false,facing=south,open=true]",
  "107:5": "minecraft:oak_fence_gate[in_wall=false,powered=false,facing=west,open=true]",
  "107:6": "minecraft:oak_fence_gate[in_wall=false,powered=false,facing=north,open=true]",
  "107:7": "minecraft:oak_fence_gate[in_wall=false,powered=false,facing=east,open=true]",
  "107:8": "minecraft:oak_fence_gate[in_wall=false,powered=true,facing=south,open=false]",
  "107:9": "minecraft:oak_fence_gate[in_wall=false,powered=true,facing=west,open=false]",
  "107:10": "minecraft:oak_fence_gate[in_wall=false,powered=true,facing=north,open=false]",
  "107:11": "minecraft:oak_fence_gate[in_wall=false,powered=true,facing=east,open=false]",
  "107:12": "minecraft:oak_fence_gate[in_wall=false,powered=true,facing=south,open=true]",
  "107:13": "minecraft:oak_fence_gate[in_wall=false,powered=true,facing=west,open=true]",
  "107:14": "minecraft:oak_fence_gate[in_wall=false,powered=true,facing=north,open=true]",
  "107:15": "minecraft:oak_fence_gate[in_wall=false,powered=true,facing=east,open=true]",
  "108:0": "minecraft:brick_stairs[half=bottom,shape=straight,facing=east]",
  "108:1": "minecraft:brick_stairs[half=bottom,shape=straight,facing=west]",
  "108:2": "minecraft:brick_stairs[half=bottom,shape=straight,facing=south]",
  "108:3": "minecraft:brick_stairs[half=bottom,shape=straight,facing=north]",
  "108:4": "minecraft:brick_stairs[half=top,shape=straight,facing=east]",
  "108:5": "minecraft:brick_stairs[half=top,shape=straight,facing=west]",
  "108:6": "minecraft:brick_stairs[half=top,shape=straight,facing=south]",
  "108:7": "minecraft:brick_stairs[half=top,shape=straight,facing=north]",
  "109:0": "minecraft:stone_brick_stairs[half=bottom,shape=straight,facing=east]",
  "109:1": "minecraft:stone_brick_stairs[half=bottom,shape=straight,facing=west]",
  "109:2": "minecraft:stone_brick_stairs[half=bottom,shape=straight,facing=south]",
  "109:3": "minecraft:stone_brick_stairs[half=bottom,shape=straight,facing=north]",
  "109:4": "minecraft:stone_brick_stairs[half=top,shape=straight,facing=east]",
  "109:5": "minecraft:stone_brick_stairs[half=top,shape=straight,facing=west]",
  "109:6": "minecraft:stone_brick_stairs[half=top,shape=straight,facing=south]",
  "109:7": "minecraft:stone_brick_stairs[half=top,shape=straight,facing=north]",
  "110:0": "minecraft:mycelium[snowy=false]",
  "111:0": "minecraft:lily_pad",
  "112:0": "minecraft:nether_bricks",
  "113:0": "minecraft:nether_brick_fence[east=false,south=false,north=false,west=false]",
  "114:0": "minecraft:nether_brick_stairs[half=bottom,shape=straight,facing=east]",
  "114:1": "minecraft:nether_brick_stairs[half=bottom,shape=straight,facing=west]",
  "114:2": "minecraft:nether_brick_stairs[half=bottom,shape=straight,facing=south]",
  "114:3": "minecraft:nether_brick_stairs[half=bottom,shape=straight,facing=north]",
  "114:4": "minecraft:nether_brick_stairs[half=top,shape=straight,facing=east]",
  "114:5": "minecraft:nether_brick_stairs[half=top,shape=straight,facing=west]",
  "114:6": "minecraft:nether_brick_stairs[half=top,shape=straight,facing=south]",
  "114:7": "minecraft:nether_brick_stairs[half=top,shape=straight,facing=north]",
  "115:0": "minecraft:nether_wart[age=0]",
  "115:1": "minecraft:nether_wart[age=1]",
  "115:2": "minecraft:nether_wart[age=2]",
  "115:3": "minecraft:nether_wart[age=3]",
  "116:0": "minecraft:enchanting_table",
  "117:0": "minecraft:brewing_stand[has_bottle_0=false,has_bottle_1=false,has_bottle_2=false]",
  "117:1": "minecraft:brewing_stand[has_bottle_0=true,has_bottle_1=false,has_bottle_2=false]",
  "117:2": "minecraft:brewing_stand[has_bottle_0=false,has_bottle_1=true,has_bottle_2=false]",
  "117:3": "minecraft:brewing_stand[has_bottle_0=true,has_bottle_1=true,has_bottle_2=false]",
  "117:4": "minecraft:brewing_stand[has_bottle_0=false,has_bottle_1=false,has_bottle_2=true]",
  "117:5": "minecraft:brewing_stand[has_bottle_0=true,has_bottle_1=false,has_bottle_2=true]",
  "117:6": "minecraft:brewing_stand[has_bottle_0=false,has_bottle_1=true,has_bottle_2=true]",
  "117:7": "minecraft:brewing_stand[has_bottle_0=true,has_bottle_1=true,has_bottle_2=true]",
  "118:0": "minecraft:cauldron[level=0]",
  "118:1": "minecraft:cauldron[level=1]",
  "118:2": "minecraft:cauldron[level=2]",
  "118:3": "minecraft:cauldron[level=3]",
  "119:0": "minecraft:end_portal",
  "120:0": "minecraft:end_portal_frame[eye=false,facing=south]",
  "120:1": "minecraft:end_portal_frame[eye=false,facing=west]",
  "120:2": "minecraft:end_portal_frame[eye=false,facing=north]",
  "120:3": "minecraft:end_portal_frame[eye=false,facing=east]",
  "120:4": "minecraft:end_portal_frame[eye=true,facing=south]",
  "120:5": "minecraft:end_portal_frame[eye=true,facing=west]",
  "120:6": "minecraft:end_portal_frame[eye=true,facing=north]",
  "120:7": "minecraft:end_portal_frame[eye=true,facing=east]",
  "121:0": "minecraft:end_stone",
  "122:0": "minecraft:dragon_egg",
  "123:0": "minecraft:redstone_lamp[lit=false]",
  "124:0": "minecraft:redstone_lamp[lit=true]",
  "125:0": "minecraft:oak_slab[type=double]",
  "125:1": "minecraft:spruce_slab[type=double]",
  "125:2": "minecraft:birch_slab[type=double]",
  "125:3": "minecraft:jungle_slab[type=double]",
  "125:4": "minecraft:acacia_slab[type=double]",
  "125:5": "minecraft:dark_oak_slab[type=double]",
  "126:0": "minecraft:oak_slab[type=bottom]",
  "126:1": "minecraft:spruce_slab[type=bottom]",
  "126:2": "minecraft:birch_slab[type=bottom]",
  "126:3": "minecraft:jungle_slab[type=bottom]",
  "126:4": "minecraft:acacia_slab[type=bottom]",
  "126:5": "minecraft:dark_oak_slab[type=bottom]",
  "126:8": "minecraft:oak_slab[type=top]",
  "126:9": "minecraft:spruce_slab[type=top]",
  "126:10": "minecraft:birch_slab[type=top]",
  "126:11": "minecraft:jungle_slab[type=top]",
  "126:12": "minecraft:acacia_slab[type=top]",
  "126:13": "minecraft:dark_oak_slab[type=top]",
  "127:0": "minecraft:cocoa[facing=south,age=0]",
  "127:1": "minecraft:cocoa[facing=west,age=0]",
  "127:2": "minecraft:cocoa[facing=north,age=0]",
  "127:3": "minecraft:cocoa[facing=east,age=0]",
  "127:4": "minecraft:cocoa[facing=south,age=1]",
  "127:5": "minecraft:cocoa[facing=west,age=1]",
  "127:6": "minecraft:cocoa[facing=north,age=1]",
  "127:7": "minecraft:cocoa[facing=east,age=1]",
  "127:8": "minecraft:cocoa[facing=south,age=2]",
  "127:9": "minecraft:cocoa[facing=west,age=2]",
  "127:10": "minecraft:cocoa[facing=north,age=2]",
  "127:11": "minecraft:cocoa[facing=east,age=2]",
  "128:0": "minecraft:sandstone_stairs[half=bottom,shape=straight,facing=east]",
  "128:1": "minecraft:sandstone_stairs[half=bottom,shape=straight,facing=west]",
  "128:2": "minecraft:sandstone_stairs[half=bottom,shape=straight,facing=south]",
  "128:3": "minecraft:sandstone_stairs[half=bottom,shape=straight,facing=north]",
  "128:4": "minecraft:sandstone_stairs[half=top,shape=straight,facing=east]",
  "128:5": "minecraft:sandstone_stairs[half=top,shape=straight,facing=west]",
  "128:6": "minecraft:sandstone_stairs[half=top,shape=straight,facing=south]",
  "128:7": "minecraft:sandstone_stairs[half=top,shape=straight,facing=north]",
  "129:0": "minecraft:emerald_ore",
  "130:2": "minecraft:ender_chest[facing=north]",
  "130:3": "minecraft:ender_chest[facing=south]",
  "130:4": "minecraft:ender_chest[facing=west]",
  "130:5": "minecraft:ender_chest[facing=east]",
  "131:0": "minecraft:tripwire_hook[powered=false,attached=false,facing=south]",
  "131:1": "minecraft:tripwire_hook[powered=false,attached=false,facing=west]",
  "131:2": "minecraft:tripwire_hook[powered=false,attached=false,facing=north]",
  "131:3": "minecraft:tripwire_hook[powered=false,attached=false,facing=east]",
  "131:4": "minecraft:tripwire_hook[powered=false,attached=true,facing=south]",
  "131:5": "minecraft:tripwire_hook[powered=false,attached=true,facing=west]",
  "131:6": "minecraft:tripwire_hook[powered=false,attached=true,facing=north]",
  "131:7": "minecraft:tripwire_hook[powered=false,attached=true,facing=east]",
  "131:8": "minecraft:tripwire_hook[powered=true,attached=false,facing=south]",
  "131:9": "minecraft:tripwire_hook[powered=true,attached=false,facing=west]",
  "131:10": "minecraft:tripwire_hook[powered=true,attached=false,facing=north]",
  "131:11": "minecraft:tripwire_hook[powered=true,attached=false,facing=east]",
  "131:12": "minecraft:tripwire_hook[powered=true,attached=true,facing=south]",
  "131:13": "minecraft:tripwire_hook[powered=true,attached=true,facing=west]",
  "131:14": "minecraft:tripwire_hook[powered=true,attached=true,facing=north]",
  "131:15": "minecraft:tripwire_hook[powered=true,attached=true,facing=east]",
  "132:0": "minecraft:tripwire[disarmed=false,east=false,powered=false,south=false,north=false,west=false,attached=false]",
  "132:1": "minecraft:tripwire[disarmed=false,east=false,powered=true,south=false,north=false,west=false,attached=false]",
  "132:4": "minecraft:tripwire[disarmed=false,east=false,powered=false,south=false,north=false,west=false,attached=true]",
  "132:5": "minecraft:tripwire[disarmed=false,east=false,powered=true,south=false,north=false,west=false,attached=true]",
  "132:8": "minecraft:tripwire[disarmed=true,east=false,powered=false,south=false,north=false,west=false,attached=false]",
  "132:9": "minecraft:tripwire[disarmed=true,east=false,powered=true,south=false,north=false,west=false,attached=false]",
  "132:12": "minecraft:tripwire[disarmed=true,east=false,powered=false,south=false,north=false,west=false,attached=true]",
  "132:13": "minecraft:tripwire[disarmed=true,east=false,powered=true,south=false,north=false,west=false,attached=true]",
  "133:0": "minecraft:emerald_block",
  "134:0": "minecraft:spruce_stairs[half=bottom,shape=straight,facing=east]",
  "134:1": "minecraft:spruce_stairs[half=bottom,shape=straight,facing=west]",
  "134:2": "minecraft:spruce_stairs[half=bottom,shape=straight,facing=south]",
  "134:3": "minecraft:spruce_stairs[half=bottom,shape=straight,facing=north]",
  "134:4": "minecraft:spruce_stairs[half=top,shape=straight,facing=east]",
  "134:5": "minecraft:spruce_stairs[half=top,shape=straight,facing=west]",
  "134:6": "minecraft:spruce_stairs[half=top,shape=straight,facing=south]",
  "134:7": "minecraft:spruce_stairs[half=top,shape=straight,facing=north]",
  "135:0": "minecraft:birch_stairs[half=bottom,shape=straight,facing=east]",
  "135:1": "minecraft:birch_stairs[half=bottom,shape=straight,facing=west]",
  "135:2": "minecraft:birch_stairs[half=bottom,shape=straight,facing=south]",
  "135:3": "minecraft:birch_stairs[half=bottom,shape=straight,facing=north]",
  "135:4": "minecraft:birch_stairs[half=top,shape=straight,facing=east]",
  "135:5": "minecraft:birch_stairs[half=top,shape=straight,facing=west]",
  "135:6": "minecraft:birch_stairs[half=top,shape=straight,facing=south]",
  "135:7": "minecraft:birch_stairs[half=top,shape=straight,facing=north]",
  "136:0": "minecraft:jungle_stairs[half=bottom,shape=straight,facing=east]",
  "136:1": "minecraft:jungle_stairs[half=bottom,shape=straight,facing=west]",
  "136:2": "minecraft:jungle_stairs[half=bottom,shape=straight,facing=south]",
  "136:3": "minecraft:jungle_stairs[half=bottom,shape=straight,facing=north]",
  "136:4": "minecraft:jungle_stairs[half=top,shape=straight,facing=east]",
  "136:5": "minecraft:jungle_stairs[half=top,shape=straight,facing=west]",
  "136:6": "minecraft:jungle_stairs[half=top,shape=straight,facing=south]",
  "136:7": "minecraft:jungle_stairs[half=top,shape=straight,facing=north]",
  "137:0": "minecraft:command_block[conditional=false,facing=down]",
  "137:1": "minecraft:command_block[conditional=false,facing=up]",
  "137:2": "minecraft:command_block[conditional=false,facing=north]",
  "137:3": "minecraft:command_block[conditional=false,facing=south]",
  "137:4": "minecraft:command_block[conditional=false,facing=west]",
  "137:5": "minecraft:command_block[conditional=false,facing=east]",
  "137:8": "minecraft:command_block[conditional=true,facing=down]",
  "137:9": "minecraft:command_block[conditional=true,facing=up]",
  "137:10": "minecraft:command_block[conditional=true,facing=north]",
  "137:11": "minecraft:command_block[conditional=true,facing=south]",
  "137:12": "minecraft:command_block[conditional=true,facing=west]",
  "137:13": "minecraft:command_block[conditional=true,facing=east]",
  "138:0": "minecraft:beacon",
  "139:0": "minecraft:cobblestone_wall[east=false,south=false,north=false,west=false,up=false]",
  "139:1": "minecraft:mossy_cobblestone_wall[east=false,south=false,north=false,west=false,up=false]",
  "140:0": "minecraft:flower_pot",
  "140:1": "minecraft:potted_poppy",
  "140:2": "minecraft:potted_dandelion",
  "140:3": "minecraft:potted_oak_sapling",
  "140:4": "minecraft:potted_spruce_sapling",
  "140:5": "minecraft:potted_birch_sapling",
  "140:6": "minecraft:potted_jungle_sapling",
  "140:7": "minecraft:potted_red_mushroom",
  "140:8": "minecraft:potted_brown_mushroom",
  "140:9": "minecraft:potted_cactus",
  "140:10": "minecraft:potted_dead_bush",
  "140:11": "minecraft:potted_fern",
  "140:12": "minecraft:potted_acacia_sapling",
  "140:13": "minecraft:potted_dark_oak_sapling",
  "140:14": "minecraft:potted_blue_orchid",
  "140:15": "minecraft:potted_allium",
  "141:0": "minecraft:carrots[age=0]",
  "141:1": "minecraft:carrots[age=1]",
  "141:2": "minecraft:carrots[age=2]",
  "141:3": "minecraft:carrots[age=3]",
  "141:4": "minecraft:carrots[age=4]",
  "141:5": "minecraft:carrots[age=5]",
  "141:6": "minecraft:carrots[age=6]",
  "141:7": "minecraft:carrots[age=7]",
  "142:0": "minecraft:potatoes[age=0]",
  "142:1": "minecraft:potatoes[age=1]",
  "142:2": "minecraft:potatoes[age=2]",
  "142:3": "minecraft:potatoes[age=3]",
  "142:4": "minecraft:potatoes[age=4]",
  "142:5": "minecraft:potatoes[age=5]",
  "142:6": "minecraft:potatoes[age=6]",
  "142:7": "minecraft:potatoes[age=7]",
  "143:0": "minecraft:oak_button[powered=false,facing=east,face=ceiling]",
  "143:1": "minecraft:oak_button[powered=false,facing=east,face=wall]",
  "143:2": "minecraft:oak_button[powered=false,facing=west,face=wall]",
  "143:3": "minecraft:oak_button[powered=false,facing=south,face=wall]",
  "143:4": "minecraft:oak_button[powered=false,facing=north,face=wall]",
  "143:5": "minecraft:oak_button[powered=false,facing=east,face=floor]",
  "143:8": "minecraft:oak_button[powered=true,facing=south,face=ceiling]",
  "143:9": "minecraft:oak_button[powered=true,facing=east,face=wall]",
  "143:10": "minecraft:oak_button[powered=true,facing=west,face=wall]",
  "143:11": "minecraft:oak_button[powered=true,facing=south,face=wall]",
  "143:12": "minecraft:oak_button[powered=true,facing=north,face=wall]",
  "143:13": "minecraft:oak_button[powered=true,facing=south,face=floor]",
  "144:0": "minecraft:skeleton_skull[rotation=0]",
  "144:1": "minecraft:skeleton_skull[rotation=4]",
  "144:2": "minecraft:skeleton_wall_skull[facing=north]",
  "144:3": "minecraft:skeleton_wall_skull[facing=south]",
  "144:4": "minecraft:skeleton_wall_skull[facing=west]",
  "144:5": "minecraft:skeleton_wall_skull[facing=east]",
  "144:8": "minecraft:skeleton_skull[rotation=8]",
  "144:9": "minecraft:skeleton_skull[rotation=12]",
  "144:10": "minecraft:skeleton_wall_skull[facing=north]",
  "144:11": "minecraft:skeleton_wall_skull[facing=south]",
  "144:12": "minecraft:skeleton_wall_skull[facing=west]",
  "144:13": "minecraft:skeleton_wall_skull[facing=east]",
  "145:0": "minecraft:anvil[facing=south]",
  "145:1": "minecraft:anvil[facing=west]",
  "145:2": "minecraft:anvil[facing=north]",
  "145:3": "minecraft:anvil[facing=east]",
  "145:4": "minecraft:chipped_anvil[facing=south]",
  "145:5": "minecraft:chipped_anvil[facing=west]",
  "145:6": "minecraft:chipped_anvil[facing=north]",
  "145:7": "minecraft:chipped_anvil[facing=east]",
  "145:8": "minecraft:damaged_anvil[facing=south]",
  "145:9": "minecraft:damaged_anvil[facing=west]",
  "145:10": "minecraft:damaged_anvil[facing=north]",
  "145:11": "minecraft:damaged_anvil[facing=east]",
  "146:2": "minecraft:trapped_chest[facing=north,type=single]",
  "146:3": "minecraft:trapped_chest[facing=south,type=single]",
  "146:4": "minecraft:trapped_chest[facing=west,type=single]",
  "146:5": "minecraft:trapped_chest[facing=east,type=single]",
  "147:0": "minecraft:light_weighted_pressure_plate[power=0]",
  "147:1": "minecraft:light_weighted_pressure_plate[power=1]",
  "147:2": "minecraft:light_weighted_pressure_plate[power=2]",
  "147:3": "minecraft:light_weighted_pressure_plate[power=3]",
  "147:4": "minecraft:light_weighted_pressure_plate[power=4]",
  "147:5": "minecraft:light_weighted_pressure_plate[power=5]",
  "147:6": "minecraft:light_weighted_pressure_plate[power=6]",
  "147:7": "minecraft:light_weighted_pressure_plate[power=7]",
  "147:8": "minecraft:light_weighted_pressure_plate[power=8]",
  "147:9": "minecraft:light_weighted_pressure_plate[power=9]",
  "147:10": "minecraft:light_weighted_pressure_plate[power=10]",
  "147:11": "minecraft:light_weighted_pressure_plate[power=11]",
  "147:12": "minecraft:light_weighted_pressure_plate[power=12]",
  "147:13": "minecraft:light_weighted_pressure_plate[power=13]",
  "147:14": "minecraft:light_weighted_pressure_plate[power=14]",
  "147:15": "minecraft:light_weighted_pressure_plate[power=15]",
  "148:0": "minecraft:heavy_weighted_pressure_plate[power=0]",
  "148:1": "minecraft:heavy_weighted_pressure_plate[power=1]",
  "148:2": "minecraft:heavy_weighted_pressure_plate[power=2]",
  "148:3": "minecraft:heavy_weighted_pressure_plate[power=3]",
  "148:4": "minecraft:heavy_weighted_pressure_plate[power=4]",
  "148:5": "minecraft:heavy_weighted_pressure_plate[power=5]",
  "148:6": "minecraft:heavy_weighted_pressure_plate[power=6]",
  "148:7": "minecraft:heavy_weighted_pressure_plate[power=7]",
  "148:8": "minecraft:heavy_weighted_pressure_plate[power=8]",
  "148:9": "minecraft:heavy_weighted_pressure_plate[power=9]",
  "148:10": "minecraft:heavy_weighted_pressure_plate[power=10]",
  "148:11": "minecraft:heavy_weighted_pressure_plate[power=11]",
  "148:12": "minecraft:heavy_weighted_pressure_plate[power=12]",
  "148:13": "minecraft:heavy_weighted_pressure_plate[power=13]",
  "148:14": "minecraft:heavy_weighted_pressure_plate[power=14]",
  "148:15": "minecraft:heavy_weighted_pressure_plate[power=15]",
  "149:0": "minecraft:comparator[mode=compare,powered=false,facing=south]",
  "149:1": "minecraft:comparator[mode=compare,powered=false,facing=west]",
  "149:2": "minecraft:comparator[mode=compare,powered=false,facing=north]",
  "149:3": "minecraft:comparator[mode=compare,powered=false,facing=east]",
  "149:4": "minecraft:comparator[mode=subtract,powered=false,facing=south]",
  "149:5": "minecraft:comparator[mode=subtract,powered=false,facing=west]",
  "149:6": "minecraft:comparator[mode=subtract,powered=false,facing=north]",
  "149:7": "minecraft:comparator[mode=subtract,powered=false,facing=east]",
  "149:8": "minecraft:comparator[mode=compare,powered=false,facing=south]",
  "149:9": "minecraft:comparator[mode=compare,powered=false,facing=west]",
  "149:10": "minecraft:comparator[mode=compare,powered=false,facing=north]",
  "149:11": "minecraft:comparator[mode=compare,powered=false,facing=east]",
  "149:12": "minecraft:comparator[mode=subtract,powered=false,facing=south]",
  "149:13": "minecraft:comparator[mode=subtract,powered=false,facing=west]",
  "149:14": "minecraft:comparator[mode=subtract,powered=false,facing=north]",
  "149:15": "minecraft:comparator[mode=subtract,powered=false,facing=east]",
  "150:0": "minecraft:comparator[mode=compare,powered=true,facing=south]",
  "150:1": "minecraft:comparator[mode=compare,powered=true,facing=west]",
  "150:2": "minecraft:comparator[mode=compare,powered=true,facing=north]",
  "150:3": "minecraft:comparator[mode=compare,powered=true,facing=east]",
  "150:4": "minecraft:comparator[mode=subtract,powered=true,facing=south]",
  "150:5": "minecraft:comparator[mode=subtract,powered=true,facing=west]",
  "150:6": "minecraft:comparator[mode=subtract,powered=true,facing=north]",
  "150:7": "minecraft:comparator[mode=subtract,powered=true,facing=east]",
  "150:8": "minecraft:comparator[mode=compare,powered=true,facing=south]",
  "150:9": "minecraft:comparator[mode=compare,powered=true,facing=west]",
  "150:10": "minecraft:comparator[mode=compare,powered=true,facing=north]",
  "150:11": "minecraft:comparator[mode=compare,powered=true,facing=east]",
  "150:12": "minecraft:comparator[mode=subtract,powered=true,facing=south]",
  "150:13": "minecraft:comparator[mode=subtract,powered=true,facing=west]",
  "150:14": "minecraft:comparator[mode=subtract,powered=true,facing=north]",
  "150:15": "minecraft:comparator[mode=subtract,powered=true,facing=east]",
  "151:0": "minecraft:daylight_detector[inverted=false,power=0]",
  "151:1": "minecraft:daylight_detector[inverted=false,power=1]",
  "151:2": "minecraft:daylight_detector[inverted=false,power=2]",
  "151:3": "minecraft:daylight_detector[inverted=false,power=3]",
  "151:4": "minecraft:daylight_detector[inverted=false,power=4]",
  "151:5": "minecraft:daylight_detector[inverted=false,power=5]",
  "151:6": "minecraft:daylight_detector[inverted=false,power=6]",
  "151:7": "minecraft:daylight_detector[inverted=false,power=7]",
  "151:8": "minecraft:daylight_detector[inverted=false,power=8]",
  "151:9": "minecraft:daylight_detector[inverted=false,power=9]",
  "151:10": "minecraft:daylight_detector[inverted=false,power=10]",
  "151:11": "minecraft:daylight_detector[inverted=false,power=11]",
  "151:12": "minecraft:daylight_detector[inverted=false,power=12]",
  "151:13": "minecraft:daylight_detector[inverted=false,power=13]",
  "151:14": "minecraft:daylight_detector[inverted=false,power=14]",
  "151:15": "minecraft:daylight_detector[inverted=false,power=15]",
  "152:0": "minecraft:redstone_block",
  "153:0": "minecraft:nether_quartz_ore",
  "154:0": "minecraft:hopper[facing=down,enabled=true]",
  "154:2": "minecraft:hopper[facing=north,enabled=true]",
  "154:3": "minecraft:hopper[facing=south,enabled=true]",
  "154:4": "minecraft:hopper[facing=west,enabled=true]",
  "154:5": "minecraft:hopper[facing=east,enabled=true]",
  "154:8": "minecraft:hopper[facing=down,enabled=false]",
  "154:10": "minecraft:hopper[facing=north,enabled=false]",
  "154:11": "minecraft:hopper[facing=south,enabled=false]",
  "154:12": "minecraft:hopper[facing=west,enabled=false]",
  "154:13": "minecraft:hopper[facing=east,enabled=false]",
  "155:0": "minecraft:quartz_block",
  "155:1": "minecraft:chiseled_quartz_block",
  "155:2": "minecraft:quartz_pillar[axis=y]",
  "155:3": "minecraft:quartz_pillar[axis=x]",
  "155:4": "minecraft:quartz_pillar[axis=z]",
  "155:6": "minecraft:quartz_pillar[axis=x]",
  "155:10": "minecraft:quartz_pillar[axis=z]",
  "156:0": "minecraft:quartz_stairs[half=bottom,shape=straight,facing=east]",
  "156:1": "minecraft:quartz_stairs[half=bottom,shape=straight,facing=west]",
  "156:2": "minecraft:quartz_stairs[half=bottom,shape=straight,facing=south]",
  "156:3": "minecraft:quartz_stairs[half=bottom,shape=straight,facing=north]",
  "156:4": "minecraft:quartz_stairs[half=top,shape=straight,facing=east]",
  "156:5": "minecraft:quartz_stairs[half=top,shape=straight,facing=west]",
  "156:6": "minecraft:quartz_stairs[half=top,shape=straight,facing=south]",
  "156:7": "minecraft:quartz_stairs[half=top,shape=straight,facing=north]",
  "157:0": "minecraft:activator_rail[shape=north_south,powered=false]",
  "157:1": "minecraft:activator_rail[shape=east_west,powered=false]",
  "157:2": "minecraft:activator_rail[shape=ascending_east,powered=false]",
  "157:3": "minecraft:activator_rail[shape=ascending_west,powered=false]",
  "157:4": "minecraft:activator_rail[shape=ascending_north,powered=false]",
  "157:5": "minecraft:activator_rail[shape=ascending_south,powered=false]",
  "157:8": "minecraft:activator_rail[shape=north_south,powered=true]",
  "157:9": "minecraft:activator_rail[shape=east_west,powered=true]",
  "157:10": "minecraft:activator_rail[shape=ascending_east,powered=true]",
  "157:11": "minecraft:activator_rail[shape=ascending_west,powered=true]",
  "157:12": "minecraft:activator_rail[shape=ascending_north,powered=true]",
  "157:13": "minecraft:activator_rail[shape=ascending_south,powered=true]",
  "158:0": "minecraft:dropper[triggered=false,facing=down]",
  "158:1": "minecraft:dropper[triggered=false,facing=up]",
  "158:2": "minecraft:dropper[triggered=false,facing=north]",
  "158:3": "minecraft:dropper[triggered=false,facing=south]",
  "158:4": "minecraft:dropper[triggered=false,facing=west]",
  "158:5": "minecraft:dropper[triggered=false,facing=east]",
  "158:8": "minecraft:dropper[triggered=true,facing=down]",
  "158:9": "minecraft:dropper[triggered=true,facing=up]",
  "158:10": "minecraft:dropper[triggered=true,facing=north]",
  "158:11": "minecraft:dropper[triggered=true,facing=south]",
  "158:12": "minecraft:dropper[triggered=true,facing=west]",
  "158:13": "minecraft:dropper[triggered=true,facing=east]",
  "159:0": "minecraft:white_terracotta",
  "159:1": "minecraft:orange_terracotta",
  "159:2": "minecraft:magenta_terracotta",
  "159:3": "minecraft:light_blue_terracotta",
  "159:4": "minecraft:yellow_terracotta",
  "159:5": "minecraft:lime_terracotta",
  "159:6": "minecraft:pink_terracotta",
  "159:7": "minecraft:gray_terracotta",
  "159:8": "minecraft:light_gray_terracotta",
  "159:9": "minecraft:cyan_terracotta",
  "159:10": "minecraft:purple_terracotta",
  "159:11": "minecraft:blue_terracotta",
  "159:12": "minecraft:brown_terracotta",
  "159:13": "minecraft:green_terracotta",
  "159:14": "minecraft:red_terracotta",
  "159:15": "minecraft:black_terracotta",
  "160:0": "minecraft:white_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:1": "minecraft:orange_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:2": "minecraft:magenta_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:3": "minecraft:light_blue_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:4": "minecraft:yellow_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:5": "minecraft:lime_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:6": "minecraft:pink_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:7": "minecraft:gray_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:8": "minecraft:light_gray_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:9": "minecraft:cyan_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:10": "minecraft:purple_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:11": "minecraft:blue_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:12": "minecraft:brown_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:13": "minecraft:green_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:14": "minecraft:red_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "160:15": "minecraft:black_stained_glass_pane[east=false,south=false,north=false,west=false]",
  "161:0": "minecraft:acacia_leaves[persistent=false,distance=1]",
  "161:1": "minecraft:dark_oak_leaves[persistent=false,distance=1]",
  "161:4": "minecraft:acacia_leaves[persistent=true,distance=1]",
  "161:5": "minecraft:dark_oak_leaves[persistent=true,distance=1]",
  "161:8": "minecraft:acacia_leaves[persistent=false,distance=1]",
  "161:9": "minecraft:dark_oak_leaves[persistent=false,distance=1]",
  "161:12": "minecraft:acacia_leaves[persistent=true,distance=1]",
  "161:13": "minecraft:dark_oak_leaves[persistent=true,distance=1]",
  "162:0": "minecraft:acacia_log[axis=y]",
  "162:1": "minecraft:dark_oak_log[axis=y]",
  "162:4": "minecraft:acacia_log[axis=x]",
  "162:5": "minecraft:dark_oak_log[axis=x]",
  "162:8": "minecraft:acacia_log[axis=z]",
  "162:9": "minecraft:dark_oak_log[axis=z]",
  "162:12": "minecraft:acacia_wood",
  "162:13": "minecraft:dark_oak_wood",
  "163:0": "minecraft:acacia_stairs[half=bottom,shape=straight,facing=east]",
  "163:1": "minecraft:acacia_stairs[half=bottom,shape=straight,facing=west]",
  "163:2": "minecraft:acacia_stairs[half=bottom,shape=straight,facing=south]",
  "163:3": "minecraft:acacia_stairs[half=bottom,shape=straight,facing=north]",
  "163:4": "minecraft:acacia_stairs[half=top,shape=straight,facing=east]",
  "163:5": "minecraft:acacia_stairs[half=top,shape=straight,facing=west]",
  "163:6": "minecraft:acacia_stairs[half=top,shape=straight,facing=south]",
  "163:7": "minecraft:acacia_stairs[half=top,shape=straight,facing=north]",
  "164:0": "minecraft:dark_oak_stairs[half=bottom,shape=straight,facing=east]",
  "164:1": "minecraft:dark_oak_stairs[half=bottom,shape=straight,facing=west]",
  "164:2": "minecraft:dark_oak_stairs[half=bottom,shape=straight,facing=south]",
  "164:3": "minecraft:dark_oak_stairs[half=bottom,shape=straight,facing=north]",
  "164:4": "minecraft:dark_oak_stairs[half=top,shape=straight,facing=east]",
  "164:5": "minecraft:dark_oak_stairs[half=top,shape=straight,facing=west]",
  "164:6": "minecraft:dark_oak_stairs[half=top,shape=straight,facing=south]",
  "164:7": "minecraft:dark_oak_stairs[half=top,shape=straight,facing=north]",
  "165:0": "minecraft:slime_block",
  "166:0": "minecraft:barrier",
  "167:0": "minecraft:iron_trapdoor[half=bottom,facing=north,open=false]",
  "167:1": "minecraft:iron_trapdoor[half=bottom,facing=south,open=false]",
  "167:2": "minecraft:iron_trapdoor[half=bottom,facing=west,open=false]",
  "167:3": "minecraft:iron_trapdoor[half=bottom,facing=east,open=false]",
  "167:4": "minecraft:iron_trapdoor[half=bottom,facing=north,open=true]",
  "167:5": "minecraft:iron_trapdoor[half=bottom,facing=south,open=true]",
  "167:6": "minecraft:iron_trapdoor[half=bottom,facing=west,open=true]",
  "167:7": "minecraft:iron_trapdoor[half=bottom,facing=east,open=true]",
  "167:8": "minecraft:iron_trapdoor[half=top,facing=north,open=false]",
  "167:9": "minecraft:iron_trapdoor[half=top,facing=south,open=false]",
  "167:10": "minecraft:iron_trapdoor[half=top,facing=west,open=false]",
  "167:11": "minecraft:iron_trapdoor[half=top,facing=east,open=false]",
  "167:12": "minecraft:iron_trapdoor[half=top,facing=north,open=true]",
  "167:13": "minecraft:iron_trapdoor[half=top,facing=south,open=true]",
  "167:14": "minecraft:iron_trapdoor[half=top,facing=west,open=true]",
  "167:15": "minecraft:iron_trapdoor[half=top,facing=east,open=true]",
  "168:0": "minecraft:prismarine",
  "168:1": "minecraft:prismarine_bricks",
  "168:2": "minecraft:dark_prismarine",
  "169:0": "minecraft:sea_lantern",
  "170:0": "minecraft:hay_block[axis=y]",
  "170:4": "minecraft:hay_block[axis=x]",
  "170:8": "minecraft:hay_block[axis=z]",
  "171:0": "minecraft:white_carpet",
  "171:1": "minecraft:orange_carpet",
  "171:2": "minecraft:magenta_carpet",
  "171:3": "minecraft:light_blue_carpet",
  "171:4": "minecraft:yellow_carpet",
  "171:5": "minecraft:lime_carpet",
  "171:6": "minecraft:pink_carpet",
  "171:7": "minecraft:gray_carpet",
  "171:8": "minecraft:light_gray_carpet",
  "171:9": "minecraft:cyan_carpet",
  "171:10": "minecraft:purple_carpet",
  "171:11": "minecraft:blue_carpet",
  "171:12": "minecraft:brown_carpet",
  "171:13": "minecraft:green_carpet",
  "171:14": "minecraft:red_carpet",
  "171:15": "minecraft:black_carpet",
  "172:0": "minecraft:terracotta",
  "173:0": "minecraft:coal_block",
  "174:0": "minecraft:packed_ice",
  "175:0": "minecraft:sunflower[half=lower]",
  "175:1": "minecraft:lilac[half=lower]",
  "175:2": "minecraft:tall_grass[half=lower]",
  "175:3": "minecraft:large_fern[half=lower]",
  "175:4": "minecraft:rose_bush[half=lower]",
  "175:5": "minecraft:peony[half=lower]",
  "175:8": "minecraft:sunflower[half=upper]",
  "175:9": "minecraft:lilac[half=upper]",
  "175:10": "minecraft:tall_grass[half=upper]",
  "175:11": "minecraft:large_fern[half=upper]",
  "175:12": "minecraft:rose_bush[half=upper]",
  "175:13": "minecraft:peony[half=upper]",
  "176:0": "minecraft:white_banner[rotation=0]",
  "176:1": "minecraft:white_banner[rotation=1]",
  "176:2": "minecraft:white_banner[rotation=2]",
  "176:3": "minecraft:white_banner[rotation=3]",
  "176:4": "minecraft:white_banner[rotation=4]",
  "176:5": "minecraft:white_banner[rotation=5]",
  "176:6": "minecraft:white_banner[rotation=6]",
  "176:7": "minecraft:white_banner[rotation=7]",
  "176:8": "minecraft:white_banner[rotation=8]",
  "176:9": "minecraft:white_banner[rotation=9]",
  "176:10": "minecraft:white_banner[rotation=10]",
  "176:11": "minecraft:white_banner[rotation=11]",
  "176:12": "minecraft:white_banner[rotation=12]",
  "176:13": "minecraft:white_banner[rotation=13]",
  "176:14": "minecraft:white_banner[rotation=14]",
  "176:15": "minecraft:white_banner[rotation=15]",
  "177:2": "minecraft:white_wall_banner[facing=north]",
  "177:3": "minecraft:white_wall_banner[facing=south]",
  "177:4": "minecraft:white_wall_banner[facing=west]",
  "177:5": "minecraft:white_wall_banner[facing=east]",
  "178:0": "minecraft:daylight_detector[inverted=true,power=0]",
  "178:1": "minecraft:daylight_detector[inverted=true,power=1]",
  "178:2": "minecraft:daylight_detector[inverted=true,power=2]",
  "178:3": "minecraft:daylight_detector[inverted=true,power=3]",
  "178:4": "minecraft:daylight_detector[inverted=true,power=4]",
  "178:5": "minecraft:daylight_detector[inverted=true,power=5]",
  "178:6": "minecraft:daylight_detector[inverted=true,power=6]",
  "178:7": "minecraft:daylight_detector[inverted=true,power=7]",
  "178:8": "minecraft:daylight_detector[inverted=true,power=8]",
  "178:9": "minecraft:daylight_detector[inverted=true,power=9]",
  "178:10": "minecraft:daylight_detector[inverted=true,power=10]",
  "178:11": "minecraft:daylight_detector[inverted=true,power=11]",
  "178:12": "minecraft:daylight_detector[inverted=true,power=12]",
  "178:13": "minecraft:daylight_detector[inverted=true,power=13]",
  "178:14": "minecraft:daylight_detector[inverted=true,power=14]",
  "178:15": "minecraft:daylight_detector[inverted=true,power=15]",
  "179:0": "minecraft:red_sandstone",
  "179:1": "minecraft:chiseled_red_sandstone",
  "179:2": "minecraft:cut_red_sandstone",
  "180:0": "minecraft:red_sandstone_stairs[half=bottom,shape=straight,facing=east]",
  "180:1": "minecraft:red_sandstone_stairs[half=bottom,shape=straight,facing=west]",
  "180:2": "minecraft:red_sandstone_stairs[half=bottom,shape=straight,facing=south]",
  "180:3": "minecraft:red_sandstone_stairs[half=bottom,shape=straight,facing=north]",
  "180:4": "minecraft:red_sandstone_stairs[half=top,shape=straight,facing=east]",
  "180:5": "minecraft:red_sandstone_stairs[half=top,shape=straight,facing=west]",
  "180:6": "minecraft:red_sandstone_stairs[half=top,shape=straight,facing=south]",
  "180:7": "minecraft:red_sandstone_stairs[half=top,shape=straight,facing=north]",
  "181:0": "minecraft:red_sandstone_slab[type=double]",
  "181:8": "minecraft:smooth_red_sandstone",
  "182:0": "minecraft:red_sandstone_slab[type=bottom]",
  "182:8": "minecraft:red_sandstone_slab[type=top]",
  "183:0": "minecraft:spruce_fence_gate[in_wall=false,powered=false,facing=south,open=false]",
  "183:1": "minecraft:spruce_fence_gate[in_wall=false,powered=false,facing=west,open=false]",
  "183:2": "minecraft:spruce_fence_gate[in_wall=false,powered=false,facing=north,open=false]",
  "183:3": "minecraft:spruce_fence_gate[in_wall=false,powered=false,facing=east,open=false]",
  "183:4": "minecraft:spruce_fence_gate[in_wall=false,powered=false,facing=south,open=true]",
  "183:5": "minecraft:spruce_fence_gate[in_wall=false,powered=false,facing=west,open=true]",
  "183:6": "minecraft:spruce_fence_gate[in_wall=false,powered=false,facing=north,open=true]",
  "183:7": "minecraft:spruce_fence_gate[in_wall=false,powered=false,facing=east,open=true]",
  "183:8": "minecraft:spruce_fence_gate[in_wall=false,powered=true,facing=south,open=false]",
  "183:9": "minecraft:spruce_fence_gate[in_wall=false,powered=true,facing=west,open=false]",
  "183:10": "minecraft:spruce_fence_gate[in_wall=false,powered=true,facing=north,open=false]",
  "183:11": "minecraft:spruce_fence_gate[in_wall=false,powered=true,facing=east,open=false]",
  "183:12": "minecraft:spruce_fence_gate[in_wall=false,powered=true,facing=south,open=true]",
  "183:13": "minecraft:spruce_fence_gate[in_wall=false,powered=true,facing=west,open=true]",
  "183:14": "minecraft:spruce_fence_gate[in_wall=false,powered=true,facing=north,open=true]",
  "183:15": "minecraft:spruce_fence_gate[in_wall=false,powered=true,facing=east,open=true]",
  "184:0": "minecraft:birch_fence_gate[in_wall=false,powered=false,facing=south,open=false]",
  "184:1": "minecraft:birch_fence_gate[in_wall=false,powered=false,facing=west,open=false]",
  "184:2": "minecraft:birch_fence_gate[in_wall=false,powered=false,facing=north,open=false]",
  "184:3": "minecraft:birch_fence_gate[in_wall=false,powered=false,facing=east,open=false]",
  "184:4": "minecraft:birch_fence_gate[in_wall=false,powered=false,facing=south,open=true]",
  "184:5": "minecraft:birch_fence_gate[in_wall=false,powered=false,facing=west,open=true]",
  "184:6": "minecraft:birch_fence_gate[in_wall=false,powered=false,facing=north,open=true]",
  "184:7": "minecraft:birch_fence_gate[in_wall=false,powered=false,facing=east,open=true]",
  "184:8": "minecraft:birch_fence_gate[in_wall=false,powered=true,facing=south,open=false]",
  "184:9": "minecraft:birch_fence_gate[in_wall=false,powered=true,facing=west,open=false]",
  "184:10": "minecraft:birch_fence_gate[in_wall=false,powered=true,facing=north,open=false]",
  "184:11": "minecraft:birch_fence_gate[in_wall=false,powered=true,facing=east,open=false]",
  "184:12": "minecraft:birch_fence_gate[in_wall=false,powered=true,facing=south,open=true]",
  "184:13": "minecraft:birch_fence_gate[in_wall=false,powered=true,facing=west,open=true]",
  "184:14": "minecraft:birch_fence_gate[in_wall=false,powered=true,facing=north,open=true]",
  "184:15": "minecraft:birch_fence_gate[in_wall=false,powered=true,facing=east,open=true]",
  "185:0": "minecraft:jungle_fence_gate[in_wall=false,powered=false,facing=south,open=false]",
  "185:1": "minecraft:jungle_fence_gate[in_wall=false,powered=false,facing=west,open=false]",
  "185:2": "minecraft:jungle_fence_gate[in_wall=false,powered=false,facing=north,open=false]",
  "185:3": "minecraft:jungle_fence_gate[in_wall=false,powered=false,facing=east,open=false]",
  "185:4": "minecraft:jungle_fence_gate[in_wall=false,powered=false,facing=south,open=true]",
  "185:5": "minecraft:jungle_fence_gate[in_wall=false,powered=false,facing=west,open=true]",
  "185:6": "minecraft:jungle_fence_gate[in_wall=false,powered=false,facing=north,open=true]",
  "185:7": "minecraft:jungle_fence_gate[in_wall=false,powered=false,facing=east,open=true]",
  "185:8": "minecraft:jungle_fence_gate[in_wall=false,powered=true,facing=south,open=false]",
  "185:9": "minecraft:jungle_fence_gate[in_wall=false,powered=true,facing=west,open=false]",
  "185:10": "minecraft:jungle_fence_gate[in_wall=false,powered=true,facing=north,open=false]",
  "185:11": "minecraft:jungle_fence_gate[in_wall=false,powered=true,facing=east,open=false]",
  "185:12": "minecraft:jungle_fence_gate[in_wall=false,powered=true,facing=south,open=true]",
  "185:13": "minecraft:jungle_fence_gate[in_wall=false,powered=true,facing=west,open=true]",
  "185:14": "minecraft:jungle_fence_gate[in_wall=false,powered=true,facing=north,open=true]",
  "185:15": "minecraft:jungle_fence_gate[in_wall=false,powered=true,facing=east,open=true]",
  "186:0": "minecraft:dark_oak_fence_gate[in_wall=false,powered=false,facing=south,open=false]",
  "186:1": "minecraft:dark_oak_fence_gate[in_wall=false,powered=false,facing=west,open=false]",
  "186:2": "minecraft:dark_oak_fence_gate[in_wall=false,powered=false,facing=north,open=false]",
  "186:3": "minecraft:dark_oak_fence_gate[in_wall=false,powered=false,facing=east,open=false]",
  "186:4": "minecraft:dark_oak_fence_gate[in_wall=false,powered=false,facing=south,open=true]",
  "186:5": "minecraft:dark_oak_fence_gate[in_wall=false,powered=false,facing=west,open=true]",
  "186:6": "minecraft:dark_oak_fence_gate[in_wall=false,powered=false,facing=north,open=true]",
  "186:7": "minecraft:dark_oak_fence_gate[in_wall=false,powered=false,facing=east,open=true]",
  "186:8": "minecraft:dark_oak_fence_gate[in_wall=false,powered=true,facing=south,open=false]",
  "186:9": "minecraft:dark_oak_fence_gate[in_wall=false,powered=true,facing=west,open=false]",
  "186:10": "minecraft:dark_oak_fence_gate[in_wall=false,powered=true,facing=north,open=false]",
  "186:11": "minecraft:dark_oak_fence_gate[in_wall=false,powered=true,facing=east,open=false]",
  "186:12": "minecraft:dark_oak_fence_gate[in_wall=false,powered=true,facing=south,open=true]",
  "186:13": "minecraft:dark_oak_fence_gate[in_wall=false,powered=true,facing=west,open=true]",
  "186:14": "minecraft:dark_oak_fence_gate[in_wall=false,powered=true,facing=north,open=true]",
  "186:15": "minecraft:dark_oak_fence_gate[in_wall=false,powered=true,facing=east,open=true]",
  "187:0": "minecraft:acacia_fence_gate[in_wall=false,powered=false,facing=south,open=false]",
  "187:1": "minecraft:acacia_fence_gate[in_wall=false,powered=false,facing=west,open=false]",
  "187:2": "minecraft:acacia_fence_gate[in_wall=false,powered=false,facing=north,open=false]",
  "187:3": "minecraft:acacia_fence_gate[in_wall=false,powered=false,facing=east,open=false]",
  "187:4": "minecraft:acacia_fence_gate[in_wall=false,powered=false,facing=south,open=true]",
  "187:5": "minecraft:acacia_fence_gate[in_wall=false,powered=false,facing=west,open=true]",
  "187:6": "minecraft:acacia_fence_gate[in_wall=false,powered=false,facing=north,open=true]",
  "187:7": "minecraft:acacia_fence_gate[in_wall=false,powered=false,facing=east,open=true]",
  "187:8": "minecraft:acacia_fence_gate[in_wall=false,powered=true,facing=south,open=false]",
  "187:9": "minecraft:acacia_fence_gate[in_wall=false,powered=true,facing=west,open=false]",
  "187:10": "minecraft:acacia_fence_gate[in_wall=false,powered=true,facing=north,open=false]",
  "187:11": "minecraft:acacia_fence_gate[in_wall=false,powered=true,facing=east,open=false]",
  "187:12": "minecraft:acacia_fence_gate[in_wall=false,powered=true,facing=south,open=true]",
  "187:13": "minecraft:acacia_fence_gate[in_wall=false,powered=true,facing=west,open=true]",
  "187:14": "minecraft:acacia_fence_gate[in_wall=false,powered=true,facing=north,open=true]",
  "187:15": "minecraft:acacia_fence_gate[in_wall=false,powered=true,facing=east,open=true]",
  "188:0": "minecraft:spruce_fence[east=false,south=false,north=false,west=false]",
  "189:0": "minecraft:birch_fence[east=false,south=false,north=false,west=false]",
  "190:0": "minecraft:jungle_fence[east=false,south=false,north=false,west=false]",
  "191:0": "minecraft:dark_oak_fence[east=false,south=false,north=false,west=false]",
  "192:0": "minecraft:acacia_fence[east=false,south=false,north=false,west=false]",
  "193:0": "minecraft:spruce_door[hinge=right,half=lower,powered=false,facing=east,open=false]",
  "193:1": "minecraft:spruce_door[hinge=right,half=lower,powered=false,facing=south,open=false]",
  "193:2": "minecraft:spruce_door[hinge=right,half=lower,powered=false,facing=west,open=false]",
  "193:3": "minecraft:spruce_door[hinge=right,half=lower,powered=false,facing=north,open=false]",
  "193:4": "minecraft:spruce_door[hinge=right,half=lower,powered=false,facing=east,open=true]",
  "193:5": "minecraft:spruce_door[hinge=right,half=lower,powered=false,facing=south,open=true]",
  "193:6": "minecraft:spruce_door[hinge=right,half=lower,powered=false,facing=west,open=true]",
  "193:7": "minecraft:spruce_door[hinge=right,half=lower,powered=false,facing=north,open=true]",
  "193:8": "minecraft:spruce_door[hinge=left,half=upper,powered=false,facing=east,open=false]",
  "193:9": "minecraft:spruce_door[hinge=right,half=upper,powered=false,facing=east,open=false]",
  "193:10": "minecraft:spruce_door[hinge=left,half=upper,powered=true,facing=east,open=false]",
  "193:11": "minecraft:spruce_door[hinge=right,half=upper,powered=true,facing=east,open=false]",
  "194:0": "minecraft:birch_door[hinge=right,half=lower,powered=false,facing=east,open=false]",
  "194:1": "minecraft:birch_door[hinge=right,half=lower,powered=false,facing=south,open=false]",
  "194:2": "minecraft:birch_door[hinge=right,half=lower,powered=false,facing=west,open=false]",
  "194:3": "minecraft:birch_door[hinge=right,half=lower,powered=false,facing=north,open=false]",
  "194:4": "minecraft:birch_door[hinge=right,half=lower,powered=false,facing=east,open=true]",
  "194:5": "minecraft:birch_door[hinge=right,half=lower,powered=false,facing=south,open=true]",
  "194:6": "minecraft:birch_door[hinge=right,half=lower,powered=false,facing=west,open=true]",
  "194:7": "minecraft:birch_door[hinge=right,half=lower,powered=false,facing=north,open=true]",
  "194:8": "minecraft:birch_door[hinge=left,half=upper,powered=false,facing=east,open=false]",
  "194:9": "minecraft:birch_door[hinge=right,half=upper,powered=false,facing=east,open=false]",
  "194:10": "minecraft:birch_door[hinge=left,half=upper,powered=true,facing=east,open=false]",
  "194:11": "minecraft:birch_door[hinge=right,half=upper,powered=true,facing=east,open=false]",
  "195:0": "minecraft:jungle_door[hinge=right,half=lower,powered=false,facing=east,open=false]",
  "195:1": "minecraft:jungle_door[hinge=right,half=lower,powered=false,facing=south,open=false]",
  "195:2": "minecraft:jungle_door[hinge=right,half=lower,powered=false,facing=west,open=false]",
  "195:3": "minecraft:jungle_door[hinge=right,half=lower,powered=false,facing=north,open=false]",
  "195:4": "minecraft:jungle_door[hinge=right,half=lower,powered=false,facing=east,open=true]",
  "195:5": "minecraft:jungle_door[hinge=right,half=lower,powered=false,facing=south,open=true]",
  "195:6": "minecraft:jungle_door[hinge=right,half=lower,powered=false,facing=west,open=true]",
  "195:7": "minecraft:jungle_door[hinge=right,half=lower,powered=false,facing=north,open=true]",
  "195:8": "minecraft:jungle_door[hinge=left,half=upper,powered=false,facing=east,open=false]",
  "195:9": "minecraft:jungle_door[hinge=right,half=upper,powered=false,facing=east,open=false]",
  "195:10": "minecraft:jungle_door[hinge=left,half=upper,powered=true,facing=east,open=false]",
  "195:11": "minecraft:jungle_door[hinge=right,half=upper,powered=true,facing=east,open=false]",
  "196:0": "minecraft:acacia_door[hinge=right,half=lower,powered=false,facing=east,open=false]",
  "196:1": "minecraft:acacia_door[hinge=right,half=lower,powered=false,facing=south,open=false]",
  "196:2": "minecraft:acacia_door[hinge=right,half=lower,powered=false,facing=west,open=false]",
  "196:3": "minecraft:acacia_door[hinge=right,half=lower,powered=false,facing=north,open=false]",
  "196:4": "minecraft:acacia_door[hinge=right,half=lower,powered=false,facing=east,open=true]",
  "196:5": "minecraft:acacia_door[hinge=right,half=lower,powered=false,facing=south,open=true]",
  "196:6": "minecraft:acacia_door[hinge=right,half=lower,powered=false,facing=west,open=true]",
  "196:7": "minecraft:acacia_door[hinge=right,half=lower,powered=false,facing=north,open=true]",
  "196:8": "minecraft:acacia_door[hinge=left,half=upper,powered=false,facing=east,open=false]",
  "196:9": "minecraft:acacia_door[hinge=right,half=upper,powered=false,facing=east,open=false]",
  "196:10": "minecraft:acacia_door[hinge=left,half=upper,powered=true,facing=east,open=false]",
  "196:11": "minecraft:acacia_door[hinge=right,half=upper,powered=true,facing=east,open=false]",
  "197:0": "minecraft:dark_oak_door[hinge=right,half=lower,powered=false,facing=east,open=false]",
  "197:1": "minecraft:dark_oak_door[hinge=right,half=lower,powered=false,facing=south,open=false]",
  "197:2": "minecraft:dark_oak_door[hinge=right,half=lower,powered=false,facing=west,open=false]",
  "197:3": "minecraft:dark_oak_door[hinge=right,half=lower,powered=false,facing=north,open=false]",
  "197:4": "minecraft:dark_oak_door[hinge=right,half=lower,powered=false,facing=east,open=true]",
  "197:5": "minecraft:dark_oak_door[hinge=right,half=lower,powered=false,facing=south,open=true]",
  "197:6": "minecraft:dark_oak_door[hinge=right,half=lower,powered=false,facing=west,open=true]",
  "197:7": "minecraft:dark_oak_door[hinge=right,half=lower,powered=false,facing=north,open=true]",
  "197:8": "minecraft:dark_oak_door[hinge=left,half=upper,powered=false,facing=east,open=false]",
  "197:9": "minecraft:dark_oak_door[hinge=right,half=upper,powered=false,facing=east,open=false]",
  "197:10": "minecraft:dark_oak_door[hinge=left,half=upper,powered=true,facing=east,open=false]",
  "197:11": "minecraft:dark_oak_door[hinge=right,half=upper,powered=true,facing=east,open=false]",
  "198:0": "minecraft:end_rod[facing=down]",
  "198:1": "minecraft:end_rod[facing=up]",
  "198:2": "minecraft:end_rod[facing=north]",
  "198:3": "minecraft:end_rod[facing=south]",
  "198:4": "minecraft:end_rod[facing=west]",
  "198:5": "minecraft:end_rod[facing=east]",
  "199:0": "minecraft:chorus_plant[east=false,south=false,north=false,west=false,up=false,down=false]",
  "200:0": "minecraft:chorus_flower[age=0]",
  "200:1": "minecraft:chorus_flower[age=1]",
  "200:2": "minecraft:chorus_flower[age=2]",
  "200:3": "minecraft:chorus_flower[age=3]",
  "200:4": "minecraft:chorus_flower[age=4]",
  "200:5": "minecraft:chorus_flower[age=5]",
  "201:0": "minecraft:purpur_block",
  "202:0": "minecraft:purpur_pillar[axis=y]",
  "202:4": "minecraft:purpur_pillar[axis=x]",
  "202:8": "minecraft:purpur_pillar[axis=z]",
  "203:0": "minecraft:purpur_stairs[half=bottom,shape=straight,facing=east]",
  "203:1": "minecraft:purpur_stairs[half=bottom,shape=straight,facing=west]",
  "203:2": "minecraft:purpur_stairs[half=bottom,shape=straight,facing=south]",
  "203:3": "minecraft:purpur_stairs[half=bottom,shape=straight,facing=north]",
  "203:4": "minecraft:purpur_stairs[half=top,shape=straight,facing=east]",
  "203:5": "minecraft:purpur_stairs[half=top,shape=straight,facing=west]",
  "203:6": "minecraft:purpur_stairs[half=top,shape=straight,facing=south]",
  "203:7": "minecraft:purpur_stairs[half=top,shape=straight,facing=north]",
  "204:0": "minecraft:purpur_slab[type=double]",
  "205:0": "minecraft:purpur_slab[type=bottom]",
  "205:8": "minecraft:purpur_slab[type=top]",
  "206:0": "minecraft:end_stone_bricks",
  "207:0": "minecraft:beetroots[age=0]",
  "207:1": "minecraft:beetroots[age=1]",
  "207:2": "minecraft:beetroots[age=2]",
  "207:3": "minecraft:beetroots[age=3]",
  "208:0": "minecraft:grass_path",
  "209:0": "minecraft:end_gateway",
  "210:0": "minecraft:repeating_command_block[conditional=false,facing=down]",
  "210:1": "minecraft:repeating_command_block[conditional=false,facing=up]",
  "210:2": "minecraft:repeating_command_block[conditional=false,facing=north]",
  "210:3": "minecraft:repeating_command_block[conditional=false,facing=south]",
  "210:4": "minecraft:repeating_command_block[conditional=false,facing=west]",
  "210:5": "minecraft:repeating_command_block[conditional=false,facing=east]",
  "210:8": "minecraft:repeating_command_block[conditional=true,facing=down]",
  "210:9": "minecraft:repeating_command_block[conditional=true,facing=up]",
  "210:10": "minecraft:repeating_command_block[conditional=true,facing=north]",
  "210:11": "minecraft:repeating_command_block[conditional=true,facing=south]",
  "210:12": "minecraft:repeating_command_block[conditional=true,facing=west]",
  "210:13": "minecraft:repeating_command_block[conditional=true,facing=east]",
  "211:0": "minecraft:chain_command_block[conditional=false,facing=down]",
  "211:1": "minecraft:chain_command_block[conditional=false,facing=up]",
  "211:2": "minecraft:chain_command_block[conditional=false,facing=north]",
  "211:3": "minecraft:chain_command_block[conditional=false,facing=south]",
  "211:4": "minecraft:chain_command_block[conditional=false,facing=west]",
  "211:5": "minecraft:chain_command_block[conditional=false,facing=east]",
  "211:8": "minecraft:chain_command_block[conditional=true,facing=down]",
  "211:9": "minecraft:chain_command_block[conditional=true,facing=up]",
  "211:10": "minecraft:chain_command_block[conditional=true,facing=north]",
  "211:11": "minecraft:chain_command_block[conditional=true,facing=south]",
  "211:12": "minecraft:chain_command_block[conditional=true,facing=west]",
  "211:13": "minecraft:chain_command_block[conditional=true,facing=east]",
  "212:0": "minecraft:frosted_ice[age=0]",
  "212:1": "minecraft:frosted_ice[age=1]",
  "212:2": "minecraft:frosted_ice[age=2]",
  "212:3": "minecraft:frosted_ice[age=3]",
  "213:0": "minecraft:magma_block",
  "214:0": "minecraft:nether_wart_block",
  "215:0": "minecraft:red_nether_bricks",
  "216:0": "minecraft:bone_block[axis=y]",
  "216:4": "minecraft:bone_block[axis=x]",
  "216:8": "minecraft:bone_block[axis=z]",
  "217:0": "minecraft:structure_void",
  "218:0": "minecraft:observer[powered=false,facing=down]",
  "218:1": "minecraft:observer[powered=false,facing=up]",
  "218:2": "minecraft:observer[powered=false,facing=north]",
  "218:3": "minecraft:observer[powered=false,facing=south]",
  "218:4": "minecraft:observer[powered=false,facing=west]",
  "218:5": "minecraft:observer[powered=false,facing=east]",
  "218:8": "minecraft:observer[powered=true,facing=down]",
  "218:9": "minecraft:observer[powered=true,facing=up]",
  "218:10": "minecraft:observer[powered=true,facing=north]",
  "218:11": "minecraft:observer[powered=true,facing=south]",
  "218:12": "minecraft:observer[powered=true,facing=west]",
  "218:13": "minecraft:observer[powered=true,facing=east]",
  "219:0": "minecraft:white_shulker_box[facing=down]",
  "219:1": "minecraft:white_shulker_box[facing=up]",
  "219:2": "minecraft:white_shulker_box[facing=north]",
  "219:3": "minecraft:white_shulker_box[facing=south]",
  "219:4": "minecraft:white_shulker_box[facing=west]",
  "219:5": "minecraft:white_shulker_box[facing=east]",
  "220:0": "minecraft:orange_shulker_box[facing=down]",
  "220:1": "minecraft:orange_shulker_box[facing=up]",
  "220:2": "minecraft:orange_shulker_box[facing=north]",
  "220:3": "minecraft:orange_shulker_box[facing=south]",
  "220:4": "minecraft:orange_shulker_box[facing=west]",
  "220:5": "minecraft:orange_shulker_box[facing=east]",
  "221:0": "minecraft:magenta_shulker_box[facing=down]",
  "221:1": "minecraft:magenta_shulker_box[facing=up]",
  "221:2": "minecraft:magenta_shulker_box[facing=north]",
  "221:3": "minecraft:magenta_shulker_box[facing=south]",
  "221:4": "minecraft:magenta_shulker_box[facing=west]",
  "221:5": "minecraft:magenta_shulker_box[facing=east]",
  "222:0": "minecraft:light_blue_shulker_box[facing=down]",
  "222:1": "minecraft:light_blue_shulker_box[facing=up]",
  "222:2": "minecraft:light_blue_shulker_box[facing=north]",
  "222:3": "minecraft:light_blue_shulker_box[facing=south]",
  "222:4": "minecraft:light_blue_shulker_box[facing=west]",
  "222:5": "minecraft:light_blue_shulker_box[facing=east]",
  "223:0": "minecraft:yellow_shulker_box[facing=down]",
  "223:1": "minecraft:yellow_shulker_box[facing=up]",
  "223:2": "minecraft:yellow_shulker_box[facing=north]",
  "223:3": "minecraft:yellow_shulker_box[facing=south]",
  "223:4": "minecraft:yellow_shulker_box[facing=west]",
  "223:5": "minecraft:yellow_shulker_box[facing=east]",
  "224:0": "minecraft:lime_shulker_box[facing=down]",
  "224:1": "minecraft:lime_shulker_box[facing=up]",
  "224:2": "minecraft:lime_shulker_box[facing=north]",
  "224:3": "minecraft:lime_shulker_box[facing=south]",
  "224:4": "minecraft:lime_shulker_box[facing=west]",
  "224:5": "minecraft:lime_shulker_box[facing=east]",
  "225:0": "minecraft:pink_shulker_box[facing=down]",
  "225:1": "minecraft:pink_shulker_box[facing=up]",
  "225:2": "minecraft:pink_shulker_box[facing=north]",
  "225:3": "minecraft:pink_shulker_box[facing=south]",
  "225:4": "minecraft:pink_shulker_box[facing=west]",
  "225:5": "minecraft:pink_shulker_box[facing=east]",
  "226:0": "minecraft:gray_shulker_box[facing=down]",
  "226:1": "minecraft:gray_shulker_box[facing=up]",
  "226:2": "minecraft:gray_shulker_box[facing=north]",
  "226:3": "minecraft:gray_shulker_box[facing=south]",
  "226:4": "minecraft:gray_shulker_box[facing=west]",
  "226:5": "minecraft:gray_shulker_box[facing=east]",
  "227:0": "minecraft:light_gray_shulker_box[facing=down]",
  "227:1": "minecraft:light_gray_shulker_box[facing=up]",
  "227:2": "minecraft:light_gray_shulker_box[facing=north]",
  "227:3": "minecraft:light_gray_shulker_box[facing=south]",
  "227:4": "minecraft:light_gray_shulker_box[facing=west]",
  "227:5": "minecraft:light_gray_shulker_box[facing=east]",
  "228:0": "minecraft:cyan_shulker_box[facing=down]",
  "228:1": "minecraft:cyan_shulker_box[facing=up]",
  "228:2": "minecraft:cyan_shulker_box[facing=north]",
  "228:3": "minecraft:cyan_shulker_box[facing=south]",
  "228:4": "minecraft:cyan_shulker_box[facing=west]",
  "228:5": "minecraft:cyan_shulker_box[facing=east]",
  "229:0": "minecraft:purple_shulker_box[facing=down]",
  "229:1": "minecraft:purple_shulker_box[facing=up]",
  "229:2": "minecraft:purple_shulker_box[facing=north]",
  "229:3": "minecraft:purple_shulker_box[facing=south]",
  "229:4": "minecraft:purple_shulker_box[facing=west]",
  "229:5": "minecraft:purple_shulker_box[facing=east]",
  "230:0": "minecraft:blue_shulker_box[facing=down]",
  "230:1": "minecraft:blue_shulker_box[facing=up]",
  "230:2": "minecraft:blue_shulker_box[facing=north]",
  "230:3": "minecraft:blue_shulker_box[facing=south]",
  "230:4": "minecraft:blue_shulker_box[facing=west]",
  "230:5": "minecraft:blue_shulker_box[facing=east]",
  "231:0": "minecraft:brown_shulker_box[facing=down]",
  "231:1": "minecraft:brown_shulker_box[facing=up]",
  "231:2": "minecraft:brown_shulker_box[facing=north]",
  "231:3": "minecraft:brown_shulker_box[facing=south]",
  "231:4": "minecraft:brown_shulker_box[facing=west]",
  "231:5": "minecraft:brown_shulker_box[facing=east]",
  "232:0": "minecraft:green_shulker_box[facing=down]",
  "232:1": "minecraft:green_shulker_box[facing=up]",
  "232:2": "minecraft:green_shulker_box[facing=north]",
  "232:3": "minecraft:green_shulker_box[facing=south]",
  "232:4": "minecraft:green_shulker_box[facing=west]",
  "232:5": "minecraft:green_shulker_box[facing=east]",
  "233:0": "minecraft:red_shulker_box[facing=down]",
  "233:1": "minecraft:red_shulker_box[facing=up]",
  "233:2": "minecraft:red_shulker_box[facing=north]",
  "233:3": "minecraft:red_shulker_box[facing=south]",
  "233:4": "minecraft:red_shulker_box[facing=west]",
  "233:5": "minecraft:red_shulker_box[facing=east]",
  "234:0": "minecraft:black_shulker_box[facing=down]",
  "234:1": "minecraft:black_shulker_box[facing=up]",
  "234:2": "minecraft:black_shulker_box[facing=north]",
  "234:3": "minecraft:black_shulker_box[facing=south]",
  "234:4": "minecraft:black_shulker_box[facing=west]",
  "234:5": "minecraft:black_shulker_box[facing=east]",
  "235:0": "minecraft:white_glazed_terracotta[facing=south]",
  "235:1": "minecraft:white_glazed_terracotta[facing=west]",
  "235:2": "minecraft:white_glazed_terracotta[facing=north]",
  "235:3": "minecraft:white_glazed_terracotta[facing=east]",
  "236:0": "minecraft:orange_glazed_terracotta[facing=south]",
  "236:1": "minecraft:orange_glazed_terracotta[facing=west]",
  "236:2": "minecraft:orange_glazed_terracotta[facing=north]",
  "236:3": "minecraft:orange_glazed_terracotta[facing=east]",
  "237:0": "minecraft:magenta_glazed_terracotta[facing=south]",
  "237:1": "minecraft:magenta_glazed_terracotta[facing=west]",
  "237:2": "minecraft:magenta_glazed_terracotta[facing=north]",
  "237:3": "minecraft:magenta_glazed_terracotta[facing=east]",
  "238:0": "minecraft:light_blue_glazed_terracotta[facing=south]",
  "238:1": "minecraft:light_blue_glazed_terracotta[facing=west]",
  "238:2": "minecraft:light_blue_glazed_terracotta[facing=north]",
  "238:3": "minecraft:light_blue_glazed_terracotta[facing=east]",
  "239:0": "minecraft:yellow_glazed_terracotta[facing=south]",
  "239:1": "minecraft:yellow_glazed_terracotta[facing=west]",
  "239:2": "minecraft:yellow_glazed_terracotta[facing=north]",
  "239:3": "minecraft:yellow_glazed_terracotta[facing=east]",
  "240:0": "minecraft:lime_glazed_terracotta[facing=south]",
  "240:1": "minecraft:lime_glazed_terracotta[facing=west]",
  "240:2": "minecraft:lime_glazed_terracotta[facing=north]",
  "240:3": "minecraft:lime_glazed_terracotta[facing=east]",
  "241:0": "minecraft:pink_glazed_terracotta[facing=south]",
  "241:1": "minecraft:pink_glazed_terracotta[facing=west]",
  "241:2": "minecraft:pink_glazed_terracotta[facing=north]",
  "241:3": "minecraft:pink_glazed_terracotta[facing=east]",
  "242:0": "minecraft:gray_glazed_terracotta[facing=south]",
  "242:1": "minecraft:gray_glazed_terracotta[facing=west]",
  "242:2": "minecraft:gray_glazed_terracotta[facing=north]",
  "242:3": "minecraft:gray_glazed_terracotta[facing=east]",
  "243:0": "minecraft:light_gray_glazed_terracotta[facing=south]",
  "243:1": "minecraft:light_gray_glazed_terracotta[facing=west]",
  "243:2": "minecraft:light_gray_glazed_terracotta[facing=north]",
  "243:3": "minecraft:light_gray_glazed_terracotta[facing=east]",
  "244:0": "minecraft:cyan_glazed_terracotta[facing=south]",
  "244:1": "minecraft:cyan_glazed_terracotta[facing=west]",
  "244:2": "minecraft:cyan_glazed_terracotta[facing=north]",
  "244:3": "minecraft:cyan_glazed_terracotta[facing=east]",
  "245:0": "minecraft:purple_glazed_terracotta[facing=south]",
  "245:1": "minecraft:purple_glazed_terracotta[facing=west]",
  "245:2": "minecraft:purple_glazed_terracotta[facing=north]",
  "245:3": "minecraft:purple_glazed_terracotta[facing=east]",
  "246:0": "minecraft:blue_glazed_terracotta[facing=south]",
  "246:1": "minecraft:blue_glazed_terracotta[facing=west]",
  "246:2": "minecraft:blue_glazed_terracotta[facing=north]",
  "246:3": "minecraft:blue_glazed_terracotta[facing=east]",
  "247:0": "minecraft:brown_glazed_terracotta[facing=south]",
  "247:1": "minecraft:brown_glazed_terracotta[facing=west]",
  "247:2": "minecraft:brown_glazed_terracotta[facing=north]",
  "247:3": "minecraft:brown_glazed_terracotta[facing=east]",
  "248:0": "minecraft:green_glazed_terracotta[facing=south]",
  "248:1": "minecraft:green_glazed_terracotta[facing=west]",
  "248:2": "minecraft:green_glazed_terracotta[facing=north]",
  "248:3": "minecraft:green_glazed_terracotta[facing=east]",
  "249:0": "minecraft:red_glazed_terracotta[facing=south]",
  "249:1": "minecraft:red_glazed_terracotta[facing=west]",
  "249:2": "minecraft:red_glazed_terracotta[facing=north]",
  "249:3": "minecraft:red_glazed_terracotta[facing=east]",
  "250:0": "minecraft:black_glazed_terracotta[facing=south]",
  "250:1": "minecraft:black_glazed_terracotta[facing=west]",
  "250:2": "minecraft:black_glazed_terracotta[facing=north]",
  "250:3": "minecraft:black_glazed_terracotta[facing=east]",
  "251:0": "minecraft:white_concrete",
  "251:1": "minecraft:orange_concrete",
  "251:2": "minecraft:magenta_concrete",
  "251:3": "minecraft:light_blue_concrete",
  "251:4": "minecraft:yellow_concrete",
  "251:5": "minecraft:lime_concrete",
  "251:6": "minecraft:pink_concrete",
  "251:7": "minecraft:gray_concrete",
  "251:8": "minecraft:light_gray_concrete",
  "251:9": "minecraft:cyan_concrete",
  "251:10": "minecraft:purple_concrete",
  "251:11": "minecraft:blue_concrete",
  "251:12": "minecraft:brown_concrete",
  "251:13": "minecraft:green_concrete",
  "251:14": "minecraft:red_concrete",
  "251:15": "minecraft:black_concrete",
  "252:0": "minecraft:white_concrete_powder",
  "252:1": "minecraft:orange_concrete_powder",
  "252:2": "minecraft:magenta_concrete_powder",
  "252:3": "minecraft:light_blue_concrete_powder",
  "252:4": "minecraft:yellow_concrete_powder",
  "252:5": "minecraft:lime_concrete_powder",
  "252:6": "minecraft:pink_concrete_powder",
  "252:7": "minecraft:gray_concrete_powder",
  "252:8": "minecraft:light_gray_concrete_powder",
  "252:9": "minecraft:cyan_concrete_powder",
  "252:10": "minecraft:purple_concrete_powder",
  "252:11": "minecraft:blue_concrete_powder",
  "252:12": "minecraft:brown_concrete_powder",
  "252:13": "minecraft:green_concrete_powder",
  "252:14": "minecraft:red_concrete_powder",
  "252:15": "minecraft:black_concrete_powder",
  "255:0": "minecraft:structure_block[mode=save]",
  "255:1": "minecraft:structure_block[mode=load]",
  "255:2": "minecraft:structure_block[mode=corner]",
  "255:3": "minecraft:structure_block[mode=data]"
};

// apps/server/src/schematic/legacyBlocks.ts
var mapping = legacy_blocks_default;
function legacyBlockState(id, data) {
  const state = mapping[`${id}:${data}`];
  return state?.replace(/shape=[a-z_]+/, "shape=straight");
}
function canonical(state) {
  const [name, props] = state.replace(/\]$/, "").split("[");
  return `${name}[${(props ?? "").split(",").filter(Boolean).sort().join(",")}]`;
}
var reverse = /* @__PURE__ */ new Map();
for (const key of Object.keys(mapping)) {
  const [id, data] = key.split(":").map(Number);
  const state = legacyBlockState(id, data);
  if (!reverse.has(canonical(state)) || id === 9 || id === 11)
    reverse.set(canonical(state), { id, data });
}
function mappedLegacyBlock(state) {
  return reverse.get(canonical(state));
}

// apps/server/src/schematic/readSchematic.ts
var MAX_IMPORT_BYTES = 32 * 1024 * 1024;
var MAX_NBT_BYTES = 128 * 1024 * 1024;
function field(root, name, type, optional = false) {
  const tag = root[name];
  if (!tag && optional) return void 0;
  if (!tag || tag.type !== type) throw new Error(`\u5B57\u6BB5 ${name} \u5E94\u4E3A ${type}\u3002`);
  return tag.value;
}
function compounds(root, name) {
  const list = field(root, name, "list", true);
  if (!list) return [];
  if (!Array.isArray(list.value) || list.value.length && list.type !== "compound") {
    throw new Error(`\u5B57\u6BB5 ${name} \u4E0D\u662F compound \u5217\u8868\u3002`);
  }
  return list.value;
}
function readSchematic(buffer, filename = "Imported.schematic") {
  if (!buffer.length) throw new HttpError(400, "\u539F\u7406\u56FE\u6587\u4EF6\u4E3A\u7A7A\u3002");
  if (buffer.length > MAX_IMPORT_BYTES) throw new HttpError(413, "\u539F\u7406\u56FE\u6587\u4EF6\u4E0D\u80FD\u8D85\u8FC7 32 MiB\u3002");
  try {
    const raw = buffer[0] === 31 && buffer[1] === 139 ? gunzipSync(buffer, { maxOutputLength: MAX_NBT_BYTES }) : buffer;
    if (raw[0] !== 10) throw new Error("\u6587\u4EF6\u4E0D\u662F Java NBT \u539F\u7406\u56FE\u3002");
    const parsed = nbt.parseUncompressed(raw, "big");
    const root = parsed.value;
    if (root.Version || root.Schematic) {
      throw new Error(
        "\u76EE\u524D\u5BFC\u5165\u652F\u6301 MCEdit / WorldEdit 6 \u7684 .schematic\uFF1BSponge .schem \u8BF7\u5148\u8F6C\u6362\u4E3A\u65E7\u7248\u683C\u5F0F\u3002"
      );
    }
    if (field(root, "Materials", "string") !== "Alpha")
      throw new Error("\u4EC5\u652F\u6301 Materials=Alpha \u7684\u539F\u7406\u56FE\u3002");
    const size = {
      x: Number(field(root, "Width", "short")),
      y: Number(field(root, "Height", "short")),
      z: Number(field(root, "Length", "short"))
    };
    const count = size.x * size.y * size.z;
    if (Object.values(size).some((n) => !Number.isInteger(n) || n <= 0) || count > 2e6) {
      throw new Error("\u539F\u7406\u56FE\u5C3A\u5BF8\u65E0\u6548\u6216\u4F53\u79EF\u8D85\u8FC7 2,000,000 \u65B9\u5757\uFF0C\u8BF7\u7F29\u5C0F\u9009\u533A\u540E\u5BFC\u5165\u3002");
    }
    const blocks = field(root, "Blocks", "byteArray");
    const data = field(root, "Data", "byteArray");
    const add = field(root, "AddBlocks", "byteArray", true);
    if (blocks.length !== count || data.length !== count || add && add.length !== Math.ceil(count / 2)) {
      throw new Error("\u65B9\u5757\u6570\u7EC4\u957F\u5EA6\u4E0E\u539F\u7406\u56FE\u5C3A\u5BF8\u4E0D\u4E00\u81F4\uFF0C\u6587\u4EF6\u53EF\u80FD\u5DF2\u635F\u574F\u3002");
    }
    if (data.some((n) => n < 0 || n > 15)) throw new Error("\u65B9\u5757 Data \u5FC5\u987B\u5728 0\u201315 \u8303\u56F4\u5185\u3002");
    const basename2 = filename.split(/[\\/]/).pop().slice(0, 200);
    const spec = {
      id: `import-${randomUUID()}`,
      name: basename2.replace(/\.[^.]+$/, "") || "Imported schematic",
      minecraftVersion: "1.12.2",
      size,
      origin: {
        x: Number(field(root, "WEOffsetX", "int", true) ?? 0),
        y: Number(field(root, "WEOffsetY", "int", true) ?? 0),
        z: Number(field(root, "WEOffsetZ", "int", true) ?? 0)
      },
      palette: {},
      operations: [],
      base: {
        size: { ...size },
        palette: [],
        runs: [],
        blockEntities: [],
        entities: compounds(root, "Entities"),
        source: {
          filename: basename2,
          format: "mcedit",
          warnings: [],
          extraNbt: Object.fromEntries(
            Object.entries(root).filter(
              ([key]) => ![
                "Materials",
                "Width",
                "Height",
                "Length",
                "Blocks",
                "Data",
                "AddBlocks",
                "TileEntities",
                "Entities",
                "WEOriginX",
                "WEOriginY",
                "WEOriginZ",
                "WEOffsetX",
                "WEOffsetY",
                "WEOffsetZ"
              ].includes(key)
            )
          ),
          worldOrigin: ["WEOriginX", "WEOriginY", "WEOriginZ"].map(
            (key) => Number(field(root, key, "int", true) ?? 0)
          )
        }
      }
    };
    const base = spec.base;
    const palette = /* @__PURE__ */ new Map();
    const indices = new Uint16Array(count);
    const unknown = /* @__PURE__ */ new Set();
    for (let i = 0; i < count; i++) {
      const high = (add?.[i >> 1] ?? 0) >> (i & 1) * 4 & 15;
      const id = blocks[i] & 255 | high << 8;
      const meta = data[i];
      const encoded = id << 4 | meta;
      let index = palette.get(encoded);
      if (index === void 0) {
        index = base.palette.length;
        if (index >= 65535) throw new Error("\u539F\u7406\u56FE\u65B9\u5757\u72B6\u6001\u79CD\u7C7B\u8FC7\u591A\u3002");
        palette.set(encoded, index);
        let state = legacyBlockState(id, meta);
        if (!state) {
          unknown.add(`${id}:${meta}`);
          state = id === 0 ? "minecraft:air" : `legacy:block_${id}[data=${meta}]`;
        }
        const key = `b${index}`;
        spec.palette[key] = state;
        base.palette.push({ block: key, legacy: { id, data: meta, state } });
      }
      indices[i] = index;
      const last = base.runs.at(-1);
      if (last?.[0] === index) last[1]++;
      else base.runs.push([index, 1]);
    }
    for (const tile of compounds(root, "TileEntities")) {
      const pos = ["x", "y", "z"].map((key) => Number(field(tile, key, "int")));
      if (pos.some((n, axis) => n < 0 || n >= [size.x, size.y, size.z][axis])) {
        throw new Error(`\u65B9\u5757\u5B9E\u4F53\u5750\u6807\u8D85\u51FA\u8303\u56F4\uFF1A[${pos.join(", ")}]\u3002`);
      }
      const index = pos[0] + size.x * (pos[2] + size.z * pos[1]);
      const state = spec.palette[base.palette[indices[index]].block];
      base.blockEntities.push({
        pos,
        id: String(field(tile, "id", "string")),
        block: state,
        nbt: tile
      });
    }
    if (unknown.size)
      base.source.warnings.push(
        `\u65E0\u6CD5\u8BC6\u522B\u7684\u65E7\u7248 ID/data\uFF08\u539F\u503C\u5DF2\u4FDD\u7559\uFF0C\u9884\u89C8\u4F7F\u7528\u5360\u4F4D\u65B9\u5757\uFF09\uFF1A${[...unknown].slice(0, 40).join(", ")}${unknown.size > 40 ? "\u2026" : ""}`
      );
    if (base.entities.length)
      base.source.warnings.push(
        `\u5DF2\u4FDD\u7559 ${base.entities.length} \u4E2A\u5B9E\u4F53\u7684 NBT\uFF1BThree.js \u6682\u4E0D\u663E\u793A\u751F\u7269\u3001\u76D4\u7532\u67B6\u7B49\u5B9E\u4F53\u3002`
      );
    if (root.SchematicaMapping)
      base.source.warnings.push(
        "\u6B64\u6587\u4EF6\u5305\u542B\u6A21\u7EC4\u65B9\u5757\u6620\u5C04\uFF1B\u9884\u89C8\u6309\u539F\u7248 1.12.2 \u89E3\u91CA\u6570\u5B57 ID\uFF0C\u8BF7\u5728\u76F8\u540C\u6A21\u7EC4\u73AF\u5883\u4E2D\u4F7F\u7528\u5BFC\u51FA\u6587\u4EF6\u3002"
      );
    return spec;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      `\u65E0\u6CD5\u5BFC\u5165\u539F\u7406\u56FE\uFF1A${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// apps/server/src/http/routes/sessionRoutes.ts
function registerSessionRoutes(app, sm) {
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: MAX_IMPORT_BYTES },
    (_request, body, done) => done(null, body)
  );
  app.post("/api/session/import", { bodyLimit: MAX_IMPORT_BYTES }, async (request) => {
    if (!Buffer.isBuffer(request.body))
      throw new HttpError(400, "\u8BF7\u4EE5 application/octet-stream \u4E0A\u4F20\u539F\u7406\u56FE\u6587\u4EF6\u3002");
    const query = request.query;
    return sm.importSchematic(request.body, query.filename || "Imported.schematic");
  });
  app.get("/api/session/build-spec.json", async (_request, reply) => {
    const spec = sm.current().spec;
    if (!spec) throw new HttpError(409, "\u6682\u65E0\u53EF\u4FDD\u5B58\u7684\u5EFA\u7B51\u3002");
    return reply.type("application/json").header("Content-Disposition", 'attachment; filename="buildSpec.json"').send(JSON.stringify(spec, null, 2));
  });
  app.post("/api/session/create", async () => {
    const session = sm.createSession();
    return { sessionId: session.id };
  });
  app.get("/api/session/current", async () => sm.current());
  app.get("/api/session/summary", async () => {
    const { spec, ...summary } = sm.current();
    return { ...summary, importedFrom: spec?.base?.source.filename };
  });
  app.post(
    "/api/session/build",
    { bodyLimit: 128 * 1024 * 1024 },
    async (request) => sm.build(request.body)
  );
  app.post("/api/session/validate", async (request) => sm.validate(request.body));
  app.post("/api/session/apply-patch", async (request) => {
    const body = request.body;
    const patch = Array.isArray(body) ? body : body?.patch;
    return sm.applyPatch(patch);
  });
  app.get("/api/session/preview-data", async () => sm.getPreviewData());
  app.get("/api/session/preview.png", async (_request, reply) => {
    const png = await sm.renderImage();
    return reply.type("image/png").send(png);
  });
  app.get("/api/session/list", async () => sm.list());
  app.post("/api/session/select", async (request) => {
    const { sessionId } = request.body ?? {};
    sm.select(String(sessionId ?? ""));
    return { ok: true };
  });
  app.post("/api/session/delete", async (request) => {
    const { sessionId } = request.body ?? {};
    sm.deleteSession(String(sessionId ?? ""));
    return { ok: true };
  });
}

// apps/server/src/resourcepacks/ResourcePackManager.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readdirSync as readdirSync2, statSync as statSync2 } from "node:fs";
import { join as join5 } from "node:path";

// apps/server/src/resourcepacks/PackSource.ts
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync as realpathSync2, statSync } from "node:fs";
import { isAbsolute as isAbsolute2, join as join3, relative as relative2, resolve as resolve3 } from "node:path";
import AdmZip from "adm-zip";
var MAX_ARCHIVE = 256 * 1024 * 1024;
var MAX_ENTRY = 32 * 1024 * 1024;
var MAX_ENTRIES = 4e4;
var MAX_TOTAL = 512 * 1024 * 1024;
var digest = (value) => createHash("sha256").update(value).digest("hex").slice(0, 20);
function resourcePath(path) {
  if (!path || path.includes("\\") || path.includes("\0") || path.includes(":") || path.startsWith("/") || path.split("/").some((p) => p === ".." || p === "." || p === "")) {
    throw new Error("Invalid resource path");
  }
  return path;
}
function jsonRoot(names, vanilla) {
  if (vanilla || names.has("pack.mcmeta")) return "";
  const roots = [...names].filter((n) => /^[^/]+\/pack\.mcmeta$/.test(n));
  if (roots.length === 1) return roots[0].slice(0, -"pack.mcmeta".length);
  throw new Error("\u7F3A\u5C11 pack.mcmeta\uFF0C\u8BF7\u5C06 pack.mcmeta \u548C assets \u653E\u5728\u6750\u8D28\u5305\u6839\u76EE\u5F55\u3002");
}
function zipSource(path, vanilla = false) {
  if (statSync(path).size > MAX_ARCHIVE) throw new Error("ZIP \u8D85\u8FC7 256 MB\uFF0C\u9996\u7248\u6682\u4E0D\u652F\u6301\u3002");
  const bytes = readFileSync(path);
  const zip = new AdmZip(bytes);
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) throw new Error("\u6750\u8D28\u5305\u6587\u4EF6\u6570\u91CF\u8FC7\u591A\u3002");
  const all = /* @__PURE__ */ new Map();
  let total = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = resourcePath(entry.entryName);
    if (name.includes("\uFFFD")) throw new Error("ZIP \u5185\u6587\u4EF6\u540D\u7F16\u7801\u5F02\u5E38\uFF0C\u8BF7\u4F7F\u7528 UTF-8 \u91CD\u65B0\u538B\u7F29\u3002");
    if (all.has(name)) throw new Error(`ZIP \u5185\u5B58\u5728\u91CD\u540D\u6587\u4EF6\uFF1A${name}`);
    if ((entry.header.flags & 1) !== 0) throw new Error("\u6682\u4E0D\u652F\u6301\u52A0\u5BC6 ZIP\u3002");
    total += entry.header.size;
    if (total > MAX_TOTAL) throw new Error("\u6750\u8D28\u5305\u89E3\u538B\u540E\u8FC7\u5927\u3002");
    all.set(name, entry);
  }
  const root = jsonRoot(new Set(all.keys()), vanilla);
  const names = new Set(
    [...all.keys()].filter((n) => n.startsWith(root)).map((n) => n.slice(root.length))
  );
  return {
    revision: digest(bytes),
    names,
    read(path2) {
      resourcePath(path2);
      const entry = all.get(root + path2);
      if (!entry) return null;
      if (entry.header.size > MAX_ENTRY) throw new Error(`\u8D44\u6E90\u6587\u4EF6\u8D85\u8FC7 32 MB\uFF1A${path2}`);
      return entry.getData();
    }
  };
}
function folderSource(path) {
  const root = realpathSync2(path);
  const files = /* @__PURE__ */ new Map();
  function walk(dir, prefix2, depth) {
    if (depth > 24) throw new Error("\u6750\u8D28\u5305\u76EE\u5F55\u5C42\u7EA7\u8FC7\u6DF1\u3002");
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const name = prefix2 + item.name;
      resourcePath(name);
      if (item.isDirectory()) walk(join3(dir, item.name), name + "/", depth + 1);
      else if (item.isFile()) {
        const stat = statSync(join3(dir, item.name));
        files.set(name, { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs });
        if (files.size > MAX_ENTRIES) throw new Error("\u6750\u8D28\u5305\u6587\u4EF6\u6570\u91CF\u8FC7\u591A\u3002");
      }
    }
  }
  walk(root, "", 0);
  const prefix = jsonRoot(new Set(files.keys()), false);
  return {
    revision: digest(JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b)))),
    names: new Set(
      [...files.keys()].filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length))
    ),
    read(path2) {
      resourcePath(path2);
      const name = prefix + path2;
      const expected = files.get(name);
      if (!expected) return null;
      const file = resolve3(root, name);
      const actual = realpathSync2(file);
      const rel = relative2(root, actual);
      if (isAbsolute2(rel) || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\"))
        throw new Error("Invalid resource path");
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expected.size || stat.mtimeMs !== expected.mtimeMs || stat.ctimeMs !== expected.ctimeMs) {
        throw new Error("\u6750\u8D28\u5305\u6B63\u5728\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u5217\u8868\u540E\u91CD\u8BD5\u3002");
      }
      if (stat.size > MAX_ENTRY) throw new Error(`\u8D44\u6E90\u6587\u4EF6\u8D85\u8FC7 32 MB\uFF1A${path2}`);
      return readFileSync(file);
    }
  };
}
function readJson(bytes, name) {
  if (!bytes) throw new Error(`\u7F3A\u5C11\u8D44\u6E90\uFF1A${name}`);
  if (bytes.length > 2 * 1024 * 1024) throw new Error(`JSON \u6587\u4EF6\u8FC7\u5927\uFF1A${name}`);
  try {
    return JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`JSON \u683C\u5F0F\u9519\u8BEF\uFF1A${name}`);
  }
}

// apps/server/src/resourcepacks/PackPreference.ts
import { readFileSync as readFileSync2, renameSync, writeFileSync as writeFileSync2, unlinkSync } from "node:fs";
import { join as join4 } from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";
var PackPreference = class {
  file;
  constructor(directory) {
    this.file = join4(directory, ".preview-settings.json");
  }
  read() {
    let text;
    try {
      text = readFileSync2(this.file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new HttpError(500, "\u65E0\u6CD5\u8BFB\u53D6\u5DF2\u4FDD\u5B58\u7684\u6750\u8D28\u5305\u9009\u62E9\u3002");
    }
    try {
      const data = JSON.parse(text);
      if (typeof data.selectedPackId !== "string" || !data.selectedPackId || data.selectedPackId.length > 128)
        throw new Error("Invalid selection");
      return data.selectedPackId;
    } catch {
      throw new HttpError(500, "\u6750\u8D28\u5305\u9009\u62E9\u914D\u7F6E\u635F\u574F\uFF1B\u672A\u8986\u76D6\u539F\u6587\u4EF6\u3002");
    }
  }
  save(selectedPackId) {
    if (this.read() === selectedPackId) return;
    const temporary = `${this.file}.${randomUUID2()}.tmp`;
    try {
      writeFileSync2(temporary, JSON.stringify({ version: 1, selectedPackId }, null, 2), {
        flag: "wx"
      });
      renameSync(temporary, this.file);
    } catch {
      throw new HttpError(500, "\u65E0\u6CD5\u4FDD\u5B58\u6750\u8D28\u5305\u9009\u62E9\uFF1B\u8BF7\u68C0\u67E5\u6750\u8D28\u5305\u76EE\u5F55\u662F\u5426\u53EF\u5199\u3002");
    } finally {
      try {
        unlinkSync(temporary);
      } catch {
      }
    }
  }
};

// apps/server/src/resourcepacks/ResourcePackManager.ts
var stripFormatting = (value) => value.replace(/§[0-9a-fk-or]/gi, "").trim();
var ResourcePackManager = class {
  constructor(directory, vanillaJar) {
    this.directory = directory;
    this.vanillaJar = vanillaJar;
    mkdirSync2(directory, { recursive: true });
    this.preference = new PackPreference(directory);
  }
  installed = /* @__PURE__ */ new Map();
  base = null;
  baseFingerprint = "";
  baseError = "";
  preference;
  list(force = false) {
    try {
      const stat = statSync2(this.vanillaJar);
      const stamp = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      if (force || stamp !== this.baseFingerprint) {
        const base = zipSource(this.vanillaJar, true);
        if (!base.names.has("assets/minecraft/blockstates/stone.json") || !base.names.has("assets/minecraft/textures/blocks/stone.png")) {
          throw new Error("\u539F\u7248\u5E95\u5C42\u8D44\u6E90\u5FC5\u987B\u6765\u81EA Minecraft Java 1.12.2 \u5BA2\u6237\u7AEF JAR\u3002");
        }
        this.base = base;
        this.baseFingerprint = stamp;
      }
      this.baseError = "";
    } catch (error) {
      this.base = null;
      this.baseFingerprint = "";
      this.baseError = existsSync3(this.vanillaJar) ? error instanceof Error ? error.message : String(error) : "\u5C1A\u672A\u914D\u7F6E 1.12.2 \u539F\u7248\u5E95\u5C42\u8D44\u6E90\u3002\u8BF7\u5C06\u5BA2\u6237\u7AEF JAR \u653E\u5165 resourcepacks/.base/minecraft-1.12.2.jar\u3002";
    }
    const found = /* @__PURE__ */ new Set();
    for (const item of readdirSync2(this.directory, { withFileTypes: true })) {
      if (item.name.startsWith(".") || item.isSymbolicLink()) continue;
      if (!item.isDirectory() && !(item.isFile() && /\.zip$/i.test(item.name))) continue;
      const id = digest(item.name);
      found.add(id);
      const path = join5(this.directory, item.name);
      let fingerprint = "";
      try {
        const stat = statSync2(path);
        fingerprint = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
        const previous = this.installed.get(id);
        if (!force && item.isFile() && previous?.fingerprint === fingerprint) continue;
        const source = item.isDirectory() ? folderSource(path) : zipSource(path);
        const meta = readJson(
          source.read("pack.mcmeta"),
          "pack.mcmeta"
        );
        if (meta?.pack?.pack_format !== 3)
          throw new Error("\u9996\u7248\u4EC5\u652F\u6301 1.12.2 \u6750\u8D28\u5305\uFF08pack_format \u5FC5\u987B\u4E3A 3\uFF09\u3002");
        const description = typeof meta.pack.description === "string" ? stripFormatting(meta.pack.description) : "";
        const info = {
          id,
          name: stripFormatting(item.name.replace(/\.zip$/i, "")),
          description,
          revision: source.revision,
          kind: item.isDirectory() ? "folder" : "zip",
          status: "ready"
        };
        this.installed.set(id, { info, source, fingerprint });
      } catch (error) {
        this.installed.set(id, {
          fingerprint,
          info: {
            id,
            name: stripFormatting(item.name),
            description: "",
            revision: digest(fingerprint),
            kind: item.isDirectory() ? "folder" : "zip",
            status: "error",
            error: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }
    for (const id of this.installed.keys()) if (!found.has(id)) this.installed.delete(id);
    const packs = [
      {
        id: "builtin",
        name: "Pixel Perfection CE\uFF08\u9879\u76EE\u5185\u7F6E\uFF09",
        description: "",
        revision: "builtin",
        kind: "builtin",
        status: "ready"
      },
      {
        id: "vanilla",
        name: "Minecraft 1.12.2 \u539F\u7248",
        description: "",
        revision: this.base?.revision ?? "missing",
        kind: "vanilla",
        status: this.base ? "ready" : "error",
        ...this.baseError ? { error: this.baseError } : {}
      }
    ];
    for (const pack of [...this.installed.values()].sort(
      (a, b) => a.info.name.localeCompare(b.info.name)
    )) {
      const revision = digest(`${pack.info.revision}:${this.base?.revision ?? "missing"}`);
      packs.push({
        ...pack.info,
        revision,
        ...pack.source?.names.has("pack.png") ? { iconUrl: this.assetUrl(pack.info.id, revision, "pack.png") } : {}
      });
    }
    return {
      directory: this.directory,
      minecraftVersion: "1.12.2",
      selectedPackId: this.preference.read(),
      baseReady: !!this.base,
      ...this.baseError ? { baseError: this.baseError } : {},
      packs
    };
  }
  select(packId) {
    const list = this.list();
    const pack = list.packs.find((item) => item.id === packId);
    if (!pack || pack.status !== "ready" || packId !== "builtin" && !list.baseReady)
      throw new HttpError(400, "\u6750\u8D28\u5305\u4E0D\u53EF\u7528\uFF0C\u672A\u66F4\u6539\u5DF2\u4FDD\u5B58\u7684\u9009\u62E9\u3002");
    this.preference.save(packId);
    return { selectedPackId: packId };
  }
  assetUrl(id, revision, path) {
    return `/api/resource-packs/${id}/${revision}/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  resources(id, revision) {
    if (id === "builtin") throw new HttpError(400, "\u5185\u7F6E\u6750\u8D28\u7531\u7F51\u9875\u76F4\u63A5\u52A0\u8F7D\u3002");
    const pack = id === "vanilla" ? void 0 : this.installed.get(id);
    if (id !== "vanilla" && (!pack || !pack.source || pack.info.status !== "ready")) {
      throw new HttpError(404, "\u6750\u8D28\u5305\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5237\u65B0\u5217\u8868\u3002");
    }
    const actualRevision = id === "vanilla" ? this.base?.revision : digest(`${pack.info.revision}:${this.base?.revision ?? "missing"}`);
    if (revision !== actualRevision) throw new HttpError(409, "\u6750\u8D28\u5305\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u5217\u8868\u540E\u91CD\u8BD5\u3002");
    if (!this.base) throw new HttpError(409, this.baseError || "\u7F3A\u5C11 1.12.2 \u539F\u7248\u5E95\u5C42\u8D44\u6E90\u3002");
    const base = this.base;
    return {
      packId: id,
      revision,
      read(path) {
        resourcePath(path);
        const own = pack?.source?.read(path);
        if (own) return { bytes: own, source: "pack" };
        const original = base.read(path);
        return original ? { bytes: original, source: "vanilla" } : null;
      },
      url: (path) => this.assetUrl(id, revision, path)
    };
  }
  icon(id, revision) {
    const pack = this.installed.get(id);
    if (!pack?.source || digest(`${pack.info.revision}:${this.base?.revision ?? "missing"}`) !== revision)
      return null;
    return pack.source.read("pack.png");
  }
};

// apps/server/src/resourcepacks/legacyState.ts
var ALIASES = {
  grass_block: "grass",
  short_grass: "tall_grass",
  grass: "grass",
  bricks: "brick_block",
  stone_bricks: "stonebrick",
  cobblestone_stairs: "stone_stairs",
  mossy_stone_bricks: "mossy_stonebrick",
  cracked_stone_bricks: "cracked_stonebrick",
  chiseled_stone_bricks: "chiseled_stonebrick",
  nether_bricks: "nether_brick",
  red_nether_bricks: "red_nether_brick",
  end_stone_bricks: "end_bricks",
  terracotta: "hardened_clay",
  snow: "snow_layer",
  snow_block: "snow",
  smooth_stone: "stone_double_slab",
  smooth_sandstone: "smooth_sandstone",
  smooth_red_sandstone: "smooth_red_sandstone",
  cut_sandstone: "sandstone",
  cut_red_sandstone: "red_sandstone",
  chiseled_quartz_block: "chiseled_quartz_block",
  quartz_pillar: "quartz_column",
  polished_granite: "smooth_granite",
  polished_diorite: "smooth_diorite",
  polished_andesite: "smooth_andesite",
  cobweb: "web",
  lily_pad: "waterlily",
  spawner: "mob_spawner",
  oak_fence: "fence",
  oak_fence_gate: "fence_gate",
  oak_door: "wooden_door",
  oak_trapdoor: "trapdoor",
  oak_button: "wooden_button",
  oak_pressure_plate: "wooden_pressure_plate",
  redstone_torch: "redstone_torch",
  wall_torch: "torch",
  redstone_wall_torch: "redstone_torch",
  dandelion: "dandelion",
  poppy: "poppy",
  sugar_cane: "reeds"
};
function legacyState(state) {
  const match = /^(?:minecraft:)?([a-z0-9_]+)(?:\[([^\]]*)\])?$/.exec(state);
  if (!match) throw new Error("\u9996\u7248\u4EC5\u652F\u6301 Minecraft 1.12.2 \u7684\u539F\u7248\u65B9\u5757\u3002");
  const original = match[1];
  const properties = {
    facing: "north",
    half: "bottom",
    shape: "straight",
    axis: "y",
    snowy: "false",
    north: "false",
    east: "false",
    south: "false",
    west: "false",
    up: "true",
    open: "false",
    powered: "false",
    in_wall: "false",
    hinge: "left",
    layers: "1"
  };
  for (const part of (match[2] ?? "").split(",")) {
    const [key, value] = part.split("=");
    if (key && value && key !== "__proto__") properties[key] = value;
  }
  let name = ALIASES[original] ?? original;
  name = name.replace(/^light_gray_/, "silver_");
  if (!name.endsWith("_glazed_terracotta"))
    name = name.replace(/_terracotta$/, "_stained_hardened_clay");
  if (original.endsWith("_slab")) {
    const material = original.slice(0, -5);
    const slabs = {
      stone: "stone",
      smooth_stone: "stone",
      stone_brick: "stone_brick",
      brick: "brick",
      quartz: "quartz",
      nether_brick: "nether_brick",
      sandstone: "sandstone",
      red_sandstone: "red_sandstone",
      cobblestone: "cobblestone",
      purpur: "purpur",
      oak: "oak",
      // Legacy stone slab variant 2 (IDs 44/43), distinct from wooden slabs (126/125).
      petrified_oak: "wood_old",
      spruce: "spruce",
      birch: "birch",
      jungle: "jungle",
      acacia: "acacia",
      dark_oak: "dark_oak"
    };
    if (slabs[material])
      name = `${slabs[material]}_${properties.type === "double" ? "double_" : ""}slab`;
    if (properties.type === "top") properties.half = "top";
  }
  if (original === "furnace" && properties.lit === "true") name = "lit_furnace";
  if (original === "redstone_lamp" && properties.lit === "true") name = "lit_redstone_lamp";
  return { name, properties };
}

// apps/server/src/resourcepacks/resolveAppearance.ts
var DIRECTIONS = ["east", "west", "up", "down", "south", "north"];
function assetName(reference, kind) {
  const pieces = reference.split(":");
  const namespace = pieces.length === 2 ? pieces[0] : "minecraft";
  let name = pieces.length === 2 ? pieces[1] : reference;
  if (!/^[a-z0-9_.-]+$/.test(namespace) || !/^[a-z0-9_./!-]+$/.test(name) || name.includes(".."))
    throw new Error(`\u8D44\u6E90\u8DEF\u5F84\u4E0D\u652F\u6301\uFF1A${reference}`);
  if (kind === "models" && !name.includes("/")) name = `block/${name}`;
  return `assets/${namespace}/${kind}/${name}.${kind === "models" ? "json" : "png"}`;
}
function firstVariant(variant) {
  const first = Array.isArray(variant) ? variant[0] : variant;
  if (!first || typeof first.model !== "string") throw new Error("\u65B9\u5757\u6A21\u578B\u5F15\u7528\u65E0\u6548\u3002");
  return first;
}
function matches(condition, properties) {
  if (!condition) return true;
  return Object.entries(condition).every(([key, expected]) => {
    if (key === "OR" && Array.isArray(expected))
      return expected.some((c) => matches(c, properties));
    if (key === "AND" && Array.isArray(expected))
      return expected.every((c) => matches(c, properties));
    return (typeof expected === "string" || typeof expected === "boolean") && String(expected).split("|").includes(properties[key] ?? "false");
  });
}
function variantsFor(blockstate, properties) {
  if (Array.isArray(blockstate.multipart)) {
    return blockstate.multipart.filter((part) => matches(part.when, properties)).map((part) => firstVariant(part.apply));
  }
  const variants = Object.entries(blockstate.variants ?? {});
  const match = variants.find(
    ([key]) => key === "normal" || key === "" || key.split(",").every((part) => {
      const [k, v] = part.split("=");
      return !!k && properties[k] === v;
    })
  );
  if (!match) throw new Error("\u8BE5\u65B9\u5757\u72B6\u6001\u6682\u672A\u5339\u914D\u5230 1.12.2 \u6A21\u578B\u3002");
  return [firstVariant(match[1])];
}
function vec(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1024);
}
function validateElement(element) {
  if (!element || !vec(element.from) || !vec(element.to) || !element.faces || typeof element.faces !== "object")
    throw new Error("\u65B9\u5757\u6A21\u578B\u5750\u6807\u65E0\u6548\u3002");
  if (element.rotation && (!vec(element.rotation.origin) || !["x", "y", "z"].includes(element.rotation.axis) || !Number.isFinite(element.rotation.angle) || Math.abs(element.rotation.angle) > 45))
    throw new Error("\u65B9\u5757\u6A21\u578B\u65CB\u8F6C\u65E0\u6548\u3002");
}
function animationFrame(resources, path, bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error(`\u8D34\u56FE\u4E0D\u662F\u6709\u6548 PNG\uFF1A${path}`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16777216)
    throw new Error(`\u8D34\u56FE\u5C3A\u5BF8\u8FC7\u5927\uFF1A${path}`);
  const meta = resources.read(`${path}.mcmeta`);
  if (!meta) return void 0;
  const data = readJson(meta.bytes, `${path}.mcmeta`);
  if (!data.animation) return void 0;
  const animation = data.animation;
  const frameWidth = animation.width ?? width;
  const frameHeight = animation.height ?? frameWidth;
  const first = animation.frames?.[0] ?? 0;
  const index = typeof first === "number" ? first : first.index;
  if (![frameWidth, frameHeight, index].every(Number.isInteger) || frameWidth <= 0 || frameHeight <= 0 || index < 0 || width % frameWidth !== 0 || height % frameHeight !== 0 || index >= width / frameWidth * (height / frameHeight)) {
    throw new Error(`\u52A8\u753B\u5E27\u914D\u7F6E\u65E0\u6548\uFF1A${path}`);
  }
  return {
    x: index % (width / frameWidth) * frameWidth,
    y: Math.floor(index / (width / frameWidth)) * frameHeight,
    width: frameWidth,
    height: frameHeight
  };
}
function resolveAppearance(resources, states) {
  const result = {
    packId: resources.packId,
    revision: resources.revision,
    blocks: {},
    textures: {}
  };
  const models = /* @__PURE__ */ new Map();
  function modelFor(path, chain = []) {
    const water = /\/__preview_water_(\d+)\.json$/.exec(path);
    if (water) {
      const level = Number(water[1]);
      const height = level >= 8 ? 16 : 16 * (8 - level) / 9;
      return {
        custom: false,
        model: {
          textures: { all: "blocks/water_still" },
          elements: [
            {
              from: [0, 0, 0],
              to: [16, height, 16],
              faces: Object.fromEntries(
                DIRECTIONS.map((face) => [face, { texture: "#all", tintindex: 0 }])
              )
            }
          ]
        }
      };
    }
    if (chain.includes(path) || chain.length > 24) throw new Error("\u65B9\u5757\u6A21\u578B\u5B58\u5728\u5FAA\u73AF\u7EE7\u627F\u3002");
    const cached = models.get(path);
    if (cached) return cached;
    const resource = resources.read(path);
    const own = readJson(resource?.bytes ?? null, path);
    if (!own || typeof own !== "object") throw new Error(`\u65E0\u6548\u6A21\u578B\uFF1A${path}`);
    const parent = own.parent ? modelFor(assetName(own.parent, "models"), [...chain, path]) : null;
    const merged = {
      model: {
        ...parent?.model,
        ...own,
        textures: { ...parent?.model.textures, ...own.textures },
        elements: own.elements ?? parent?.model.elements
      },
      custom: resource?.source === "pack" || !!parent?.custom
    };
    models.set(path, merged);
    return merged;
  }
  for (const state of [...new Set(states)]) {
    try {
      const { name, properties } = legacyState(state);
      const blockstatePath = `assets/minecraft/blockstates/${name}.json`;
      const source = resources.read(blockstatePath);
      const water = name === "water" || name === "flowing_water";
      if (!source && !water) throw new Error("\u672A\u627E\u5230\u8BE5\u65B9\u5757\u7684 1.12.2 \u8D44\u6E90\uFF1B\u65B9\u5757 ID \u672A\u4F5C\u4FEE\u6539\u3002");
      const level = Math.max(0, Math.min(15, Number.parseInt(properties.level ?? "0", 10) || 0));
      const definition = source ? readJson(source.bytes, blockstatePath) : { variants: { normal: { model: `block/__preview_water_${level}` } } };
      let custom = source?.source === "pack";
      const parts = [];
      const localTextures = {};
      for (const variant of variantsFor(definition, properties)) {
        const resolved = modelFor(assetName(variant.model, "models"));
        custom ||= resolved.custom;
        const model = resolved.model;
        if (!Array.isArray(model.elements) || model.elements.length === 0)
          throw new Error("\u8BE5\u65B9\u5757\u4F7F\u7528\u7279\u6B8A\u6E32\u67D3\uFF0C\u9996\u7248\u6682\u4E0D\u652F\u6301\u3002");
        if (model.elements.length > 512) throw new Error("\u65B9\u5757\u6A21\u578B\u90E8\u4EF6\u8FC7\u591A\u3002");
        const elements = [];
        for (const element of model.elements) {
          validateElement(element);
          const faces = {};
          for (const direction of DIRECTIONS) {
            const face = element.faces[direction];
            if (!face) continue;
            let texture = face.texture;
            const seen = /* @__PURE__ */ new Set();
            while (typeof texture === "string" && texture.startsWith("#")) {
              if (seen.has(texture)) throw new Error("\u8D34\u56FE\u5F15\u7528\u5B58\u5728\u5FAA\u73AF\u3002");
              seen.add(texture);
              texture = model.textures?.[texture.slice(1)] ?? "";
            }
            if (!texture) throw new Error("\u6A21\u578B\u7F3A\u5C11\u8D34\u56FE\u5F15\u7528\u3002");
            const path = assetName(texture, "textures");
            let ref = localTextures[path] ?? result.textures[path];
            if (!ref) {
              const resource = resources.read(path);
              if (!resource) throw new Error(`\u7F3A\u5C11\u8D34\u56FE\uFF1A${path}`);
              ref = {
                url: resources.url(path),
                source: resource.source,
                frame: animationFrame(resources, path, resource.bytes)
              };
            }
            localTextures[path] = ref;
            custom ||= ref.source === "pack";
            if (face.uv && (!Array.isArray(face.uv) || face.uv.length !== 4 || !face.uv.every(Number.isFinite)))
              throw new Error("\u6A21\u578B\u8D34\u56FE\u5750\u6807\u65E0\u6548\u3002");
            if (face.rotation !== void 0 && ![0, 90, 180, 270].includes(face.rotation))
              throw new Error("\u6A21\u578B\u8D34\u56FE\u65CB\u8F6C\u65E0\u6548\u3002");
            faces[direction] = {
              texture: path,
              uv: face.uv,
              rotation: face.rotation,
              ...face.tintindex !== void 0 && face.tintindex >= 0 ? {
                tint: water ? "#3f76e4" : /spruce/.test(name) ? "#619961" : /birch/.test(name) ? "#80a755" : "#91bd59"
              } : {}
            };
          }
          elements.push({ from: element.from, to: element.to, rotation: element.rotation, faces });
        }
        if (![variant.x ?? 0, variant.y ?? 0].every((n) => Number.isFinite(n) && n % 90 === 0))
          throw new Error("\u65B9\u5757\u72B6\u6001\u65CB\u8F6C\u65E0\u6548\u3002");
        parts.push({
          elements,
          x: variant.x ?? 0,
          y: variant.y ?? 0,
          uvlock: variant.uvlock ?? false
        });
      }
      if (parts.length === 0) throw new Error("\u8BE5\u65B9\u5757\u72B6\u6001\u6CA1\u6709\u53EF\u663E\u793A\u6A21\u578B\u3002");
      result.blocks[state] = { parts, source: custom ? "pack" : "vanilla" };
      Object.assign(result.textures, localTextures);
    } catch (error) {
      result.blocks[state] = {
        parts: [],
        source: "missing",
        warning: error instanceof Error ? error.message : String(error)
      };
    }
  }
  return result;
}

// apps/server/src/http/routes/resourcePackRoutes.ts
import { join as join6 } from "node:path";
function registerResourcePackRoutes(app, config) {
  const directory = config.resourcePacksDir ?? join6(process.cwd(), "resourcepacks");
  const manager = new ResourcePackManager(
    directory,
    config.vanillaJar ?? join6(directory, ".base", "minecraft-1.12.2.jar")
  );
  manager.list();
  app.get(
    "/api/resource-packs",
    async (_request, reply) => reply.header("Cache-Control", "no-store").send(manager.list())
  );
  app.post(
    "/api/resource-packs/refresh",
    async (_request, reply) => reply.header("Cache-Control", "no-store").send(manager.list(true))
  );
  app.post("/api/resource-packs/selection", async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.packId !== "string" || !body.packId || body.packId.length > 128)
      throw new HttpError(400, "\u65E0\u6548\u7684\u6750\u8D28\u5305\u9009\u62E9\u3002");
    return reply.header("Cache-Control", "no-store").send(manager.select(body.packId));
  });
  app.post("/api/resource-packs/resolve", async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.packId !== "string" || typeof body.revision !== "string" || !Array.isArray(body.states) || body.states.length > 2048 || !body.states.every(
      (state) => typeof state === "string" && state.length <= 512 && state !== "__proto__"
    )) {
      throw new HttpError(400, "\u65E0\u6548\u7684\u6750\u8D28\u8BF7\u6C42\uFF08\u6700\u591A 2048 \u79CD\u65B9\u5757\u72B6\u6001\uFF09\u3002");
    }
    return reply.header("Cache-Control", "no-store").send(
      resolveAppearance(manager.resources(body.packId, body.revision), body.states)
    );
  });
  app.get(
    "/api/resource-packs/:id/:revision/assets/*",
    async (request, reply) => {
      const { id, revision } = request.params;
      const path = request.params["*"];
      if (path !== "pack.png" && (!path.startsWith("assets/") || !path.endsWith(".png")))
        throw new HttpError(404, "\u8D44\u6E90\u4E0D\u5B58\u5728\u3002");
      const bytes = path === "pack.png" ? manager.icon(id, revision) : manager.resources(id, revision).read(path)?.bytes;
      if (!bytes) throw new HttpError(404, "\u8D34\u56FE\u4E0D\u5B58\u5728\u3002");
      return reply.type("image/png").header("X-Content-Type-Options", "nosniff").header("Cache-Control", "public, max-age=31536000, immutable").send(bytes);
    }
  );
}

// apps/server/src/http/createHttpServer.ts
var BODY_LIMIT = 8 * 1024 * 1024;
async function createHttpServer(sm, config) {
  const app = Fastify({
    logger: config.mcpMode ? false : { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: BODY_LIMIT
  });
  app.setErrorHandler((error, _request, reply) => {
    const status = error.statusCode ?? statusCodeOf(error);
    reply.status(status).send({ error: messageOf(error) });
  });
  registerHealthRoutes(app);
  registerSessionRoutes(app, sm);
  registerExportRoutes(app, sm);
  registerProjectRoutes(app, sm);
  registerResourcePackRoutes(app, config);
  if (existsSync4(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      return reply.status(404).send({ error: `Not found: ${request.method} ${request.url}` });
    });
  }
  return app;
}

// apps/server/src/mcp/createMcpServer.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// packages/build-spec/src/schema.ts
import { z } from "zod";
var vec3 = z.tuple([z.number().int(), z.number().int(), z.number().int()]);
var boxOpSchema = z.object({
  type: z.literal("box"),
  from: vec3,
  to: vec3,
  block: z.string().min(1)
});
var hollowBoxOpSchema = z.object({
  type: z.literal("hollow_box"),
  from: vec3,
  to: vec3,
  block: z.string().min(1),
  thickness: z.number().int().positive().optional()
});
var wallRectOpSchema = z.object({
  type: z.literal("wall_rect"),
  from: vec3,
  to: vec3,
  block: z.string().min(1),
  hollow: z.boolean().optional()
});
var gableRoofOpSchema = z.object({
  type: z.literal("gable_roof"),
  from: vec3,
  to: vec3,
  axis: z.enum(["x", "z"]),
  block: z.string().min(1),
  overhang: z.number().int().nonnegative().optional()
});
var cylinderOpSchema = z.object({
  type: z.literal("cylinder"),
  center: vec3,
  radius: z.number().positive(),
  height: z.number().int().positive(),
  block: z.string().min(1),
  hollow: z.boolean().optional()
});
var windowPatternOpSchema = z.object({
  type: z.literal("window_pattern"),
  side: z.enum(["north", "south", "east", "west"]),
  y: z.number().int(),
  positions: z.array(z.number().int()),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  glassBlock: z.string().min(1),
  frameBlock: z.string().min(1).optional()
});
var sphereOpSchema = z.object({
  type: z.literal("sphere"),
  center: vec3,
  radius: z.number().positive(),
  block: z.string().min(1),
  hollow: z.boolean().optional()
});
var pyramidOpSchema = z.object({
  type: z.literal("pyramid"),
  from: vec3,
  to: vec3,
  block: z.string().min(1),
  hollow: z.boolean().optional()
});
var rampOpSchema = z.object({
  type: z.literal("ramp"),
  from: vec3,
  to: vec3,
  axis: z.enum(["x", "z"]),
  block: z.string().min(1)
});
var replaceOpSchema = z.object({
  type: z.literal("replace"),
  from: vec3,
  to: vec3,
  target: z.string().min(1),
  block: z.string().min(1)
});
var blockEntityOpSchema = z.object({
  type: z.literal("block_entity"),
  pos: vec3,
  block: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional()
});
var buildOperationSchema = z.discriminatedUnion("type", [
  boxOpSchema,
  hollowBoxOpSchema,
  wallRectOpSchema,
  gableRoofOpSchema,
  cylinderOpSchema,
  windowPatternOpSchema,
  sphereOpSchema,
  pyramidOpSchema,
  rampOpSchema,
  replaceOpSchema,
  blockEntityOpSchema
]);
var importedBaseSchema = z.object({
  size: z.object({
    x: z.number().int().positive(),
    y: z.number().int().positive(),
    z: z.number().int().positive()
  }),
  // Indices into this palette, run-length encoded in X-fastest/YZX order.
  palette: z.array(
    z.object({
      block: z.string().min(1),
      legacy: z.object({
        id: z.number().int().min(0).max(4095),
        data: z.number().int().min(0).max(15),
        state: z.string()
      }).optional()
    })
  ).min(1).max(65535),
  runs: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().positive()])),
  blockEntities: z.array(
    z.object({
      pos: vec3,
      id: z.string(),
      block: z.string(),
      nbt: z.record(z.string(), z.unknown())
    })
  ).default([]),
  // Keep typed NBT, including long/byte/list types, for lossless legacy re-export.
  entities: z.array(z.record(z.string(), z.unknown())).default([]),
  source: z.object({
    filename: z.string(),
    format: z.literal("mcedit"),
    worldOrigin: vec3.default([0, 0, 0]),
    warnings: z.array(z.string()).default([]),
    extraNbt: z.record(z.string(), z.unknown()).default({})
  })
});
var buildSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  minecraftVersion: z.string().min(1).default("1.12.2"),
  size: z.object({
    x: z.number().int().positive(),
    y: z.number().int().positive(),
    z: z.number().int().positive()
  }),
  origin: z.object({
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int()
  }).optional(),
  palette: z.record(z.string(), z.string()),
  operations: z.array(buildOperationSchema),
  base: importedBaseSchema.optional(),
  metadata: z.object({
    prompt: z.string().optional(),
    style: z.string().optional(),
    notes: z.array(z.string()).optional()
  }).optional()
});

// packages/build-spec/src/validateBuildSpec.ts
function validateBuildSpec(input) {
  const parsed = buildSpecSchema.safeParse(input);
  if (parsed.success) {
    return { success: true, data: parsed.data, errors: [] };
  }
  const errors = parsed.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { success: false, errors };
}

// packages/build-spec/src/examples.ts
var fantasyHouseDemo = {
  id: "fantasy-house",
  name: "Fantasy Cottage",
  minecraftVersion: "1.12.2",
  size: { x: 21, y: 16, z: 19 },
  palette: {
    foundation: "minecraft:cobblestone",
    wall: "minecraft:spruce_planks",
    roof: "minecraft:dark_oak_stairs",
    glass: "minecraft:glass_pane",
    frame: "minecraft:spruce_log"
  },
  operations: [
    { type: "box", from: [1, 0, 0], to: [19, 1, 15], block: "foundation" },
    { type: "hollow_box", from: [1, 2, 0], to: [19, 9, 15], block: "wall" },
    {
      type: "gable_roof",
      from: [1, 9, 0],
      to: [19, 15, 17],
      axis: "x",
      block: "roof",
      overhang: 1
    },
    {
      type: "window_pattern",
      side: "south",
      y: 4,
      positions: [4, 9, 14],
      width: 3,
      height: 4,
      glassBlock: "glass",
      frameBlock: "frame"
    }
  ],
  metadata: { style: "fantasy", prompt: "a cozy spruce cottage with a dark oak gable roof" }
};
var stoneWatchtower = {
  id: "stone-watchtower",
  name: "Stone Watchtower",
  minecraftVersion: "1.12.2",
  size: { x: 15, y: 26, z: 15 },
  palette: {
    base: "minecraft:cobblestone",
    wall: "minecraft:stone_bricks",
    cap: "minecraft:mossy_stone_bricks"
  },
  operations: [
    { type: "cylinder", center: [7, 0, 7], radius: 6, height: 1, block: "base" },
    { type: "cylinder", center: [7, 1, 7], radius: 6, height: 17, block: "wall", hollow: true },
    { type: "cylinder", center: [7, 18, 7], radius: 6, height: 1, block: "cap" },
    { type: "cylinder", center: [7, 19, 7], radius: 5, height: 1, block: "cap" },
    { type: "cylinder", center: [7, 20, 7], radius: 4, height: 1, block: "cap" },
    { type: "cylinder", center: [7, 21, 7], radius: 3, height: 1, block: "cap" },
    { type: "cylinder", center: [7, 22, 7], radius: 2, height: 1, block: "cap" },
    { type: "cylinder", center: [7, 23, 7], radius: 1, height: 2, block: "cap" }
  ],
  metadata: { style: "medieval" }
};
var logCabin = {
  id: "log-cabin",
  name: "Log Cabin",
  minecraftVersion: "1.12.2",
  size: { x: 17, y: 13, z: 15 },
  palette: {
    floor: "minecraft:spruce_planks",
    wall: "minecraft:spruce_log",
    roof: "minecraft:dark_oak_planks",
    rail: "minecraft:spruce_fence",
    glass: "minecraft:glass_pane"
  },
  operations: [
    { type: "box", from: [0, 0, 1], to: [12, 0, 13], block: "floor" },
    { type: "hollow_box", from: [0, 1, 1], to: [12, 7, 13], block: "wall" },
    {
      type: "gable_roof",
      from: [0, 7, 1],
      to: [12, 12, 13],
      axis: "z",
      block: "roof",
      overhang: 1
    },
    { type: "wall_rect", from: [13, 1, 1], to: [16, 1, 13], block: "rail", hollow: false },
    {
      type: "window_pattern",
      side: "east",
      y: 3,
      positions: [4, 9],
      width: 2,
      height: 3,
      glassBlock: "glass"
    }
  ],
  metadata: { style: "rustic" }
};
var featureShowcase = {
  id: "feature-showcase",
  name: "Feature Showcase",
  minecraftVersion: "1.12.2",
  size: { x: 25, y: 25, z: 25 },
  palette: {
    stone: "minecraft:stone",
    gold: "minecraft:gold_block",
    dome: "minecraft:glass",
    core: "minecraft:glowstone",
    path: "minecraft:smooth_stone"
  },
  operations: [
    { type: "pyramid", from: [0, 0, 0], to: [16, 8, 16], block: "stone" },
    { type: "replace", from: [0, 0, 0], to: [16, 0, 16], target: "stone", block: "gold" },
    { type: "sphere", center: [8, 15, 8], radius: 5, block: "dome", hollow: true },
    { type: "box", from: [7, 14, 7], to: [9, 16, 9], block: "core" },
    { type: "ramp", from: [17, 0, 4], to: [24, 8, 12], axis: "x", block: "path" }
  ],
  metadata: { style: "showcase" }
};
var exampleSpecs = {
  [fantasyHouseDemo.id]: fantasyHouseDemo,
  [stoneWatchtower.id]: stoneWatchtower,
  [logCabin.id]: logCabin,
  [featureShowcase.id]: featureShowcase
};

// apps/server/src/openBrowser.ts
import { spawn } from "node:child_process";
var opened = false;
function openViewerOnce(url) {
  if (opened) return;
  opened = true;
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
  }
}

// apps/server/src/mcp/toolHelpers.ts
function textResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}
function errorResult(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}
function imageResult(png, caption) {
  const content = [];
  if (caption) content.push({ type: "text", text: caption });
  content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
  return { content };
}

// apps/server/src/mcp/tools/createBuildTool.ts
function registerCreateBuildTool(server, deps) {
  server.registerTool(
    "create_build",
    {
      title: "Create build",
      description: "Compile a BuildSpec into a schematic and show it in the live browser preview (which opens automatically). Use this to build something from scratch or replace the current build.",
      inputSchema: { spec: buildSpecSchema }
    },
    async (args) => {
      try {
        const result = deps.sessionManager.build(args.spec);
        if (result.valid) {
          openViewerOnce(`${deps.config.baseUrl}/`);
        }
        return textResult({
          buildId: result.buildId,
          valid: result.valid,
          errors: result.errors,
          warnings: result.warnings,
          blockCount: result.blockCount,
          palette: result.palette,
          previewUrl: `${deps.config.baseUrl}/`,
          message: result.valid ? "Build created. The browser preview should open automatically (and updates on its own)." : "The spec has validation errors; fix them and try again."
        });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/getCurrentBuildTool.ts
function registerGetCurrentBuildTool(server, deps) {
  server.registerTool(
    "get_current_build",
    {
      title: "Get current build",
      description: "Return the current BuildSpec, stats (block count, palette, size), warnings, the preview URL and the project status."
    },
    async () => {
      try {
        return textResult(deps.sessionManager.current());
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/validateBuildTool.ts
function registerValidateBuildTool(server, deps) {
  server.registerTool(
    "validate_build",
    {
      title: "Validate build",
      description: "Validate a BuildSpec without changing the current build. Returns validity, errors and warnings (e.g. unknown block ids or out-of-bounds operations).",
      inputSchema: { spec: buildSpecSchema }
    },
    async (args) => {
      try {
        return textResult(deps.sessionManager.validate(args.spec));
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/applyPatchTool.ts
import { z as z2 } from "zod";
function registerApplyPatchTool(server, deps) {
  server.registerTool(
    "apply_patch",
    {
      title: "Apply patch",
      description: "Apply an RFC 6902 JSON Patch to the current BuildSpec and rebuild. Use this for incremental changes (e.g. swap a palette block, add an operation) instead of resending the whole spec.",
      inputSchema: { patch: z2.array(z2.unknown()) }
    },
    async (args) => {
      try {
        const result = deps.sessionManager.applyPatch(args.patch);
        openViewerOnce(`${deps.config.baseUrl}/`);
        return textResult(result);
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/renderPreviewTool.ts
function registerRenderPreviewTool(server, deps) {
  server.registerTool(
    "render_preview",
    {
      title: "Render preview (data)",
      description: "Return a compact summary of the current build: size and a per-block-state count, plus the viewer URL and the image preview URL."
    },
    async () => {
      try {
        const preview = deps.sessionManager.getPreviewData();
        const counts = {};
        for (const [state, positions] of Object.entries(preview.instances)) {
          counts[state] = positions.length;
        }
        return textResult({
          size: preview.size,
          blocks: counts,
          previewUrl: `${deps.config.baseUrl}/`,
          previewImageUrl: `${deps.config.baseUrl}/api/session/preview.png`
        });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/renderImageTool.ts
function registerRenderImageTool(server, deps) {
  server.registerTool(
    "render_image",
    {
      title: "Render image",
      description: "Render the current build as an isometric PNG and return it as an image, so you can actually see the result and judge what to improve."
    },
    async () => {
      try {
        const png = await deps.sessionManager.renderImage();
        const { stats } = deps.sessionManager.current();
        return imageResult(
          png,
          `Isometric preview \u2014 ${stats.blockCount} blocks, ${stats.size.x}x${stats.size.y}x${stats.size.z}.`
        );
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/exportSchematicTool.ts
import { z as z3 } from "zod";
function registerExportSchematicTool(server, deps) {
  server.registerTool(
    "export_schematic",
    {
      title: "Export schematic",
      description: "Export the current build for WorldEdit. Use format mcedit for the legacy .schematic format used by WorldEdit 6 / old FAWE on Minecraft 1.12.2. Use sponge-v2 (default) or sponge-v3 for modern .schem files.",
      inputSchema: {
        format: z3.enum(["mcedit", "sponge-v2", "sponge-v3"]).optional(),
        version: z3.union([z3.literal(2), z3.literal(3)]).optional()
      }
    },
    async (args) => {
      try {
        const format = args.format ?? (args.version === 3 ? "sponge-v3" : "sponge-v2");
        const { buffer, filename } = await deps.sessionManager.exportSchematic(format);
        return textResult({
          filename,
          format,
          size: buffer.length,
          downloadUrl: `${deps.config.baseUrl}/api/session/export.schem?format=${format}`
        });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/gitProjectTool.ts
import { z as z4 } from "zod";
function registerGitProjectTools(server, deps) {
  server.registerTool(
    "init_git_project",
    {
      title: "Initialize git project",
      description: "Turn a local folder (inside the home directory) into a git-versioned schematic project. Requires git to be installed. Writes the build spec + .schem and makes the first commit.",
      inputSchema: {
        projectPath: z4.string(),
        userName: z4.string().optional(),
        userEmail: z4.string().optional()
      }
    },
    async (args) => {
      try {
        return textResult(
          await deps.sessionManager.initGitProject(args.projectPath, args.userName, args.userEmail)
        );
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
  server.registerTool(
    "save_version",
    {
      title: "Save version",
      description: "Write the current build to the git project folder and commit it with the given message.",
      inputSchema: { message: z4.string() }
    },
    async (args) => {
      try {
        return textResult(await deps.sessionManager.saveVersion(args.message));
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
  server.registerTool(
    "git_branch",
    {
      title: "Git branch",
      description: "Switch to a branch in the git project, optionally creating it first.",
      inputSchema: { name: z4.string(), create: z4.boolean().optional() }
    },
    async (args) => {
      try {
        return textResult(await deps.sessionManager.branch(args.name, args.create ?? false));
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
  server.registerTool(
    "git_push",
    {
      title: "Git push",
      description: "Push the git project to a remote. Optionally set the remote URL first (https or ssh). The user must have push access configured.",
      inputSchema: { remote: z4.string().optional(), remoteUrl: z4.string().optional() }
    },
    async (args) => {
      try {
        return textResult(await deps.sessionManager.push(args.remote ?? "origin", args.remoteUrl));
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/sessionTools.ts
import { z as z5 } from "zod";
function registerSessionTools(server, deps) {
  server.registerTool(
    "list_sessions",
    {
      title: "List sessions",
      description: "List the in-memory build sessions (each is an independent schematic) and which one is current."
    },
    async () => {
      try {
        return textResult(deps.sessionManager.list());
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
  server.registerTool(
    "select_session",
    {
      title: "Select session",
      description: "Make the given session the current one (subsequent tools act on it).",
      inputSchema: { sessionId: z5.string() }
    },
    async (args) => {
      try {
        deps.sessionManager.select(args.sessionId);
        return textResult(deps.sessionManager.current());
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/tools/importSchematicTool.ts
import { open } from "node:fs/promises";
import { basename, isAbsolute as isAbsolute3 } from "node:path";
import { z as z6 } from "zod";
function registerImportSchematicTool(server, deps) {
  server.registerTool(
    "import_schematic",
    {
      title: "Import schematic",
      description: "Import a local MCEdit/WorldEdit 6 .schematic into a new session and preview it. Existing sessions are kept. The resulting BuildSpec has a compact base layer; use get_current_build and append operations with apply_patch to modify it. Export as mcedit to preserve original ID/data and NBT.",
      inputSchema: { path: z6.string().describe("Absolute local path to the .schematic file") }
    },
    async ({ path }) => {
      try {
        if (!isAbsolute3(path)) throw new Error("Please provide an absolute schematic path.");
        const file = await open(path, "r");
        let buffer;
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES)
            throw new Error("Expected a schematic file up to 32 MiB.");
          buffer = await file.readFile();
        } finally {
          await file.close();
        }
        const result = deps.sessionManager.importSchematic(buffer, basename(path));
        openViewerOnce(`${deps.config.baseUrl}/`);
        return textResult({
          sessionId: result.sessionId,
          buildId: result.buildId,
          valid: result.valid,
          blockCount: result.blockCount,
          palette: result.palette,
          warnings: result.warnings,
          previewUrl: `${deps.config.baseUrl}/`,
          buildSpecUrl: `${deps.config.baseUrl}/api/session/build-spec.json`
        });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    }
  );
}

// apps/server/src/mcp/createMcpServer.ts
function buildMcpServer(deps) {
  const server = new McpServer({ name: "minecraft-schematic-lab", version: APP_VERSION });
  registerCreateBuildTool(server, deps);
  registerGetCurrentBuildTool(server, deps);
  registerValidateBuildTool(server, deps);
  registerApplyPatchTool(server, deps);
  registerRenderPreviewTool(server, deps);
  registerRenderImageTool(server, deps);
  registerExportSchematicTool(server, deps);
  registerGitProjectTools(server, deps);
  registerSessionTools(server, deps);
  registerImportSchematicTool(server, deps);
  return server;
}
async function startMcpServer(deps) {
  const server = buildMcpServer(deps);
  await server.connect(new StdioServerTransport());
  return server;
}

// apps/server/src/session/SessionManager.ts
import { writeFileSync as writeFileSync3 } from "node:fs";
import { join as join7 } from "node:path";
import jsonpatch from "fast-json-patch";

// packages/block-compiler/src/BlockVolume.ts
var AIR = "minecraft:air";
function sortPair(a, b) {
  return a <= b ? [a, b] : [b, a];
}
var BlockVolume = class {
  x;
  y;
  z;
  cells;
  palette = [AIR];
  paletteIndex = /* @__PURE__ */ new Map([[AIR, 0]]);
  _outOfBoundsWrites = 0;
  legacyCells;
  constructor(x, y, z7) {
    this.x = x;
    this.y = y;
    this.z = z7;
    this.cells = new Uint16Array(x * y * z7);
  }
  /** YZX layout: x varies fastest, then z, then y. */
  index(x, y, z7) {
    return x + this.x * (z7 + this.z * y);
  }
  inBounds(x, y, z7) {
    return x >= 0 && y >= 0 && z7 >= 0 && x < this.x && y < this.y && z7 < this.z;
  }
  idFor(state) {
    const existing = this.paletteIndex.get(state);
    if (existing !== void 0) return existing;
    const id = this.palette.length;
    this.palette.push(state);
    this.paletteIndex.set(state, id);
    return id;
  }
  /** Place a block. Out-of-bounds writes are ignored (counted). Returns whether it was placed. */
  setBlock(x, y, z7, state) {
    if (!this.inBounds(x, y, z7)) {
      this._outOfBoundsWrites++;
      return false;
    }
    this.cells[this.index(x, y, z7)] = this.idFor(state);
    if (this.legacyCells) this.legacyCells[this.index(x, y, z7)] = 0;
    return true;
  }
  /** Original numeric ID/data belongs to this cell only, and is invalidated by edits. */
  setLegacyBlock(x, y, z7, state, id, data) {
    if (!this.setBlock(x, y, z7, state)) return;
    this.legacyCells ??= new Uint32Array(this.cells.length);
    this.legacyCells[this.index(x, y, z7)] = (id << 4 | data) + 1;
  }
  getLegacyBlock(x, y, z7) {
    if (!this.inBounds(x, y, z7)) return null;
    const encoded = this.legacyCells?.[this.index(x, y, z7)] ?? 0;
    return encoded ? { id: encoded - 1 >> 4, data: encoded - 1 & 15 } : null;
  }
  getBlock(x, y, z7) {
    if (!this.inBounds(x, y, z7)) return AIR;
    const id = this.cells[this.index(x, y, z7)] ?? 0;
    return this.palette[id] ?? AIR;
  }
  countBlocks() {
    let count = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== 0) count++;
    }
    return count;
  }
  /** Distinct non-air states actually present, sorted. */
  getPalette() {
    const present = /* @__PURE__ */ new Set();
    for (let i = 0; i < this.cells.length; i++) {
      const id = this.cells[i] ?? 0;
      if (id !== 0) present.add(this.palette[id] ?? AIR);
    }
    return [...present].sort();
  }
  /** state -> list of [x,y,z] positions, iterating in YZX order. */
  toInstanceGroups() {
    const groups = {};
    this.forEachYZX((x, y, z7, state) => {
      if (state === AIR) return;
      (groups[state] ??= []).push([x, y, z7]);
    });
    return groups;
  }
  forEachYZX(cb) {
    for (let y = 0; y < this.y; y++) {
      for (let z7 = 0; z7 < this.z; z7++) {
        for (let x = 0; x < this.x; x++) {
          const id = this.cells[this.index(x, y, z7)] ?? 0;
          cb(x, y, z7, this.palette[id] ?? AIR);
        }
      }
    }
  }
  getNonAirBounds() {
    let found = false;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let y = 0; y < this.y; y++) {
      for (let z7 = 0; z7 < this.z; z7++) {
        for (let x = 0; x < this.x; x++) {
          if ((this.cells[this.index(x, y, z7)] ?? 0) === 0) continue;
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z7 < minZ) minZ = z7;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z7 > maxZ) maxZ = z7;
        }
      }
    }
    if (!found) return null;
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }
  get outOfBoundsWrites() {
    return this._outOfBoundsWrites;
  }
};

// packages/block-compiler/src/operations/box.ts
function box(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const [x0, x1] = sortPair(op.from[0], op.to[0]);
  const [y0, y1] = sortPair(op.from[1], op.to[1]);
  const [z0, z1] = sortPair(op.from[2], op.to[2]);
  for (let y = y0; y <= y1; y++) {
    for (let z7 = z0; z7 <= z1; z7++) {
      for (let x = x0; x <= x1; x++) {
        volume.setBlock(x, y, z7, state);
      }
    }
  }
}

// packages/block-compiler/src/operations/hollowBox.ts
function hollowBox(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const t = op.thickness ?? 1;
  const [x0, x1] = sortPair(op.from[0], op.to[0]);
  const [y0, y1] = sortPair(op.from[1], op.to[1]);
  const [z0, z1] = sortPair(op.from[2], op.to[2]);
  for (let y = y0; y <= y1; y++) {
    for (let z7 = z0; z7 <= z1; z7++) {
      for (let x = x0; x <= x1; x++) {
        const onShell = x < x0 + t || x > x1 - t || y < y0 + t || y > y1 - t || z7 < z0 + t || z7 > z1 - t;
        if (onShell) volume.setBlock(x, y, z7, state);
      }
    }
  }
}

// packages/block-compiler/src/operations/wallRect.ts
function wallRect(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const hollow = op.hollow ?? true;
  const [x0, x1] = sortPair(op.from[0], op.to[0]);
  const [y0, y1] = sortPair(op.from[1], op.to[1]);
  const [z0, z1] = sortPair(op.from[2], op.to[2]);
  for (let y = y0; y <= y1; y++) {
    for (let z7 = z0; z7 <= z1; z7++) {
      for (let x = x0; x <= x1; x++) {
        if (!hollow || x === x0 || x === x1 || z7 === z0 || z7 === z1) {
          volume.setBlock(x, y, z7, state);
        }
      }
    }
  }
}

// packages/block-compiler/src/operations/gableRoof.ts
function withFacing(state, facing) {
  const match = state.match(/^(.*?)(?:\[([^\]]*)\])?$/);
  const name = match?.[1] ?? state;
  if (!name.endsWith("_stairs")) return state;
  const properties = (match?.[2] ?? "").split(",").filter((property) => property && !property.startsWith("facing="));
  properties.push(`facing=${facing}`);
  return `${name}[${properties.join(",")}]`;
}
function gableRoof(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const oh = op.overhang ?? 0;
  const [x0, x1] = sortPair(op.from[0], op.to[0]);
  const [y0, y1] = sortPair(op.from[1], op.to[1]);
  const [z0, z1] = sortPair(op.from[2], op.to[2]);
  if (op.axis === "x") {
    const xa = x0 - oh;
    const xb = x1 + oh;
    for (let layer = 0; ; layer++) {
      const y = y0 + layer;
      const zl = z0 + layer;
      const zr = z1 - layer;
      if (y > y1 || zl > zr) break;
      for (let x = xa; x <= xb; x++) {
        volume.setBlock(x, y, zl, withFacing(state, "south"));
        volume.setBlock(x, y, zr, withFacing(state, "north"));
      }
    }
  } else {
    const za = z0 - oh;
    const zb = z1 + oh;
    for (let layer = 0; ; layer++) {
      const y = y0 + layer;
      const xl = x0 + layer;
      const xr = x1 - layer;
      if (y > y1 || xl > xr) break;
      for (let z7 = za; z7 <= zb; z7++) {
        volume.setBlock(xl, y, z7, withFacing(state, "east"));
        volume.setBlock(xr, y, z7, withFacing(state, "west"));
      }
    }
  }
}

// packages/block-compiler/src/operations/cylinder.ts
function cylinder(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const [cx, cy, cz] = op.center;
  const r = op.radius;
  const hollow = op.hollow ?? false;
  const reach = Math.ceil(r);
  for (let h = 0; h < op.height; h++) {
    const y = cy + h;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const dist = Math.hypot(dx, dz);
        if (dist > r + 0.5) continue;
        if (hollow && dist <= r - 0.5) continue;
        volume.setBlock(cx + dx, y, cz + dz, state);
      }
    }
  }
}

// packages/block-compiler/src/operations/windowPattern.ts
function findWallPlane(volume, axis, along, y, outermost) {
  const limit = axis === "x" ? volume.z : volume.x;
  let found = null;
  for (let p = 0; p < limit; p++) {
    const state = axis === "x" ? volume.getBlock(along, y, p) : volume.getBlock(p, y, along);
    if (state === AIR) continue;
    if (outermost) {
      found = p;
    } else if (found === null) {
      found = p;
      break;
    }
  }
  return found;
}
function windowPattern(volume, op, ctx) {
  const glass = ctx.resolveBlock(op.glassBlock);
  const frame = op.frameBlock ? ctx.resolveBlock(op.frameBlock) : null;
  const axis = op.side === "north" || op.side === "south" ? "x" : "z";
  const outermost = op.side === "south" || op.side === "east";
  const setOnWall = (along, y, plane, state) => {
    if (axis === "x") volume.setBlock(along, y, plane, state);
    else volume.setBlock(plane, y, along, state);
  };
  for (const start of op.positions) {
    const plane = findWallPlane(volume, axis, start, op.y, outermost);
    if (plane === null) {
      ctx.warn(
        `window_pattern (${op.side}) found no wall at position ${start}, y=${op.y}; skipped.`
      );
      continue;
    }
    if (frame) {
      for (let dh = -1; dh <= op.height; dh++) {
        for (let dw = -1; dw <= op.width; dw++) {
          const onBorder = dh === -1 || dh === op.height || dw === -1 || dw === op.width;
          if (onBorder) setOnWall(start + dw, op.y + dh, plane, frame);
        }
      }
    }
    for (let dh = 0; dh < op.height; dh++) {
      for (let dw = 0; dw < op.width; dw++) {
        setOnWall(start + dw, op.y + dh, plane, glass);
      }
    }
  }
}

// packages/block-compiler/src/operations/sphere.ts
function sphere(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const [cx, cy, cz] = op.center;
  const r = op.radius;
  const hollow = op.hollow ?? false;
  const reach = Math.ceil(r);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > r + 0.5) continue;
        if (hollow && dist <= r - 0.5) continue;
        volume.setBlock(cx + dx, cy + dy, cz + dz, state);
      }
    }
  }
}

// packages/block-compiler/src/operations/pyramid.ts
function pyramid(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const hollow = op.hollow ?? false;
  const [x0, x1] = sortPair(op.from[0], op.to[0]);
  const [y0, y1] = sortPair(op.from[1], op.to[1]);
  const [z0, z1] = sortPair(op.from[2], op.to[2]);
  for (let i = 0; ; i++) {
    const y = y0 + i;
    const ax0 = x0 + i;
    const ax1 = x1 - i;
    const az0 = z0 + i;
    const az1 = z1 - i;
    if (y > y1 || ax0 > ax1 || az0 > az1) break;
    for (let z7 = az0; z7 <= az1; z7++) {
      for (let x = ax0; x <= ax1; x++) {
        if (!hollow || x === ax0 || x === ax1 || z7 === az0 || z7 === az1) {
          volume.setBlock(x, y, z7, state);
        }
      }
    }
  }
}

// packages/block-compiler/src/operations/ramp.ts
function ramp(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const [x0, x1] = sortPair(op.from[0], op.to[0]);
  const [y0, y1] = sortPair(op.from[1], op.to[1]);
  const [z0, z1] = sortPair(op.from[2], op.to[2]);
  if (op.axis === "x") {
    const span = Math.max(1, x1 - x0);
    for (let x = x0; x <= x1; x++) {
      const topY = y0 + Math.round((x - x0) / span * (y1 - y0));
      for (let z7 = z0; z7 <= z1; z7++) {
        for (let y = y0; y <= topY; y++) {
          volume.setBlock(x, y, z7, state);
        }
      }
    }
  } else {
    const span = Math.max(1, z1 - z0);
    for (let z7 = z0; z7 <= z1; z7++) {
      const topY = y0 + Math.round((z7 - z0) / span * (y1 - y0));
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= topY; y++) {
          volume.setBlock(x, y, z7, state);
        }
      }
    }
  }
}

// packages/block-compiler/src/operations/replace.ts
function replace(volume, op, ctx) {
  const target = ctx.resolveBlock(op.target);
  const state = ctx.resolveBlock(op.block);
  const [x0, x1] = sortPair(op.from[0], op.to[0]);
  const [y0, y1] = sortPair(op.from[1], op.to[1]);
  const [z0, z1] = sortPair(op.from[2], op.to[2]);
  for (let y = y0; y <= y1; y++) {
    for (let z7 = z0; z7 <= z1; z7++) {
      for (let x = x0; x <= x1; x++) {
        if (volume.getBlock(x, y, z7) === target) {
          volume.setBlock(x, y, z7, state);
        }
      }
    }
  }
}

// packages/block-compiler/src/operations/blockEntity.ts
function blockEntity(volume, op, ctx) {
  const state = ctx.resolveBlock(op.block);
  const [x, y, z7] = op.pos;
  if (!volume.setBlock(x, y, z7, state)) {
    ctx.warn(`block_entity at [${x}, ${y}, ${z7}] is out of bounds; skipped.`);
    return;
  }
  ctx.addBlockEntity({
    pos: [x, y, z7],
    id: state.split("[")[0] ?? state,
    block: state,
    data: op.data ?? {}
  });
}

// packages/block-compiler/src/compileBuildSpec.ts
var BuildSpecError = class extends Error {
  errors;
  constructor(errors) {
    super(`Invalid build spec: ${errors.join("; ")}`);
    this.name = "BuildSpecError";
    this.errors = errors;
  }
};
var BLOCK_STATE_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_/.]+(\[[a-z0-9_=,.:]*\])?$/;
function compileBuildSpec(input) {
  const validation = validateBuildSpec(input);
  if (!validation.success) {
    throw new BuildSpecError(validation.errors);
  }
  const spec = validation.data;
  if (spec.size.x * spec.size.y * spec.size.z > 2e6) {
    throw new BuildSpecError(["\u5EFA\u7B51\u4F53\u79EF\u8D85\u8FC7 2,000,000 \u65B9\u5757\uFF0C\u8BF7\u7F29\u5C0F\u9009\u533A\u3002"]);
  }
  const volume = new BlockVolume(spec.size.x, spec.size.y, spec.size.z);
  const warnings = [];
  const blockEntities = [];
  const warnedStates = /* @__PURE__ */ new Set();
  const ctx = {
    resolveBlock(key) {
      const mapped = spec.palette[key];
      const state = mapped ?? key;
      if (mapped === void 0 && !BLOCK_STATE_PATTERN.test(key)) {
        warnings.push(`"${key}" is not a palette key or a valid block id; using it literally.`);
      }
      if (!warnedStates.has(state) && !BLOCK_STATE_PATTERN.test(state)) {
        warnedStates.add(state);
        warnings.push(`"${state}" does not look like a valid Minecraft block id.`);
      }
      return state;
    },
    warn(message) {
      warnings.push(message);
    },
    addBlockEntity(entity) {
      for (let i = blockEntities.length - 1; i >= 0; i--) {
        if (blockEntities[i].pos.every((n, axis) => n === entity.pos[axis]))
          blockEntities.splice(i, 1);
      }
      blockEntities.push(entity);
    }
  };
  if (spec.base) {
    const base = spec.base;
    const count = base.size.x * base.size.y * base.size.z;
    if (count > 2e6 || base.runs.reduce((sum, run) => sum + run[1], 0) !== count || base.runs.some(([index2]) => !base.palette[index2])) {
      throw new BuildSpecError([
        "Imported base has invalid dimensions, palette indices or run lengths."
      ]);
    }
    warnings.push(...base.source.warnings);
    let index = 0;
    for (const [paletteIndex, length] of base.runs) {
      const entry = base.palette[paletteIndex];
      const state = ctx.resolveBlock(entry.block);
      for (let n = 0; n < length; n++, index++) {
        const x = index % base.size.x;
        const z7 = Math.floor(index / base.size.x) % base.size.z;
        const y = Math.floor(index / (base.size.x * base.size.z));
        if (entry.legacy && entry.legacy.state === state) {
          volume.setLegacyBlock(x, y, z7, state, entry.legacy.id, entry.legacy.data);
        } else if (state !== "minecraft:air") volume.setBlock(x, y, z7, state);
      }
    }
    for (const entity of base.blockEntities) {
      if (volume.inBounds(...entity.pos) && volume.getBlock(...entity.pos).split("[")[0] === entity.block.split("[")[0]) {
        blockEntities.push({
          pos: entity.pos,
          id: entity.id,
          block: entity.block,
          data: {},
          nbt: entity.nbt
        });
      }
    }
  }
  for (const op of spec.operations) {
    dispatch(volume, op, ctx);
    for (let i = blockEntities.length - 1; i >= 0; i--) {
      const entity = blockEntities[i];
      const state = volume.getBlock(...entity.pos).split("[")[0];
      const original = entity.block?.split("[")[0] ?? entity.id;
      if (state === "minecraft:air" || original && state !== original) blockEntities.splice(i, 1);
    }
  }
  if (volume.outOfBoundsWrites > 0) {
    warnings.push(
      `${volume.outOfBoundsWrites} block(s) were placed outside the ${spec.size.x}x${spec.size.y}x${spec.size.z} bounds and were skipped.`
    );
  }
  return {
    spec,
    volume,
    warnings,
    blockCount: volume.countBlocks(),
    palette: volume.getPalette(),
    blockEntities
  };
}
function dispatch(volume, op, ctx) {
  switch (op.type) {
    case "box":
      return box(volume, op, ctx);
    case "hollow_box":
      return hollowBox(volume, op, ctx);
    case "wall_rect":
      return wallRect(volume, op, ctx);
    case "gable_roof":
      return gableRoof(volume, op, ctx);
    case "cylinder":
      return cylinder(volume, op, ctx);
    case "window_pattern":
      return windowPattern(volume, op, ctx);
    case "sphere":
      return sphere(volume, op, ctx);
    case "pyramid":
      return pyramid(volume, op, ctx);
    case "ramp":
      return ramp(volume, op, ctx);
    case "replace":
      return replace(volume, op, ctx);
    case "block_entity":
      return blockEntity(volume, op, ctx);
  }
}

// apps/server/src/render/renderIsometric.ts
import { createCanvas } from "@napi-rs/canvas";
function fillPolygon(ctx, pts, fill) {
  ctx.beginPath();
  const first = pts[0];
  if (!first) return;
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p) ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = fill;
  ctx.lineWidth = 1;
  ctx.stroke();
}
var keyOf = (x, y, z7) => `${x},${y},${z7}`;
function renderIsometric(volume, maxSize = 900) {
  const cubes = [];
  const fullSet = /* @__PURE__ */ new Set();
  const slabSet = /* @__PURE__ */ new Set();
  for (const [state, positions] of Object.entries(volume.toInstanceGroups())) {
    const color = colorFor(state);
    const shape = blockShape(state);
    for (const [x, y, z7] of positions) {
      cubes.push({ x, y, z: z7, color, state });
      if (shape === "full" || shape === "stairs") fullSet.add(keyOf(x, y, z7));
      else if (shape === "slab") slabSet.add(keyOf(x, y, z7));
    }
  }
  const span = volume.x + volume.z;
  let tile = Math.min(
    Math.floor(2 * maxSize / Math.max(1, volume.x + volume.z)),
    Math.floor(maxSize / Math.max(1, span / 4 + volume.y / 2)),
    28
  );
  tile = Math.max(2, tile);
  const hw = tile / 2;
  const hh = tile / 4;
  const vh = tile / 2;
  const margin = tile;
  const anchor = (c) => ({
    cx: (c.x - c.z) * hw,
    cy: (c.x + c.z) * hh - c.y * vh
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cubes) {
    const { cx, cy } = anchor(c);
    minX = Math.min(minX, cx - hw);
    maxX = Math.max(maxX, cx + hw);
    minY = Math.min(minY, cy - hh);
    maxY = Math.max(maxY, cy + hh + vh);
  }
  if (cubes.length === 0) {
    minX = 0;
    minY = 0;
    maxX = tile;
    maxY = tile;
  }
  const width = Math.ceil(maxX - minX) + margin * 2;
  const height = Math.ceil(maxY - minY) + margin * 2;
  const offsetX = -minX + margin;
  const offsetY = -minY + margin;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0e1116";
  ctx.fillRect(0, 0, width, height);
  cubes.sort(
    (a, b) => a.x + a.z - a.y - (b.x + b.z - b.y) || a.x + a.z - (b.x + b.z) || a.y - b.y
  );
  for (const c of cubes) {
    const { cx, cy } = anchor(c);
    const sx = cx + offsetX;
    const sy = cy + offsetY;
    const shape = blockShape(c.state);
    let s = 1;
    let topOff = 0;
    let h = vh;
    if (shape === "slab") {
      topOff = vh * 0.5;
      h = vh * 0.5;
    } else if (shape === "thin") {
      s = 0.42;
      topOff = hh * (1 - s);
    }
    const hwS = hw * s;
    const hhS = hh * s;
    const top = sy + topOff;
    const aboveKey = keyOf(c.x, c.y + 1, c.z);
    const zKey = keyOf(c.x, c.y, c.z + 1);
    const xKey = keyOf(c.x + 1, c.y, c.z);
    let drawTop = true;
    let drawLeft = true;
    let drawRight = true;
    if (shape === "slab") {
      drawLeft = !(fullSet.has(zKey) || slabSet.has(zKey));
      drawRight = !(fullSet.has(xKey) || slabSet.has(xKey));
    } else if (shape !== "thin") {
      drawTop = !(fullSet.has(aboveKey) || slabSet.has(aboveKey));
      drawLeft = !fullSet.has(zKey);
      drawRight = !fullSet.has(xKey);
    }
    const alpha = isTransparent(c.state) ? 0.55 : 1;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    const topFace = [
      [sx, top - hhS],
      [sx + hwS, top],
      [sx, top + hhS],
      [sx - hwS, top]
    ];
    const leftFace = [
      [sx - hwS, top],
      [sx, top + hhS],
      [sx, top + hhS + h],
      [sx - hwS, top + h]
    ];
    const rightFace = [
      [sx + hwS, top],
      [sx, top + hhS],
      [sx, top + hhS + h],
      [sx + hwS, top + h]
    ];
    if (drawTop) fillPolygon(ctx, topFace, c.color);
    if (drawLeft) {
      fillPolygon(ctx, leftFace, c.color);
      fillPolygon(ctx, leftFace, "rgba(0,0,0,0.32)");
    }
    if (drawRight) {
      fillPolygon(ctx, rightFace, c.color);
      fillPolygon(ctx, rightFace, "rgba(0,0,0,0.18)");
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
  return canvas.toBuffer("image/png");
}

// apps/server/src/schematic/writeMcEditSchematic.ts
import { gzipSync } from "node:zlib";
import nbt2 from "prismarine-nbt";
var shortNode = (value) => ({ type: "short", value });
var byteNode = (value) => ({ type: "byte", value });
var intNode = (value) => ({ type: "int", value });
var stringNode = (value) => ({ type: "string", value });
var byteArrayNode = (value) => ({ type: "byteArray", value });
function listNode(value) {
  return { type: "list", value: { type: "compound", value } };
}
function signedByte(value) {
  return value > 127 ? value - 256 : value;
}
var DYE_DATA = {
  white: 0,
  orange: 1,
  magenta: 2,
  light_blue: 3,
  yellow: 4,
  lime: 5,
  pink: 6,
  gray: 7,
  light_gray: 8,
  cyan: 9,
  purple: 10,
  blue: 11,
  brown: 12,
  green: 13,
  red: 14,
  black: 15
};
var SIMPLE_BLOCKS = {
  air: { id: 0, data: 0 },
  cave_air: { id: 0, data: 0 },
  void_air: { id: 0, data: 0 },
  stone: { id: 1, data: 0 },
  andesite: { id: 1, data: 5 },
  polished_andesite: { id: 1, data: 6 },
  grass_block: { id: 2, data: 0 },
  dirt: { id: 3, data: 0 },
  coarse_dirt: { id: 3, data: 1 },
  podzol: { id: 3, data: 2 },
  cobblestone: { id: 4, data: 0 },
  sand: { id: 12, data: 0 },
  red_sand: { id: 12, data: 1 },
  gravel: { id: 13, data: 0 },
  gold_block: { id: 41, data: 0 },
  iron_block: { id: 42, data: 0 },
  bricks: { id: 45, data: 0 },
  bookshelf: { id: 47, data: 0 },
  obsidian: { id: 49, data: 0 },
  torch: { id: 50, data: 5 },
  diamond_block: { id: 57, data: 0 },
  crafting_table: { id: 58, data: 0 },
  furnace: { id: 61, data: 0 },
  glass: { id: 20, data: 0 },
  lapis_block: { id: 22, data: 0 },
  snow: { id: 78, data: 0 },
  ice: { id: 79, data: 0 },
  netherrack: { id: 87, data: 0 },
  soul_sand: { id: 88, data: 0 },
  glowstone: { id: 89, data: 0 },
  iron_bars: { id: 101, data: 0 },
  glass_pane: { id: 102, data: 0 },
  nether_brick: { id: 112, data: 0 },
  nether_bricks: { id: 112, data: 0 },
  mossy_stone_bricks: { id: 98, data: 1 },
  cracked_stone_bricks: { id: 98, data: 2 },
  chiseled_stone_bricks: { id: 98, data: 3 },
  fern: { id: 31, data: 2 },
  poppy: { id: 38, data: 0 },
  quartz_block: { id: 155, data: 0 },
  packed_ice: { id: 174, data: 0 }
};
var WOOD_DATA = {
  oak: 0,
  spruce: 1,
  birch: 2,
  jungle: 3,
  acacia: 0,
  dark_oak: 1
};
var PLANKS_DATA = {
  oak: 0,
  spruce: 1,
  birch: 2,
  jungle: 3,
  acacia: 4,
  dark_oak: 5
};
var STAIR_IDS = {
  oak: 53,
  stone_brick: 109,
  brick: 108,
  spruce: 134,
  birch: 135,
  jungle: 136,
  nether_brick: 114,
  quartz: 156,
  acacia: 163,
  dark_oak: 164
};
var FENCE_IDS = {
  oak: 85,
  spruce: 188,
  birch: 189,
  jungle: 190,
  dark_oak: 191,
  acacia: 192
};
function parseState(state) {
  const [rawName, rawProperties] = state.split("[", 2);
  const properties = {};
  for (const entry of (rawProperties?.replace(/]$/, "") ?? "").split(",")) {
    if (!entry) continue;
    const [key, value] = entry.split("=", 2);
    if (key && value) properties[key] = value;
  }
  return { name: (rawName ?? state).replace(/^minecraft:/, ""), properties };
}
function stairData(properties) {
  const facing = { east: 0, west: 1, south: 2, north: 3 }[properties.facing ?? "east"] ?? 0;
  return facing + (properties.half === "top" ? 4 : 0);
}
function legacyBlock(state) {
  const mapped = mappedLegacyBlock(state);
  if (mapped) return mapped;
  const { name, properties } = parseState(state);
  if (SIMPLE_BLOCKS[name]) return SIMPLE_BLOCKS[name];
  if (name === "quartz_pillar")
    return { id: 155, data: properties.axis === "x" ? 3 : properties.axis === "z" ? 4 : 2 };
  const glazed = name.match(
    /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_glazed_terracotta$/
  );
  if (glazed)
    return {
      id: 235 + DYE_DATA[glazed[1]],
      data: { south: 0, west: 1, north: 2, east: 3 }[properties.facing ?? "north"] ?? 2
    };
  const plank = name.match(/^(oak|spruce|birch|jungle|acacia|dark_oak)_planks$/);
  if (plank) return { id: 5, data: PLANKS_DATA[plank[1]] ?? 0 };
  const log = name.match(/^(oak|spruce|birch|jungle|acacia|dark_oak)_(log|wood)$/);
  if (log) {
    const wood = log[1];
    const axis = log[2] === "wood" ? 12 : properties.axis === "x" ? 4 : properties.axis === "z" ? 8 : 0;
    const woodData = WOOD_DATA[wood] ?? 0;
    if (wood === "acacia" || wood === "dark_oak") return { id: 162, data: woodData + axis };
    return { id: 17, data: woodData + axis };
  }
  const stairs2 = name.match(
    /^(oak|stone_brick|brick|spruce|birch|jungle|nether_brick|quartz|acacia|dark_oak)_stairs$/
  );
  if (stairs2) return { id: STAIR_IDS[stairs2[1]], data: stairData(properties) };
  const fence2 = name.match(/^(oak|spruce|birch|jungle|dark_oak|acacia)_fence$/);
  if (fence2) return { id: FENCE_IDS[fence2[1]], data: 0 };
  if (name === "stone_bricks") {
    return { id: 98, data: { mossy: 1, cracked: 2, chiseled: 3 }[properties.variant ?? ""] ?? 0 };
  }
  const wool = name.match(
    /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_wool$/
  );
  if (wool) return { id: 35, data: DYE_DATA[wool[1]] ?? 0 };
  const colored = name.match(
    /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(stained_glass|stained_glass_pane|carpet)$/
  );
  if (colored)
    return {
      id: { stained_glass: 95, stained_glass_pane: 160, carpet: 171 }[colored[2]],
      data: DYE_DATA[colored[1]]
    };
  if (name === "ladder" || name === "chest")
    return {
      id: name === "ladder" ? 65 : 54,
      data: { north: 2, south: 3, west: 4, east: 5 }[properties.facing ?? "north"] ?? 2
    };
  if (name === "water" || name === "flowing_water")
    return {
      id: name === "water" ? 9 : 8,
      data: Number.parseInt(properties.level ?? "0", 10) & 15
    };
  const concrete = name.match(
    /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(concrete|concrete_powder)$/
  );
  if (concrete)
    return {
      id: concrete[2] === "concrete" ? 251 : 252,
      data: DYE_DATA[concrete[1]] ?? 0
    };
  const stoneSlabs = {
    stone: 0,
    smooth_stone: 0,
    sandstone: 1,
    cobblestone: 3,
    brick: 4,
    stone_brick: 5,
    nether_brick: 6,
    quartz: 7
  };
  const slab = name.match(/^(.*)_slab$/);
  if (slab) {
    const material = slab[1];
    const wood = PLANKS_DATA[material];
    const variant = wood ?? stoneSlabs[material];
    if (variant !== void 0) {
      const doubled = properties.type === "double";
      return {
        id: wood !== void 0 ? doubled ? 125 : 126 : doubled ? 43 : 44,
        data: variant + (!doubled && (properties.type === "top" || properties.half === "top") ? 8 : 0)
      };
    }
  }
  return null;
}
function unsupportedLegacyBlocks(volume) {
  const unsupported = /* @__PURE__ */ new Set();
  const supported = /* @__PURE__ */ new Map();
  volume.forEachYZX((x, y, z7, state) => {
    if (volume.getLegacyBlock(x, y, z7)) return;
    if (!supported.has(state)) supported.set(state, legacyBlock(state) !== null);
    if (!supported.get(state)) unsupported.add(state);
  });
  return [...unsupported].sort();
}
function tileEntity(be) {
  const value = {
    ...be.nbt,
    id: stringNode(be.nbt ? be.id : be.id.replace(/^minecraft:/, "")),
    x: intNode(be.pos[0]),
    y: intNode(be.pos[1]),
    z: intNode(be.pos[2])
  };
  for (const [key, raw] of Object.entries(be.data)) {
    if (typeof raw === "string") value[key] = stringNode(raw);
    else if (typeof raw === "boolean") value[key] = byteNode(raw ? 1 : 0);
    else if (typeof raw === "number" && Number.isInteger(raw)) value[key] = intNode(raw);
  }
  return value;
}
async function writeMcEditSchematic(volume, blockEntities = [], spec) {
  if ([volume.x, volume.y, volume.z].some((dimension) => dimension > 32767)) {
    throw new Error("Legacy .schematic dimensions must not exceed 32767 on any axis.");
  }
  const blocks = [];
  const data = [];
  const addBlocks = [];
  const unsupported = /* @__PURE__ */ new Set();
  const mapped = /* @__PURE__ */ new Map();
  volume.forEachYZX((x, y, z7, state) => {
    let block = volume.getLegacyBlock(x, y, z7);
    if (!block) {
      if (!mapped.has(state)) mapped.set(state, legacyBlock(state));
      block = mapped.get(state) ?? null;
    }
    if (!block) {
      unsupported.add(state);
      blocks.push(0);
      data.push(0);
      addBlocks.push(0);
      return;
    }
    blocks.push(block.id & 255);
    data.push(block.data & 15);
    addBlocks.push(block.id >> 8 & 15);
  });
  if (unsupported.size > 0) {
    throw new Error(
      `Legacy .schematic cannot represent these blocks for Minecraft 1.12.2: ${[...unsupported].sort().join(", ")}`
    );
  }
  const value = {
    ...spec?.base?.source.extraNbt,
    Materials: stringNode("Alpha"),
    Width: shortNode(volume.x),
    Height: shortNode(volume.y),
    Length: shortNode(volume.z),
    WEOriginX: intNode(spec?.base?.source.worldOrigin[0] ?? 0),
    WEOriginY: intNode(spec?.base?.source.worldOrigin[1] ?? 0),
    WEOriginZ: intNode(spec?.base?.source.worldOrigin[2] ?? 0),
    WEOffsetX: intNode(spec?.origin?.x ?? 0),
    WEOffsetY: intNode(spec?.origin?.y ?? 0),
    WEOffsetZ: intNode(spec?.origin?.z ?? 0),
    Blocks: byteArrayNode(blocks.map(signedByte)),
    Data: byteArrayNode(data.map(signedByte)),
    Entities: listNode(spec?.base?.entities ?? []),
    TileEntities: listNode(blockEntities.map(tileEntity))
  };
  if (addBlocks.some((high) => high !== 0)) {
    const packed = [];
    for (let i = 0; i < addBlocks.length; i += 2) {
      packed.push(signedByte((addBlocks[i] ?? 0) | (addBlocks[i + 1] ?? 0) << 4));
    }
    value.AddBlocks = byteArrayNode(packed);
  }
  const root = { type: "compound", name: "Schematic", value };
  return gzipSync(
    nbt2.writeUncompressed(root, "big")
  );
}

// apps/server/src/schematic/writeSpongeSchematic.ts
import { gzipSync as gzipSync2 } from "node:zlib";
import nbt3 from "prismarine-nbt";

// apps/server/src/schematic/schematicTypes.ts
var DATA_VERSIONS = {
  "1.21": 3953,
  "1.20": 3463,
  "1.19": 3105,
  "1.18": 2860,
  "1.17": 2724,
  "1.16": 2566,
  "1.15": 2230,
  "1.14": 1952
};
var DEFAULT_DATA_VERSION = 3953;
function dataVersionFor(version) {
  const exact = DATA_VERSIONS[version];
  if (exact !== void 0) return exact;
  for (const [key, value] of Object.entries(DATA_VERSIONS)) {
    if (version === key || version.startsWith(`${key}.`)) return value;
  }
  return DEFAULT_DATA_VERSION;
}

// apps/server/src/schematic/writeSpongeSchematic.ts
var intNode2 = (value) => ({ type: "int", value });
var shortNode2 = (value) => ({ type: "short", value });
var stringNode2 = (value) => ({ type: "string", value });
var byteNode2 = (value) => ({ type: "byte", value });
var intArrayNode = (value) => ({ type: "intArray", value });
var byteArrayNode2 = (value) => ({ type: "byteArray", value });
var compoundNode = (value) => ({ type: "compound", value });
function pushVarint(out, value) {
  let v = value >>> 0;
  for (; ; ) {
    let b = v & 127;
    v >>>= 7;
    if (v !== 0) b |= 128;
    out.push(b > 127 ? b - 256 : b);
    if (v === 0) break;
  }
}
function jsonToNbt(value) {
  if (typeof value === "string") return stringNode2(value);
  if (typeof value === "boolean") return byteNode2(value ? 1 : 0);
  if (typeof value === "number") {
    return Number.isInteger(value) ? intNode2(value) : { type: "double", value };
  }
  if (Array.isArray(value)) {
    const items = value.map(jsonToNbt);
    const elemType = items[0]?.type ?? "string";
    return { type: "list", value: { type: elemType, value: items.map((n) => n.value) } };
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = jsonToNbt(v);
    }
    return compoundNode(out);
  }
  return stringNode2("");
}
function blockEntityCompound(be, version) {
  const base = {
    Id: stringNode2(be.id),
    Pos: intArrayNode([be.pos[0], be.pos[1], be.pos[2]])
  };
  const data = jsonToNbt(be.data);
  if (version === 3) {
    base.Data = data;
  } else if (data.type === "compound") {
    Object.assign(base, data.value);
  }
  return compoundNode(base);
}
async function writeSpongeSchematic(spec, volume, options = {}) {
  if (spec.base?.source.format === "mcedit") {
    throw new Error(
      "\u5BFC\u5165\u7684\u65E7\u7248\u539F\u7406\u56FE\u8BF7\u5BFC\u51FA\u4E3A Legacy MCEdit .schematic\uFF0C\u4EE5\u4FDD\u7559\u539F\u59CB ID/data \u548C\u5B9E\u4F53 NBT\u3002\u8DE8\u7248\u672C\u8F6C\u6362\u6682\u4E0D\u652F\u6301\u3002"
    );
  }
  const version = options.version ?? 2;
  const blockEntities = options.blockEntities ?? [];
  const dataVersion = dataVersionFor(spec.minecraftVersion);
  const paletteIndex = /* @__PURE__ */ new Map();
  const paletteValue = {};
  const blockData = [];
  volume.forEachYZX((_x, _y, _z, state) => {
    let id = paletteIndex.get(state);
    if (id === void 0) {
      id = paletteIndex.size;
      paletteIndex.set(state, id);
      paletteValue[state] = intNode2(id);
    }
    pushVarint(blockData, id);
  });
  const offset = spec.origin ? [spec.origin.x, spec.origin.y, spec.origin.z] : [0, 0, 0];
  const metadata = compoundNode({
    Name: stringNode2(spec.name),
    Author: stringNode2("minecraft-schematic-lab"),
    WEOffsetX: intNode2(0),
    WEOffsetY: intNode2(0),
    WEOffsetZ: intNode2(0)
  });
  const beList = {
    type: "list",
    value: {
      type: "compound",
      value: blockEntities.map((be) => blockEntityCompound(be, version).value)
    }
  };
  let root;
  if (version === 3) {
    const blocks = {
      Palette: compoundNode(paletteValue),
      Data: byteArrayNode2(blockData)
    };
    if (blockEntities.length > 0) blocks.BlockEntities = beList;
    root = {
      type: "compound",
      name: "",
      value: {
        Schematic: compoundNode({
          Version: intNode2(3),
          DataVersion: intNode2(dataVersion),
          Metadata: metadata,
          Width: shortNode2(volume.x),
          Height: shortNode2(volume.y),
          Length: shortNode2(volume.z),
          Offset: intArrayNode(offset),
          Blocks: compoundNode(blocks)
        })
      }
    };
  } else {
    const value = {
      Version: intNode2(2),
      DataVersion: intNode2(dataVersion),
      Metadata: metadata,
      Width: shortNode2(volume.x),
      Height: shortNode2(volume.y),
      Length: shortNode2(volume.z),
      Offset: intArrayNode(offset),
      PaletteMax: intNode2(paletteIndex.size),
      Palette: compoundNode(paletteValue),
      BlockData: byteArrayNode2(blockData)
    };
    if (blockEntities.length > 0) value.BlockEntities = beList;
    root = { type: "compound", name: "Schematic", value };
  }
  const uncompressed = nbt3.writeUncompressed(
    root,
    "big"
  );
  return gzipSync2(uncompressed);
}

// apps/server/src/schematic/importPreview.ts
var directions = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0]
};
var left = { north: "west", west: "south", south: "east", east: "north" };
var opposite = {
  north: "south",
  south: "north",
  west: "east",
  east: "west"
};
var stairs = (s) => s.name.endsWith("_stairs");
var pane = (s) => s.name.endsWith("glass_pane") || s.name === "minecraft:iron_bars";
var fence = (s) => s.name.endsWith("_fence");
var wall = (s) => s.name.endsWith("_wall");
var fullCube = (s) => s.name.startsWith("minecraft:") && !/(air|water|lava|_stairs|_slab|_fence|_gate|_wall|_pane|iron_bars|_door|_trapdoor|_torch|_carpet|_button|_plate|_sapling|_flower|_rail|_sign|_bed|_leaves|grass|fern|vine|ladder|snow|chest|brewing_stand|cobweb|tripwire|redstone_wire)$/.test(
  s.name
);
function importedPreview(volume) {
  const cache = /* @__PURE__ */ new Map();
  function at(x, y, z7) {
    const raw = volume.getBlock(x, y, z7);
    let parsed = cache.get(raw);
    if (!parsed) {
      const [name, properties] = raw.replace(/\]$/, "").split("[");
      parsed = {
        name,
        props: Object.fromEntries(
          (properties ?? "").split(",").filter(Boolean).map((p) => p.split("="))
        )
      };
      cache.set(raw, parsed);
    }
    return parsed;
  }
  const instances = {};
  volume.forEachYZX((x, y, z7, raw) => {
    if (raw === "minecraft:air") return;
    const state = at(x, y, z7);
    let name = state.name;
    const props = { ...state.props };
    const neighbour = (facing, reverse2 = false) => {
      const [dx, dz] = directions[reverse2 ? opposite[facing] : facing] ?? [0, 0];
      return at(x + dx, y, z7 + dz);
    };
    if (pane(state) || fence(state) || wall(state)) {
      for (const direction of Object.keys(directions)) {
        const other = neighbour(direction);
        const similar = pane(state) ? pane(other) : fence(state) ? fence(other) : wall(other);
        props[direction] = String(
          similar || fullCube(other) || (fence(state) || wall(state)) && other.name.endsWith("_fence_gate")
        );
      }
      if (wall(state))
        props.up = String(
          !(props.north === props.south && props.east === props.west && props.north !== props.east) || at(x, y + 1, z7).name !== "minecraft:air"
        );
    }
    if (stairs(state)) {
      const facing = props.facing ?? "east";
      const half = props.half ?? "bottom";
      const differentAxis = (other) => other.props.facing !== facing && other.props.facing !== opposite[facing];
      const same = (other) => stairs(other) && other.props.half === half && other.props.facing === facing;
      const front = neighbour(facing);
      const back = neighbour(facing, true);
      props.shape = "straight";
      if (stairs(front) && front.props.half === half && differentAxis(front) && !same(neighbour(front.props.facing, true))) {
        props.shape = front.props.facing === left[facing] ? "outer_left" : "outer_right";
      } else if (stairs(back) && back.props.half === half && differentAxis(back) && !same(neighbour(back.props.facing))) {
        props.shape = back.props.facing === left[facing] ? "inner_left" : "inner_right";
      }
    }
    if (name.endsWith("_door")) {
      const upper = props.half === "upper";
      const other = at(x, y + (upper ? -1 : 1), z7);
      if (other.name === name) {
        for (const key of upper ? ["facing", "open"] : ["hinge", "powered"]) {
          if (other.props[key]) props[key] = other.props[key];
        }
      }
    }
    const legacy = volume.getLegacyBlock(x, y, z7);
    if (legacy?.id === 175 && legacy.data & 8) {
      const lower = at(x, y - 1, z7);
      if (volume.getLegacyBlock(x, y - 1, z7)?.id === 175) {
        name = lower.name;
        props.half = "upper";
      }
    }
    const properties = Object.entries(props).map(([key, value]) => `${key}=${value}`).join(",");
    const displayState = properties ? `${name}[${properties}]` : name;
    (instances[displayState] ??= []).push([x, y, z7]);
  });
  return { size: { x: volume.x, y: volume.y, z: volume.z }, instances };
}

// apps/server/src/session/SessionManager.ts
var { applyPatch, deepClone } = jsonpatch;
var EMPTY_SIZE = { x: 0, y: 0, z: 0 };
function safeFilename(name) {
  const cleaned = name.trim().replace(/[^A-Za-z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "schematic";
}
function projectReadme(session) {
  const name = session.spec?.name ?? "Schematic";
  return [
    `# ${name}`,
    "",
    "Generated by [minecraft-schematic-lab](https://github.com/SimoneRecchia/minecraft-schematic-lab).",
    "",
    `- Blocks: ${session.blockCount}`,
    `- Palette: ${session.palette.join(", ") || "\u2014"}`,
    "",
    "Load the `.schem` with WorldEdit: `//schem load <name>` then `//paste`.",
    ""
  ].join("\n");
}
var SessionManager = class {
  constructor(config, git) {
    this.config = config;
    this.git = git;
    this.createSession();
  }
  sessions = /* @__PURE__ */ new Map();
  currentId = "";
  now() {
    return Date.now();
  }
  createSession() {
    const id = newSessionId();
    const ts = this.now();
    const session = {
      id,
      buildId: null,
      spec: null,
      volume: null,
      warnings: [],
      blockCount: 0,
      palette: [],
      blockEntities: [],
      schematicCache: /* @__PURE__ */ new Map(),
      project: { mode: "memory", path: null, git: null },
      createdAt: ts,
      updatedAt: ts
    };
    this.sessions.set(id, session);
    this.currentId = id;
    return session;
  }
  getCurrent() {
    const session = this.sessions.get(this.currentId);
    if (!session) throw new HttpError(500, "No active session.");
    return session;
  }
  list() {
    return [...this.sessions.values()].map((s) => ({
      sessionId: s.id,
      name: s.spec?.name ?? "Untitled",
      buildId: s.buildId,
      blockCount: s.blockCount,
      isCurrent: s.id === this.currentId
    }));
  }
  select(id) {
    if (!this.sessions.has(id)) throw new HttpError(404, `Session not found: ${id}`);
    this.currentId = id;
  }
  deleteSession(id) {
    if (!this.sessions.has(id)) throw new HttpError(404, `Session not found: ${id}`);
    this.sessions.delete(id);
    if (this.currentId === id) {
      const next = this.sessions.keys().next();
      if (next.done) this.createSession();
      else this.currentId = next.value;
    }
  }
  build(input) {
    const session = this.getCurrent();
    try {
      const result = compileBuildSpec(input);
      if (/^1\.12(?:\.|$)/.test(result.spec.minecraftVersion)) {
        const unsupported = unsupportedLegacyBlocks(result.volume);
        if (unsupported.length)
          throw new BuildSpecError([
            `\u65E0\u6CD5\u65E0\u635F\u5BFC\u51FA\u4E3A Minecraft 1.12.2\uFF0C\u8BF7\u66F4\u6362\u6216\u8865\u5145\u517C\u5BB9\u6620\u5C04\uFF1A${unsupported.join(", ")}`
          ]);
      }
      session.spec = result.spec;
      session.volume = result.volume;
      session.warnings = result.warnings;
      session.blockCount = result.blockCount;
      session.palette = result.palette;
      session.blockEntities = result.blockEntities;
      session.buildId = newBuildId();
      session.schematicCache.clear();
      session.updatedAt = this.now();
      return {
        sessionId: session.id,
        buildId: session.buildId,
        valid: true,
        errors: [],
        warnings: result.warnings,
        blockCount: result.blockCount,
        palette: result.palette,
        previewData: this.previewFor(session),
        importedFrom: result.spec.base?.source.filename
      };
    } catch (error) {
      if (error instanceof BuildSpecError) {
        return {
          sessionId: session.id,
          buildId: session.buildId,
          valid: false,
          errors: error.errors,
          warnings: [],
          blockCount: 0,
          palette: [],
          previewData: this.previewFor(session)
        };
      }
      throw error;
    }
  }
  importSchematic(buffer, filename) {
    const spec = readSchematic(buffer, filename);
    const validation = this.validate(spec);
    if (!validation.valid) throw new HttpError(422, validation.errors.join("; "));
    const previous = this.currentId;
    const session = this.createSession();
    try {
      const result = this.build(spec);
      if (!result.valid) throw new HttpError(422, result.errors.join("; "));
      return result;
    } catch (error) {
      this.sessions.delete(session.id);
      this.currentId = previous;
      throw error;
    }
  }
  validate(input) {
    try {
      const result = compileBuildSpec(input);
      if (/^1\.12(?:\.|$)/.test(result.spec.minecraftVersion)) {
        const unsupported = unsupportedLegacyBlocks(result.volume);
        if (unsupported.length)
          throw new BuildSpecError([
            `\u65E0\u6CD5\u65E0\u635F\u5BFC\u51FA\u4E3A Minecraft 1.12.2\uFF0C\u8BF7\u66F4\u6362\u6216\u8865\u5145\u517C\u5BB9\u6620\u5C04\uFF1A${unsupported.join(", ")}`
          ]);
      }
      return { valid: true, errors: [], warnings: result.warnings };
    } catch (error) {
      if (error instanceof BuildSpecError) {
        return { valid: false, errors: error.errors, warnings: [] };
      }
      throw error;
    }
  }
  applyPatch(patch) {
    const session = this.getCurrent();
    if (!session.spec) {
      throw new HttpError(409, "No current build to patch. Create a build first.");
    }
    if (!Array.isArray(patch)) {
      throw new HttpError(400, "Patch must be a JSON Patch (RFC 6902) array.");
    }
    const next = applyPatch(deepClone(session.spec), patch, true, false).newDocument;
    const result = this.build(next);
    if (!result.valid) {
      throw new HttpError(422, `Patched spec is invalid: ${result.errors.join("; ")}`);
    }
    return {
      spec: session.spec,
      valid: true,
      errors: [],
      warnings: result.warnings,
      stats: this.statsFor(session),
      previewUrl: this.previewUrl()
    };
  }
  current() {
    const session = this.getCurrent();
    return {
      sessionId: session.id,
      buildId: session.buildId,
      spec: session.spec,
      stats: this.statsFor(session),
      warnings: session.warnings,
      previewUrl: this.previewUrl(),
      project: this.projectStatus()
    };
  }
  getPreviewData() {
    return this.previewFor(this.getCurrent());
  }
  async renderImage() {
    const session = this.getCurrent();
    if (!session.volume) {
      throw new HttpError(409, "Nothing to render yet. Create a build first.");
    }
    return renderIsometric(session.volume);
  }
  async exportSchematic(format = "sponge-v2") {
    const session = this.getCurrent();
    if (!session.spec || !session.volume) {
      throw new HttpError(409, "Nothing to export yet. Create a build first.");
    }
    const buffer = await this.schematicFor(session, format);
    const extension = format === "mcedit" ? "schematic" : "schem";
    const filename = `${safeFilename(session.spec.name || session.spec.id)}.${extension}`;
    return { buffer, filename };
  }
  projectStatus() {
    const session = this.getCurrent();
    return {
      mode: session.project.mode,
      path: session.project.path,
      git: session.project.git ? {
        branch: session.project.git.branch,
        branches: session.project.git.branches,
        remote: session.project.git.remote
      } : null
    };
  }
  async initLocalProject(path) {
    const dir = this.git.resolveSafePath(path);
    this.git.ensureDir(dir);
    const session = this.getCurrent();
    session.project = { mode: "local", path: dir, git: null };
    await this.writeProjectFiles(session, dir);
    return { mode: "local", path: dir };
  }
  async initGitProject(path, userName, userEmail) {
    await this.git.checkGitAvailable();
    const dir = this.git.resolveSafePath(path);
    this.git.ensureDir(dir);
    if (!await this.git.isRepo(dir)) {
      await this.git.initRepo(dir);
    }
    const identity = await this.git.readLocalIdentity(dir);
    await this.git.setLocalIdentity(
      dir,
      userName ?? identity.name ?? "minecraft-schematic-lab",
      userEmail ?? identity.email ?? "schematic-lab@localhost"
    );
    const session = this.getCurrent();
    await this.writeProjectFiles(session, dir);
    await this.git.commitAll(dir, "Initialize schematic project");
    const branch = await this.git.currentBranch(dir);
    const branches = await this.git.listBranches(dir);
    session.project = { mode: "git", path: dir, git: { branch, branches, remote: null } };
    return { mode: "git", path: dir, branch };
  }
  async saveVersion(message) {
    const session = this.requireGitPath();
    const dir = session.project.path;
    await this.writeProjectFiles(session, dir);
    const result = await this.git.commitAll(dir, message || "Update schematic");
    await this.refreshGitInfo(session);
    return { committed: result.committed, commit: result.commit, message };
  }
  async branches() {
    const session = this.requireGitPath();
    const dir = session.project.path;
    return {
      current: await this.git.currentBranch(dir),
      branches: await this.git.listBranches(dir)
    };
  }
  async branch(name, create = false) {
    const session = this.requireGitPath();
    const dir = session.project.path;
    if (create) await this.git.createBranch(dir, name);
    await this.git.checkoutBranch(dir, name);
    await this.refreshGitInfo(session);
    return {
      current: await this.git.currentBranch(dir),
      branches: await this.git.listBranches(dir)
    };
  }
  async push(remote = "origin", remoteUrl) {
    const session = this.requireGitPath();
    const dir = session.project.path;
    if (remoteUrl) await this.git.setRemote(dir, remote, remoteUrl);
    const branch = await this.git.currentBranch(dir) ?? "main";
    const output = await this.git.push(dir, remote, branch);
    if (session.project.git) session.project.git.remote = remote;
    return { ok: true, output };
  }
  requireGitPath() {
    const session = this.getCurrent();
    if (session.project.mode !== "git" || !session.project.path) {
      throw new HttpError(409, "No git project. Initialize one first with init_git_project.");
    }
    return session;
  }
  async refreshGitInfo(session) {
    const dir = session.project.path;
    if (!dir) return;
    session.project.git = {
      branch: await this.git.currentBranch(dir),
      branches: await this.git.listBranches(dir),
      remote: session.project.git?.remote ?? null
    };
  }
  async writeProjectFiles(session, dir) {
    if (!session.spec || !session.volume) return;
    this.git.writeFiles(dir, {
      "build-spec.json": `${JSON.stringify(session.spec, null, 2)}
`,
      "README.md": projectReadme(session),
      ".gitignore": "node_modules/\n"
    });
    const legacy = /^1\.12(?:\.|$)/.test(session.spec.minecraftVersion);
    const buffer = await this.schematicFor(session, legacy ? "mcedit" : "sponge-v2");
    writeFileSync3(
      join7(
        dir,
        `${safeFilename(session.spec.name || session.spec.id)}.${legacy ? "schematic" : "schem"}`
      ),
      buffer
    );
  }
  async schematicFor(session, format = "sponge-v2") {
    const cached = session.schematicCache.get(format);
    if (cached) return cached;
    if (!session.spec || !session.volume) {
      throw new HttpError(409, "Nothing to export yet. Create a build first.");
    }
    const buffer = format === "mcedit" ? await writeMcEditSchematic(session.volume, session.blockEntities, session.spec) : await writeSpongeSchematic(session.spec, session.volume, {
      version: format === "sponge-v3" ? 3 : 2,
      blockEntities: session.blockEntities
    });
    session.schematicCache.set(format, buffer);
    return buffer;
  }
  previewFor(session) {
    if (!session.volume) return { size: EMPTY_SIZE, instances: {} };
    if (session.spec?.base) return importedPreview(session.volume);
    return {
      size: { x: session.volume.x, y: session.volume.y, z: session.volume.z },
      instances: session.volume.toInstanceGroups()
    };
  }
  statsFor(session) {
    return {
      blockCount: session.blockCount,
      palette: session.palette,
      size: session.volume ? { x: session.volume.x, y: session.volume.y, z: session.volume.z } : EMPTY_SIZE
    };
  }
  previewUrl() {
    return `${this.config.baseUrl}/`;
  }
};

// apps/server/src/index.ts
function isPortFree(host, port) {
  return new Promise((resolve4) => {
    const probe = createServer();
    probe.once("error", () => resolve4(false));
    probe.once("listening", () => probe.close(() => resolve4(true)));
    probe.listen(port, host);
  });
}
async function findOpenPort(host, start, attempts = 20) {
  for (let port = start; port < start + attempts; port++) {
    if (await isPortFree(host, port)) return port;
  }
  return start;
}
async function main() {
  const config = loadConfig();
  const port = await findOpenPort(config.host, config.port);
  config.port = port;
  config.baseUrl = `http://${config.host}:${port}`;
  const git = new GitProjectService();
  const sessionManager = new SessionManager(config, git);
  const app = await createHttpServer(sessionManager, config);
  await app.listen({ host: config.host, port: config.port });
  if (config.mcpMode) {
    await startMcpServer({ sessionManager, config });
    const note = existsSync5(config.webDist) ? "" : ' (run "pnpm build" once to enable the browser viewer)';
    process.stderr.write(
      `minecraft-schematic-lab: MCP stdio ready; viewer + API on ${config.baseUrl}${note}
`
    );
  } else {
    app.log.info(`minecraft-schematic-lab listening on ${config.baseUrl}`);
  }
}
main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Fatal: ${detail}
`);
  process.exit(1);
});
