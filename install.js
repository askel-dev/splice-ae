#!/usr/bin/env node
// Installs the Claude panel into After Effects (macOS).
//
//   node install.js           copy the extension into Adobe's CEP folder
//   node install.js --link    symlink it instead, so edits here show up after reloading the panel
//   node install.js --debug   also enable Chrome DevTools on localhost:8092 (panel) and :8093 (bridge)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.platform !== 'darwin') {
  console.error('install.js currently supports macOS only.');
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const source = __dirname;
const target = path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions', 'claude-ae');
const PARTS = ['CSXS', 'panel', 'bridge', 'shared', 'jsx'];

fs.rmSync(target, { recursive: true, force: true });
if (args.has('--link')) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target);
  console.log(`Linked ${target} -> ${source}`);
} else {
  fs.mkdirSync(target, { recursive: true });
  for (const part of PARTS) {
    fs.cpSync(path.join(source, part), path.join(target, part), { recursive: true });
  }
  console.log(`Installed panel to ${target}`);
}

const debugFile = path.join(target, '.debug');
if (args.has('--debug')) {
  fs.writeFileSync(debugFile, `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
  <Extension Id="com.axel.claudeae.panel">
    <HostList><Host Name="AEFT" Port="8092"/></HostList>
  </Extension>
  <Extension Id="com.axel.claudeae.bridge">
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

console.log('Restart After Effects (or close and reopen the panel), then open Window > Extensions > Claude.');
