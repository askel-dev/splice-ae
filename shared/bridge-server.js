// HTTP bridge between the MCP server and After Effects.
// Runs inside a CEP extension, receives commands on 127.0.0.1 and executes them
// through evalScript, so there's no file polling on either side.
(function (global) {
  var nodeRequire = global.cep_node ? global.cep_node.require : global.require;
  var http = nodeRequire('http');
  var fs = nodeRequire('fs');
  var path = nodeRequire('path');
  var os = nodeRequire('os');
  var crypto = nodeRequire('crypto');

  var PORT = 47821;
  var BRIDGE_DIR = path.join(os.homedir(), 'Documents', 'ae-mcp-bridge');
  var INFO_FILE = path.join(BRIDGE_DIR, 'http-bridge.json');

  function extensionPath() {
    var p = decodeURI(global.__adobe_cep__.getSystemPath('extension'));
    return p.replace(/^file:\/\//, '');
  }

  function evalScript(source) {
    return new Promise(function (resolve) {
      global.__adobe_cep__.evalScript(source, function (result) {
        resolve(result);
      });
    });
  }

  // ExtendScript is ES3, where U+2028 and friends end a line even inside strings,
  // so everything non-ASCII travels as \uXXXX escapes
  function asciiEscape(json) {
    return json.replace(/[^\x00-\x7e]/g, function (c) {
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  function jsxString(value) {
    return asciiEscape(JSON.stringify(String(value)));
  }

  function loadJsx(fileName, probeFunction) {
    return evalScript('typeof ' + probeFunction).then(function (type) {
      if (type === 'function') {
        return;
      }
      var file = path.join(extensionPath(), 'jsx', fileName);
      var source = (fileName === 'mcp-bridge-auto.jsx' ? 'MCP_HEADLESS = true; ' : '') +
        'try { $.evalFile(new File(' + jsxString(file) + ')); "ok"; } ' +
        'catch (e) { "ERR " + e.toString() + " (line " + e.line + ")"; }';
      return evalScript(source).then(function (result) {
        if (result !== 'ok') {
          throw new Error('Could not load ' + fileName + ': ' + result);
        }
      });
    });
  }

  // AE runs one script at a time anyway; queueing keeps results in order
  var queue = Promise.resolve();

  function runCommand(command, args, id) {
    var job = queue.then(function () {
      return loadJsx('mcp-bridge-auto.jsx', 'mcpHttpExecute').then(function () {
        return evalScript('mcpHttpExecute(' + jsxString(command) + ', ' +
          jsxString(asciiEscape(JSON.stringify(args || {}))) + ', ' + jsxString(id || '') + ')');
      }).then(function (result) {
        if (result === 'EvalScript error.' || result === undefined || result === null || result === '') {
          return JSON.stringify({ status: 'error', message: 'After Effects failed to run ' + command + ' (EvalScript error).', _commandId: id });
        }
        return result;
      });
    });
    queue = job.catch(function () {});
    return job;
  }

  function readBody(req) {
    return new Promise(function (resolve, reject) {
      var chunks = [];
      req.on('data', function (c) { chunks.push(c); });
      req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
      req.on('error', reject);
    });
  }

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  }

  var listeners = [];
  var state = { status: 'starting', commands: 0, lastCommand: null, lastMs: null };

  function setState(patch) {
    Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
    listeners.forEach(function (fn) { fn(state); });
  }

  function start() {
    var token = crypto.randomBytes(16).toString('hex');
    var server = http.createServer(function (req, res) {
      if (req.method === 'GET' && req.url === '/health') {
        return send(res, 200, { ok: true, host: 'AEFT', pid: process.pid });
      }
      if (req.method !== 'POST' || req.url !== '/command') {
        return send(res, 404, { error: 'Not found' });
      }
      if (req.headers['x-bridge-token'] !== token) {
        return send(res, 401, { error: 'Bad token' });
      }
      readBody(req).then(function (body) {
        var payload = JSON.parse(body);
        var started = Date.now();
        setState({ busy: true, lastCommand: payload.command });
        return runCommand(payload.command, payload.args, payload.id).then(function (result) {
          setState({ busy: false, commands: state.commands + 1, lastMs: Date.now() - started });
          send(res, 200, result);
        });
      }).catch(function (error) {
        setState({ busy: false });
        send(res, 500, { status: 'error', message: String(error && error.message || error) });
      });
    });

    server.on('error', function (error) {
      if (error.code === 'EADDRINUSE') {
        // Another extension instance (usually the background bridge) already serves
        setState({ status: 'shared' });
      } else {
        setState({ status: 'error', error: String(error) });
      }
    });

    server.listen(PORT, '127.0.0.1', function () {
      try {
        if (!fs.existsSync(BRIDGE_DIR)) {
          fs.mkdirSync(BRIDGE_DIR, { recursive: true });
        }
        fs.writeFileSync(INFO_FILE, JSON.stringify({ port: PORT, token: token, pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
        setState({ status: 'listening' });
      } catch (error) {
        setState({ status: 'error', error: String(error) });
      }
      // Load the bridge script up front so the first command is fast
      loadJsx('mcp-bridge-auto.jsx', 'mcpHttpExecute').catch(function (error) {
        setState({ status: 'error', error: String(error.message || error) });
      });
    });
    return server;
  }

  function health() {
    return new Promise(function (resolve) {
      var req = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 1500 }, function (res) {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', function () { resolve(false); });
      req.on('timeout', function () { req.destroy(); resolve(false); });
    });
  }

  global.AEBridge = {
    start: start,
    health: health,
    evalScript: evalScript,
    jsxString: jsxString,
    loadJsx: loadJsx,
    extensionPath: extensionPath,
    onState: function (fn) { listeners.push(fn); fn(state); },
    state: state
  };
})(window);
