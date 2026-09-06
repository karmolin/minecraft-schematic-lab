[English](#english) | [中文](#chinese)

---

<a id="english"></a>

# minecraft-schematic-lab

Build Minecraft schematics by talking to Claude. Describe what you want and it produces a WorldEdit
Sponge `.schem` with a live 3D preview in the browser. Everything runs locally — no account, no cloud.

## Setup

You need **Node 22+** and **Claude Code** (CLI or desktop app). Add the connector once — either way below
works for both the CLI and the desktop app, since they share the same config.

<details>
<summary><b>Add it with one command</b> &nbsp;(uses the <code>claude</code> CLI)</summary>

<br>

macOS / Linux:

```bash
claude mcp add --scope user minecraft-schematic-lab -- npx -y github:SimoneRecchia/minecraft-schematic-lab --mcp
```

Windows — `npx` needs a `cmd /c` wrapper:

```bat
claude mcp add --scope user minecraft-schematic-lab -- cmd /c npx -y github:SimoneRecchia/minecraft-schematic-lab --mcp
```

If `claude` isn't found, the desktop app doesn't ship the CLI — install it, open a new terminal, and run
the command again:

- **macOS** — `brew install --cask claude-code` (or `curl -fsSL https://claude.ai/install.sh | bash`)
- **Linux** — `curl -fsSL https://claude.ai/install.sh | bash`
- **Windows** — `winget install Anthropic.ClaudeCode` (or `irm https://claude.ai/install.ps1 | iex`)

</details>

<details>
<summary><b>Add it by hand</b> &nbsp;(edit the config file)</summary>

<br>

Add the block under `mcpServers` in your Claude config — `~/.claude.json` for Claude Code
(`%USERPROFILE%\.claude.json` on Windows), or `claude_desktop_config.json` for the Claude Desktop chat app.

macOS / Linux:

```json
{
  "mcpServers": {
    "minecraft-schematic-lab": {
      "command": "npx",
      "args": ["-y", "github:SimoneRecchia/minecraft-schematic-lab", "--mcp"]
    }
  }
}
```

Windows:

```json
{
  "mcpServers": {
    "minecraft-schematic-lab": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:SimoneRecchia/minecraft-schematic-lab", "--mcp"]
    }
  }
}
```

</details>

Restart Claude Code so it picks up the connector, then ask:

> build me a 50×40×80 fantasy castle

The first run pulls the tool through `npx`; the 3D preview then opens at <http://127.0.0.1:8765>.

## Using it

- **Change it** — "make the roof brick", "add two towers". The preview refreshes on its own.
- **Export** — select **Legacy MCEdit .schematic** for WorldEdit 6 / old FAWE on Minecraft 1.12.x;
  select Sponge v2/v3 for modern WorldEdit. The browser export button and Claude both support all three.
- **In Minecraft** — put the `.schem` in your world's `schematics` folder, then `//schem load <name>` and `//paste`.
- **Versions** — ask Claude to version a build in a folder (needs git).
- **Updates** — the connector follows `main`; pin a release with `#v0.1.0`, or clear a stale cache with `npm cache clean --force`.

## Platform support

| OS                              | CLI | Desktop app | Note                             |
| ------------------------------- | :-: | :---------: | -------------------------------- |
| macOS (Intel / Apple Silicon)   | ✅  |     ✅      |                                  |
| Windows 10/11 (x64 / ARM64)     | ✅  |     ✅      | `npx` needs `cmd /c` (see Setup) |
| Linux (x64 / ARM64, incl. musl) | ✅  |      —      | no desktop app on Linux          |

Node 22+ on every platform; 32-bit isn't supported.

## Develop

```bash
pnpm setup        # install + build
pnpm dev          # web (5173) + server (8765), hot reload
pnpm test         # vitest
pnpm bundle       # rebuild bundle/ for the npx connector (commit after server changes)
```

Architecture, MCP tools, the HTTP API and the BuildSpec format are documented in [`CLAUDE.md`](CLAUDE.md).

## License

MIT © 2026 SimoneRecchia

---

<a id="chinese"></a>

# minecraft-schematic-lab

通过与 Claude 对话来构建 Minecraft 原理图。描述你想要的内容，它会生成一个 WorldEdit Sponge `.schem` 文件，并在浏览器中提供实时 3D 预览。完全在本地运行 — 无需账号，无需云服务。

## 安装配置

你需要 **Node 22+** 和 **Claude Code**（CLI 或桌面应用）。只需添加一次连接器 — 以下任意方式均适用于 CLI 和桌面应用，因为它们共享相同的配置。

<details>
<summary><b>一键添加</b> &nbsp;（使用 <code>claude</code> CLI）</summary>

<br>

macOS / Linux：

```bash
claude mcp add --scope user minecraft-schematic-lab -- npx -y github:SimoneRecchia/minecraft-schematic-lab --mcp
```

Windows — `npx` 需要 `cmd /c` 包装：

```bat
claude mcp add --scope user minecraft-schematic-lab -- cmd /c npx -y github:SimoneRecchia/minecraft-schematic-lab --mcp
```

如果找不到 `claude`，说明桌面应用未附带 CLI — 请先安装，打开新终端后再运行命令：

- **macOS** — `brew install --cask claude-code`（或 `curl -fsSL https://claude.ai/install.sh | bash`）
- **Linux** — `curl -fsSL https://claude.ai/install.sh | bash`
- **Windows** — `winget install Anthropic.ClaudeCode`（或 `irm https://claude.ai/install.ps1 | iex`）

</details>

<details>
<summary><b>手动添加</b> &nbsp;（编辑配置文件）</summary>

<br>

在 Claude 配置文件的 `mcpServers` 下添加以下内容 — Claude Code 对应 `~/.claude.json`（Windows 为 `%USERPROFILE%\.claude.json`），Claude 桌面聊天应用对应 `claude_desktop_config.json`。

macOS / Linux：

```json
{
  "mcpServers": {
    "minecraft-schematic-lab": {
      "command": "npx",
      "args": ["-y", "github:SimoneRecchia/minecraft-schematic-lab", "--mcp"]
    }
  }
}
```

Windows：

```json
{
  "mcpServers": {
    "minecraft-schematic-lab": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:SimoneRecchia/minecraft-schematic-lab", "--mcp"]
    }
  }
}
```

</details>

重启 Claude Code 以加载连接器，然后尝试：

> 帮我建一座 50×40×80 的奇幻城堡

首次运行会通过 `npx` 拉取工具；3D 预览随后会在 <http://127.0.0.1:8765> 打开。

## 使用方法

- **修改** — "把屋顶换成砖块"、"加两座塔楼"。预览会自动刷新。
- **导出** — 选择 **Legacy MCEdit .schematic** 用于 WorldEdit 6 / 旧版 FAWE（Minecraft 1.12.x）；选择 Sponge v2/v3 用于现代 WorldEdit。浏览器导出按钮和 Claude 均支持全部三种格式。
- **导入 Minecraft** — 将 `.schem` 文件放入存档的 `schematics` 文件夹，然后执行 `//schem load <名称>` 和 `//paste`。
- **版本管理** — 让 Claude 将构建版本保存到文件夹中（需要 git）。
- **更新** — 连接器跟随 `main` 分支更新；使用 `#v0.1.0` 固定版本，或通过 `npm cache clean --force` 清除旧缓存。

## 平台支持

| 操作系统                         | CLI | 桌面应用 | 备注                                |
| -------------------------------- | :-: | :------: | ----------------------------------- |
| macOS（Intel / Apple Silicon）   | ✅  |    ✅    |                                     |
| Windows 10/11（x64 / ARM64）     | ✅  |    ✅    | `npx` 需要 `cmd /c`（参见安装配置） |
| Linux（x64 / ARM64，含 musl）    | ✅  |    —     | Linux 无桌面应用                    |

所有平台均需 Node 22+；不支持 32 位系统。

## 开发

```bash
pnpm setup        # 安装依赖并构建
pnpm dev          # 启动 web（5173）+ server（8765），支持热重载
pnpm test         # 运行 vitest
pnpm bundle       # 重新构建 bundle/，用于 npx 连接器（服务端变更后需提交）
```

架构说明、MCP 工具、HTTP API 及 BuildSpec 格式记录在 [`CLAUDE.md`](CLAUDE.md) 中。

## 许可证

MIT © 2026 SimoneRecchia
