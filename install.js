#!/usr/bin/env node
// Installs Splice into After Effects (macOS): builds the MCP server, installs the CEP extension
// and registers the server with Claude Code.
//
//   node install.js           copy the extension into Adobe's CEP folder
//   node install.js --link    symlink it instead, so edits here show up after reloading the panel
//   node install.js --debug   also enable Chrome DevTools on localhost:8092 (panel) and :8093 (bridge)
//   node install.js --no-mcp  don't touch Claude Code's MCP config
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.platform !== 'darwin') {
  console.error('Splice currently supports macOS only.');
  process.exit(1);
}
if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error(`Splice needs Node.js 18 or newer (you have ${process.version}).`);
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const source = __dirname;
const extensionsDir = path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
const target = path.join(extensionsDir, 'splice');
const PARTS = ['CSXS', 'panel', 'bridge', 'shared', 'jsx'];
const MCP_NAME = 'AfterEffectsMCP';

function step(message) {
  console.log(`\n> ${message}`);
}

// 1. MCP server
step('Building the MCP server');
const serverDir = path.join(source, 'server');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: serverDir, stdio: 'inherit' });
execFileSync(npm, ['run', 'build'], { cwd: serverDir, stdio: 'inherit' });

// 2. CEP extension
step('Installing the After Effects extension');
// Earlier builds installed as claude-ae; two copies would both start a bridge
fs.rmSync(path.join(extensionsDir, 'claude-ae'), { recursive: true, force: true });
fs.rmSync(target, { recursive: true, force: true });
if (args.has('--link')) {
  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.symlinkSync(source, target);
  console.log(`Linked ${target} -> ${source}`);
} else {
  fs.mkdirSync(target, { recursive: true });
  for (const part of PARTS) {
    fs.cpSync(path.join(source, part), path.join(target, part), { recursive: true });
  }
  console.log(`Installed to ${target}`);
}

const debugFile = path.join(target, '.debug');
if (args.has('--debug')) {
  fs.writeFileSync(debugFile, `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
  <Extension Id="com.axel.splice.panel">
    <HostList><Host Name="AEFT" Port="8092"/></HostList>
  </Extension>
  <Extension Id="com.axel.splice.bridge">
    <HostList><Host Name="AEFT" Port="8093"/></HostList>
  </Extension>
</ExtensionList>
`);
  console.log('DevTools: http://localhost:8092 (panel), http://localhost:8093 (bridge)');
} else if (fs.existsSync(debugFile) && !args.has('--link')) {
  fs.rmSync(debugFile);
}

// Unsigned extensions only load with PlayerDebugMode on
for (const version of [9, 10, 11, 12, 13]) {
  const domain = `com.adobe.CSXS.${version}`;
  let current = '';
  try {
    current = execFileSync('defaults', ['read', domain, 'PlayerDebugMode'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  if (current !== '1') {
    execFileSync('defaults', ['write', domain, 'PlayerDebugMode', '1']);
    console.log(`Enabled PlayerDebugMode for ${domain}`);
  }
}

// 3. Claude Code
function findClaude() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) return found;
  try {
    return execFileSync('/bin/zsh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

// process.execPath is often a versioned Cellar path that breaks on upgrade; prefer the stable symlink
function stableNodePath() {
  const real = fs.realpathSync(process.execPath);
  const stable = ['/opt/homebrew/bin/node', '/usr/local/bin/node'].find((p) => {
    try { return fs.realpathSync(p) === real; } catch { return false; }
  });
  return stable || process.execPath;
}

if (!args.has('--no-mcp')) {
  step(`Registering the ${MCP_NAME} server with Claude Code`);
  const claude = findClaude();
  const node = stableNodePath();
  const serverEntry = path.join(serverDir, 'build', 'index.js');
  if (!claude) {
    console.log('Claude Code not found. Install it (https://claude.com/claude-code), then run:');
    console.log(`  claude mcp add -s user ${MCP_NAME} -- "${node}" "${serverEntry}"`);
  } else {
    try {
      execFileSync(claude, ['mcp', 'remove', MCP_NAME, '-s', 'user'], { stdio: 'ignore' });
    } catch {}
    execFileSync(claude, ['mcp', 'add', '-s', 'user', MCP_NAME, '--', node, serverEntry], { stdio: 'inherit' });
  }
}

console.log('\nDone. Restart After Effects, then open Window > Extensions > Splice.');
