# Claude for After Effects

A docked chat panel that runs [Claude Code](https://claude.com/claude-code) inside Adobe After Effects, plus a hidden HTTP bridge that lets the After Effects MCP server run commands in AE in a few milliseconds.

- **Chat panel** (Window > Extensions > Claude): streams Claude's replies, shows tool calls, and asks before running anything outside the AE tools. Claude-written ExtendScript always needs your approval.
- **Comp context**: each message can carry a snapshot of the active comp, playhead and selected layers, so "make these fade in" means the layers you have selected.
- **Attach frame**: sends the current comp frame as an image.
- **Bridge** (`com.axel.claudeae.bridge`): starts with After Effects and listens on `127.0.0.1:47821`. The token lives in `~/Documents/ae-mcp-bridge/http-bridge.json`.

## Requirements

- macOS, After Effects 2022 or newer (CEP 9+)
- Claude Code installed and logged in (`claude` on your PATH, or in `~/.local/bin`)
- The [after-effects-mcp](https://github.com/TheLlamainator/after-effects-mcp) server configured in Claude Code as `AfterEffectsMCP`, so Claude can act on the project

## Install

```bash
node install.js
```

This copies the extension to `~/Library/Application Support/Adobe/CEP/extensions/claude-ae` and turns on `PlayerDebugMode`, which unsigned extensions need. Restart After Effects, then open **Window > Extensions > Claude**.

For development:

```bash
node install.js --link --debug
```

`--link` symlinks the folder, so edits show up when you close and reopen the panel. `--debug` opens Chrome DevTools at `http://localhost:8092` (panel) and `:8093` (bridge).

## Layout

| Path | What it is |
|---|---|
| `CSXS/manifest.xml` | CEP manifest for the panel and the hidden bridge |
| `panel/` | Chat UI: `app.js` (UI), `claude-session.js` (runs `claude -p` with stream-json), `markdown.js`, `style.css` |
| `bridge/index.html` | Background page that starts the HTTP bridge |
| `shared/bridge-server.js` | HTTP server that runs MCP commands through `evalScript` |
| `jsx/panel-context.jsx` | Builds the comp/selection snapshot sent with messages |
| `jsx/mcp-bridge-auto.jsx` | ExtendScript command handlers, from after-effects-mcp's build (`build/scripts/`) |

## Notes on performance

CEP renders panels offscreen at a fixed 30 fps on macOS, so smooth motion is off the table. The panel is built around that:

- Streamed text is revealed at a steady pace each frame instead of in network-sized bursts, and only the paragraph being written is re-rendered.
- The working indicator steps through glyphs instead of rotating, which looks the same at any frame rate.
- Scroll position is tracked from scroll events, so streaming never forces a synchronous layout, and the view stays pinned to the latest message while the panel is resized.
- Your message shows up the moment you press Enter; the comp snapshot is taken afterwards.

## License

MIT. See [LICENSE](LICENSE).
