// Runs Claude Code headless (stream-json in and out) and relays its events to the panel
(function (global) {
  var nodeRequire = global.cep_node ? global.cep_node.require : global.require;
  var childProcess = nodeRequire('child_process');
  var fs = nodeRequire('fs');
  var path = nodeRequire('path');
  var os = nodeRequire('os');

  var HOME = os.homedir();

  // CEP starts with a bare PATH; the MCP server needs node and Claude needs its own bin dir
  var EXTRA_PATH = [
    path.join(HOME, '.local', 'bin'),
    path.join(HOME, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin', '/bin', '/usr/sbin', '/sbin'
  ];

  var MODES = {
    // Every tool asks first, except reading files
    ask: { permissionMode: 'manual', allowedTools: ['Read', 'Glob', 'Grep'] },
    // After Effects tools run freely (each change is one undo step), anything else asks
    ae: { permissionMode: 'manual', allowedTools: ['mcp__AfterEffectsMCP', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'] },
    // Claude Code's auto mode decides, After Effects tools always allowed
    auto: { permissionMode: 'auto', allowedTools: ['mcp__AfterEffectsMCP', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'] }
  };

  var SYSTEM_PROMPT = [
    'You are running inside a docked panel in Adobe After Effects, chatting with the user while they edit.',
    'The panel is narrow: keep replies short, use short paragraphs and small lists, and avoid wide tables.',
    'Each user message may start with an <ae_context> block, a live snapshot of the active comp, playhead and selected layers taken when the message was sent. Treat it as the current state; "these layers" or "this" usually means the selection in it.',
    'Act on the project with the AfterEffectsMCP tools. Every change they make is a single undo step, so the user can press Cmd+Z to revert any one of them.',
    'When no dedicated tool fits, write ExtendScript with execute-jsx. The user sees the script and approves it before it runs, so keep it short and readable.',
    'Commands reach After Effects through the panel\'s HTTP bridge and run almost instantly, so there is no need to wait between calls or call get-results.',
    'Don\'t mention the status of unrelated connectors or MCP servers (for example ones that need authorizing); the user only cares about After Effects here.'
  ].join('\n');

  function findClaude() {
    var candidates = [
      path.join(HOME, '.local', 'bin', 'claude'),
      path.join(HOME, '.claude', 'local', 'claude'),
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude'
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (fs.existsSync(candidates[i])) return candidates[i];
    }
    try {
      var found = childProcess.execFileSync('/bin/zsh', ['-lc', 'command -v claude'], { encoding: 'utf8', timeout: 5000 }).trim();
      if (found) return found;
    } catch (e) {}
    return null;
  }

  function buildEnv() {
    var env = {};
    Object.keys(process.env).forEach(function (k) { env[k] = process.env[k]; });
    var seen = {};
    env.PATH = EXTRA_PATH.concat((env.PATH || '').split(':')).filter(function (p) {
      if (!p || seen[p]) return false;
      seen[p] = true;
      return true;
    }).join(':');
    env.HOME = HOME;
    // Don't let Claude think it's nested inside another Claude Code session
    ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ID'].forEach(function (k) { delete env[k]; });
    return env;
  }

  function ClaudeSession(options) {
    this.options = options || {};
    this.proc = null;
    this.sessionId = null;
    this.handlers = {};
    this.pendingControl = {};
    this.nextControlId = 1;
  }

  ClaudeSession.prototype.on = function (event, fn) {
    (this.handlers[event] = this.handlers[event] || []).push(fn);
  };

  ClaudeSession.prototype.emit = function (event, data) {
    (this.handlers[event] || []).forEach(function (fn) { fn(data); });
  };

  ClaudeSession.prototype.isRunning = function () {
    return !!this.proc;
  };

  ClaudeSession.prototype.start = function (resumeId) {
    var self = this;
    var claude = findClaude();
    if (!claude) {
      throw new Error('Could not find the claude command. Install Claude Code, then reopen this panel.');
    }
    var mode = MODES[this.options.mode] || MODES.ae;
    var args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      // Without the stdio prompt tool, prompts are denied instead of reaching the panel
      '--permission-prompts', 'host',
      '--permission-prompt-tool', 'stdio',
      '--permission-mode', mode.permissionMode,
      '--append-system-prompt', SYSTEM_PROMPT,
      // Ask rules beat the allowed AE tools, so Claude-written scripts always get an Allow card
      '--settings', JSON.stringify({ permissions: { ask: ['mcp__AfterEffectsMCP__execute-jsx'] } })
    ];
    if (this.options.model) {
      args.push('--model', this.options.model);
    }
    if (resumeId) {
      args.push('--resume', resumeId);
    }
    args.push('--allowedTools');
    args = args.concat(mode.allowedTools);

    this.stderr = '';
    this.proc = childProcess.spawn(claude, args, {
      cwd: this.options.cwd || HOME,
      env: buildEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    var buffer = '';
    this.proc.stdout.on('data', function (chunk) {
      buffer += chunk.toString('utf8');
      var newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        var line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        var message;
        try {
          message = JSON.parse(line);
        } catch (e) {
          self.emit('stderr', line);
          continue;
        }
        self.handleMessage(message);
      }
    });
    this.proc.stderr.on('data', function (chunk) {
      self.stderr = (self.stderr + chunk.toString('utf8')).slice(-4000);
      self.emit('stderr', chunk.toString('utf8'));
    });
    this.proc.on('error', function (error) {
      self.emit('error', error);
    });
    this.proc.on('exit', function (code, signal) {
      self.proc = null;
      Object.keys(self.pendingControl).forEach(function (id) {
        self.pendingControl[id].reject(new Error('Claude exited'));
      });
      self.pendingControl = {};
      self.emit('exit', { code: code, signal: signal, stderr: self.stderr });
    });
  };

  ClaudeSession.prototype.handleMessage = function (message) {
    if (message.type === 'system' && message.subtype === 'init') {
      this.sessionId = message.session_id;
    }
    if (message.type === 'control_response') {
      var response = message.response || {};
      var pending = this.pendingControl[response.request_id];
      if (pending) {
        delete this.pendingControl[response.request_id];
        if (response.subtype === 'error') pending.reject(new Error(response.error));
        else pending.resolve(response.response);
      }
      return;
    }
    if (message.type === 'control_request') {
      var subtype = message.request && message.request.subtype;
      if (subtype === 'can_use_tool') {
        this.emit('permission', message);
      } else {
        this.write({ type: 'control_response', response: { subtype: 'error', request_id: message.request_id, error: 'Unsupported by the After Effects panel: ' + subtype } });
      }
      return;
    }
    this.emit('message', message);
  };

  ClaudeSession.prototype.write = function (object) {
    if (!this.proc) throw new Error('Claude is not running');
    this.proc.stdin.write(JSON.stringify(object) + '\n');
  };

  ClaudeSession.prototype.sendUser = function (content) {
    this.write({ type: 'user', message: { role: 'user', content: content }, parent_tool_use_id: null, session_id: this.sessionId || '' });
  };

  ClaudeSession.prototype.respondPermission = function (requestId, result) {
    this.write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: result } });
  };

  ClaudeSession.prototype.control = function (request) {
    var self = this;
    var id = 'panel-' + (this.nextControlId++);
    return new Promise(function (resolve, reject) {
      self.pendingControl[id] = { resolve: resolve, reject: reject };
      try {
        self.write({ type: 'control_request', request_id: id, request: request });
      } catch (e) {
        delete self.pendingControl[id];
        reject(e);
      }
    });
  };

  ClaudeSession.prototype.interrupt = function () {
    var self = this;
    return this.control({ subtype: 'interrupt' }).catch(function () {
      // Fall back to a hard stop; the session can be resumed afterwards
      self.stop();
    });
  };

  ClaudeSession.prototype.stop = function () {
    if (this.proc) {
      try { this.proc.stdin.end(); } catch (e) {}
      var proc = this.proc;
      setTimeout(function () { try { proc.kill('SIGTERM'); } catch (e) {} }, 1500);
    }
  };

  // Rebuilds the visible history of a saved session from its transcript file
  ClaudeSession.loadTranscript = function (cwd, sessionId) {
    var dirName = path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-');
    var file = path.join(HOME, '.claude', 'projects', dirName, sessionId + '.jsonl');
    if (!fs.existsSync(file)) return null;
    var entries = [];
    fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
      if (!line.trim()) return;
      try {
        var entry = JSON.parse(line);
        if ((entry.type === 'user' || entry.type === 'assistant') && entry.message && !entry.isSidechain && !entry.isMeta) {
          entries.push(entry);
        }
      } catch (e) {}
    });
    return entries;
  };

  ClaudeSession.MODES = MODES;
  ClaudeSession.findClaude = findClaude;
  ClaudeSession.buildEnv = buildEnv;
  global.ClaudeSession = ClaudeSession;
})(window);
