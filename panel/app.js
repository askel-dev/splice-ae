// Claude chat panel for After Effects
(() => {
  const nodeRequire = window.cep_node ? window.cep_node.require : window.require;
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const os = nodeRequire('os');
  const childProcess = nodeRequire('child_process');

  // Same working directory as Claude Code in the terminal at "/", so memories are shared
  const CLAUDE_CWD = '/';
  const FRAMES_DIR = path.join(os.homedir(), 'Documents', 'ae-mcp-bridge', 'frames');

  const $ = (id) => document.getElementById(id);
  const messagesEl = $('messages');
  const inputEl = $('input');
  const sendBtn = $('send');
  const modeEl = $('mode');
  const modelEl = $('model');

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('claudeae.' + key); return v === null ? fallback : v; } catch (e) { return fallback; }
    },
    set(key, value) {
      try {
        if (value === null || value === undefined) localStorage.removeItem('claudeae.' + key);
        else localStorage.setItem('claudeae.' + key, value);
      } catch (e) {}
    }
  };

  let session = null;
  let resumeId = store.get('sessionId', null);
  let busy = false;
  let restartPending = false;
  let interrupting = false;
  let attachments = [];
  let turn = null; // DOM state for the reply being streamed
  const toolEls = {}; // tool_use_id -> chip element

  modeEl.value = store.get('mode', 'ae');
  modelEl.value = store.get('model', '');

  // ---------- Theme from the host skin ----------
  function applyHostSkin() {
    try {
      const env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
      const c = env.appSkinInfo.panelBackgroundColor.color;
      const rgb = (k) => Math.round(c[k]);
      const shade = (d) => `rgb(${[rgb('red'), rgb('green'), rgb('blue')].map((v) => Math.max(0, Math.min(255, v + d))).join(',')})`;
      const root = document.documentElement.style;
      root.setProperty('--bg', shade(0));
      root.setProperty('--bg-raised', shade(10));
      root.setProperty('--bg-input', shade(-8));
      root.setProperty('--border', shade(23));
      root.setProperty('--user-bg', shade(17));
      root.setProperty('--code-bg', shade(-12));
    } catch (e) {}
  }
  applyHostSkin();
  try {
    window.__adobe_cep__.addEventListener('com.adobe.csxs.events.ThemeColorChanged', applyHostSkin);
  } catch (e) {}

  // ---------- Bridge status ----------
  AEBridge.start();
  const bridgeEl = $('bridge');
  const bridgeLabel = $('bridge-label');
  function showBridge(state) {
    bridgeEl.className = 'bridge';
    if (state.status === 'listening' || state.status === 'shared') {
      bridgeEl.classList.add(state.busy ? 'busy' : 'ok');
      bridgeLabel.textContent = state.busy ? 'Running ' + (state.lastCommand || '') : 'Bridge on';
      bridgeEl.title = state.lastMs !== null
        ? `Fast bridge on. Last command: ${state.lastCommand} in ${state.lastMs} ms (${state.commands} run from this panel)`
        : 'Fast bridge on: MCP commands go straight into After Effects';
    } else if (state.status === 'error') {
      bridgeEl.classList.add('down');
      bridgeLabel.textContent = 'Bridge error';
      bridgeEl.title = state.error || '';
    } else {
      bridgeLabel.textContent = 'Bridge…';
    }
  }
  AEBridge.onState(showBridge);

  // ---------- Rendering helpers ----------
  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function nearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
  }

  function scrollDown(force) {
    if (force || nearBottom()) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function append(node, force) {
    const stick = force || nearBottom();
    $('empty').style.display = 'none';
    messagesEl.appendChild(node);
    if (stick) messagesEl.scrollTop = messagesEl.scrollHeight;
    return node;
  }

  function notice(text, kind) {
    const n = el('div', 'notice' + (kind ? ' ' + kind : ''));
    n.innerHTML = renderInlineNotice(text);
    return append(n, true);
  }

  function renderInlineNotice(text) {
    return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  const CONTEXT_RE = /^<ae_context>[\s\S]*?<\/ae_context>\s*/;

  function renderUser(text, images, hadContext, container) {
    const m = el('div', 'msg user');
    (images || []).forEach((src) => {
      const img = el('img');
      img.src = src;
      m.appendChild(img);
    });
    m.appendChild(document.createTextNode(text));
    if (hadContext) m.appendChild(el('span', 'ctx', '+ selection context'));
    if (container) container.appendChild(m);
    else append(m, true);
    return m;
  }

  function toolLabel(name) {
    const m = name.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
    if (m) return { name: m[2], server: m[1] };
    return { name, server: null };
  }

  function toolSummary(name, input) {
    if (!input || typeof input !== 'object') return '';
    if (input.command && typeof input.command === 'string') return input.command;
    if (input.file_path) return input.file_path;
    if (input.pattern) return input.pattern;
    if (input.url) return input.url;
    if (input.query) return input.query;
    if (input.description) return input.description;
    const parts = [];
    for (const k of Object.keys(input)) {
      const v = input[k];
      if (v === undefined || v === null || v === '') continue;
      let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (s.length > 40) s = s.slice(0, 40) + '…';
      parts.push(k + ': ' + s);
      if (parts.length >= 4) break;
    }
    return parts.join(', ');
  }

  function toolResultText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[image]' : '')).join('\n');
    }
    return JSON.stringify(content);
  }

  function makeToolChip(id, name, input) {
    const label = toolLabel(name);
    const chip = el('div', 'tool running');
    chip.innerHTML = '<div class="head"><span class="status">●</span><span class="name"></span><span class="summary"></span><span class="time"></span></div>' +
      '<div class="detail"><div class="label">Input</div><pre class="input"></pre><div class="result-wrap" style="display:none"><div class="label">Result</div><pre class="result"></pre></div></div>';
    chip.querySelector('.name').textContent = label.name;
    chip.querySelector('.head').addEventListener('click', () => chip.classList.toggle('open'));
    chip.started = Date.now();
    chip.toolName = name;
    if (input) setToolInput(chip, input);
    toolEls[id] = chip;
    return chip;
  }

  function setToolInput(chip, input) {
    chip.querySelector('.summary').textContent = toolSummary(chip.toolName, input);
    chip.querySelector('.input').textContent = JSON.stringify(input, null, 2);
  }

  function finishTool(id, content, isError, live) {
    const chip = toolEls[id];
    if (!chip) return;
    chip.classList.remove('running');
    chip.classList.add(isError ? 'error' : 'done');
    chip.querySelector('.status').textContent = isError ? '✕' : '✓';
    if (live) {
      const ms = Date.now() - chip.started;
      chip.querySelector('.time').textContent = ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s';
    }
    let text = toolResultText(content);
    if (text.length > 6000) text = text.slice(0, 6000) + '\n…';
    chip.querySelector('.result').textContent = text;
    chip.querySelector('.result-wrap').style.display = '';
  }

  // ---------- Streaming reply ----------
  function startTurn() {
    if (turn) return turn;
    const root = el('div', 'msg assistant');
    const working = el('div', 'working', 'Working…');
    append(root);
    append(working);
    turn = { root, working, blocks: {}, streamedIds: new Set(), started: Date.now(), current: null };
    return turn;
  }

  function endTurn(meta) {
    if (!turn) return;
    turn.working.remove();
    if (meta) turn.root.appendChild(el('div', 'turn-meta', escapeHtml(meta)));
    turn = null;
  }

  let renderQueued = new Set();
  function queueRender(block) {
    renderQueued.add(block);
    if (renderQueued.size === 1) {
      requestAnimationFrame(() => {
        const stick = nearBottom();
        renderQueued.forEach((b) => { b.el.innerHTML = renderMarkdown(b.text); });
        renderQueued = new Set();
        if (stick) scrollDown(true);
      });
    }
  }

  function handleStreamEvent(event) {
    const t = startTurn();
    if (event.type === 'message_start') {
      t.messageId = event.message && event.message.id;
      if (t.messageId) t.streamedIds.add(t.messageId);
      t.blocks = {};
      return;
    }
    if (event.type === 'content_block_start') {
      const cb = event.content_block;
      const block = { type: cb.type, text: '', json: '' };
      if (cb.type === 'text') {
        block.el = el('div', 'text');
        t.root.appendChild(block.el);
      } else if (cb.type === 'thinking') {
        block.el = el('div', 'thinking', 'Thinking…<div class="body"></div>');
        block.el.addEventListener('click', () => block.el.classList.toggle('open'));
        t.root.appendChild(block.el);
      } else if (cb.type === 'tool_use' || cb.type === 'server_tool_use' || cb.type === 'mcp_tool_use') {
        block.id = cb.id;
        block.el = makeToolChip(cb.id, cb.name, null);
        t.root.appendChild(block.el);
      }
      t.blocks[event.index] = block;
      scrollDown();
      return;
    }
    const block = t.blocks[event.index];
    if (!block) return;
    if (event.type === 'content_block_delta') {
      const d = event.delta;
      if (d.type === 'text_delta') {
        block.text += d.text;
        queueRender(block);
      } else if (d.type === 'thinking_delta') {
        block.text += d.thinking;
        block.el.querySelector('.body').textContent = block.text;
      } else if (d.type === 'input_json_delta') {
        block.json += d.partial_json;
      }
    } else if (event.type === 'content_block_stop') {
      if (block.id && block.json) {
        try { setToolInput(block.el, JSON.parse(block.json)); } catch (e) {}
      }
    }
  }

  // A complete assistant message that wasn't streamed (or history replay)
  function renderAssistantContent(content, container, live) {
    content.forEach((c) => {
      if (c.type === 'text' && c.text.trim()) {
        container.appendChild(el('div', 'text', renderMarkdown(c.text)));
      } else if (c.type === 'tool_use') {
        const chip = makeToolChip(c.id, c.name, c.input);
        if (!live) chip.classList.remove('running');
        container.appendChild(chip);
      }
    });
  }

  function handleMessage(msg) {
    if (msg.parent_tool_use_id) return; // subagent traffic

    if (msg.type === 'system' && msg.subtype === 'init') {
      resumeId = msg.session_id;
      store.set('sessionId', resumeId);
      const ae = (msg.mcp_servers || []).find((s) => s.name === 'AfterEffectsMCP');
      if (!ae) {
        notice('The AfterEffectsMCP server isn\'t configured for Claude Code, so Claude can chat but not edit the project.', 'warn');
      } else if (ae.status === 'failed' || ae.status === 'needs-auth') {
        notice('AfterEffectsMCP server status: ' + ae.status + '. Claude may not be able to edit the project.', 'warn');
      }
      return;
    }

    if (msg.type === 'stream_event') {
      handleStreamEvent(msg.event);
      return;
    }

    if (msg.type === 'assistant') {
      const t = startTurn();
      const id = msg.message && msg.message.id;
      if (!(id && t.streamedIds.has(id))) {
        renderAssistantContent(msg.message.content || [], t.root, true);
      }
      if (msg.error === 'authentication_failed' || msg.is_api_error_message) {
        showApiError(toolResultText(msg.message.content));
      }
      scrollDown();
      return;
    }

    if (msg.type === 'user') {
      const content = msg.message && msg.message.content;
      if (Array.isArray(content)) {
        content.forEach((c) => {
          if (c.type === 'tool_result') finishTool(c.tool_use_id, c.content, c.is_error, true);
        });
      }
      return;
    }

    if (msg.type === 'result') {
      const secs = ((msg.duration_ms || 0) / 1000).toFixed(1);
      let meta = secs + ' s';
      if (msg.is_error && msg.subtype !== 'success') meta += ' · ' + msg.subtype.replace(/_/g, ' ');
      endTurn(meta);
      setBusy(false);
      if (restartPending) restartSession();
    }
  }

  function showApiError(text) {
    if (/authenticat|log ?in|oauth/i.test(text)) {
      notice('Claude Code isn\'t logged in. Open Terminal, run `claude`, type `/login`, then send your message again.', 'error');
    }
  }

  // ---------- Permissions ----------
  function handlePermission(message) {
    const req = message.request;
    const card = el('div', 'permission');
    const label = toolLabel(req.tool_name);
    const startTurnIfNeeded = startTurn();

    const resolve = (result, text) => {
      session.respondPermission(message.request_id, result);
      card.classList.add('resolved');
      card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      card.querySelector('.title').textContent = text;
    };

    if (req.tool_name === 'AskUserQuestion' && req.input && Array.isArray(req.input.questions)) {
      renderQuestions(card, req, resolve);
    } else {
      card.innerHTML = '<div class="title"></div><pre></pre><div class="actions"></div>';
      card.querySelector('.title').textContent = 'Allow ' + label.name + (label.server ? ' (' + label.server + ')' : '') + '?';
      const input = req.input || {};
      // Claude-written ExtendScript: show the script itself, and ask every time
      const isJsx = req.tool_name === 'mcp__AfterEffectsMCP__execute-jsx' && typeof input.code === 'string';
      const pre = card.querySelector('pre');
      if (isJsx) {
        card.querySelector('.title').textContent = 'Run this script in After Effects?' + (input.undoName ? ' (' + input.undoName + ')' : '');
        pre.classList.add('code');
        pre.textContent = input.code;
      } else {
        pre.textContent = input.command || JSON.stringify(input, null, 2);
      }
      const actions = card.querySelector('.actions');
      const allow = el('button', 'primary', isJsx ? 'Run' : 'Allow');
      allow.onclick = () => resolve({ behavior: 'allow', updatedInput: input }, isJsx ? 'Ran script' : 'Allowed ' + label.name);
      actions.appendChild(allow);
      if (!isJsx && req.permission_suggestions && req.permission_suggestions.length) {
        const always = el('button', '', 'Always allow');
        always.title = 'Allow this kind of call for the rest of the session';
        always.onclick = () => resolve({ behavior: 'allow', updatedInput: input, updatedPermissions: req.permission_suggestions }, 'Always allowed ' + label.name);
        actions.appendChild(always);
      }
      const deny = el('button', '', 'Deny');
      deny.onclick = () => resolve({ behavior: 'deny', message: 'The user denied this in the After Effects panel.' }, 'Denied ' + label.name);
      actions.appendChild(deny);
    }
    startTurnIfNeeded.root.appendChild(card);
    scrollDown(true);
  }

  function renderQuestions(card, req, resolve) {
    const answers = {};
    card.innerHTML = '<div class="title">Claude has a question</div>';
    const questions = req.input.questions;
    const submit = el('button', 'primary', 'Send answers');
    submit.disabled = true;
    questions.forEach((q) => {
      card.appendChild(el('div', 'question', '<strong>' + escapeHtml(q.question) + '</strong>'));
      const opts = el('div', 'options');
      (q.options || []).forEach((o) => {
        const b = el('button', '', escapeHtml(o.label) + (o.description ? '<span class="desc">' + escapeHtml(o.description) + '</span>' : ''));
        b.onclick = () => {
          if (q.multiSelect) {
            b.classList.toggle('chosen');
            const chosen = [...opts.querySelectorAll('.chosen')].map((x) => x.firstChild.textContent);
            if (chosen.length) answers[q.question] = chosen.join(', ');
            else delete answers[q.question];
          } else {
            opts.querySelectorAll('button').forEach((x) => x.classList.remove('chosen'));
            b.classList.add('chosen');
            answers[q.question] = o.label;
          }
          submit.disabled = Object.keys(answers).length < questions.length;
        };
        opts.appendChild(b);
      });
      card.appendChild(opts);
    });
    const actions = el('div', 'actions');
    actions.style.marginTop = '8px';
    submit.onclick = () => resolve({ behavior: 'allow', updatedInput: Object.assign({}, req.input, { answers }) }, 'Answered');
    const skip = el('button', '', 'Skip');
    skip.onclick = () => resolve({ behavior: 'deny', message: 'The user skipped the question.' }, 'Skipped');
    actions.appendChild(submit);
    actions.appendChild(skip);
    card.appendChild(actions);
  }

  // ---------- Session lifecycle ----------
  function ensureSession() {
    if (session && session.isRunning()) return session;
    session = new ClaudeSession({ mode: modeEl.value, model: modelEl.value, cwd: CLAUDE_CWD });
    session.on('message', handleMessage);
    session.on('permission', handlePermission);
    session.on('error', (error) => {
      notice('Could not start Claude Code: ' + error.message, 'error');
      setBusy(false);
    });
    const thisSession = session;
    session.on('exit', (info) => {
      if (thisSession !== session) return;
      if (busy && interrupting) {
        endTurn('Stopped');
        setBusy(false);
      } else if (busy) {
        endTurn();
        setBusy(false);
        const tail = (info.stderr || '').trim().split('\n').slice(-6).join('\n');
        notice('Claude Code stopped unexpectedly' + (info.code !== null ? ' (exit ' + info.code + ')' : '') + (tail ? ':\n' + tail : '.'), 'error');
        showApiError(info.stderr || '');
      }
    });
    session.start(resumeId);
    return session;
  }

  function restartSession() {
    restartPending = false;
    if (session) {
      const old = session;
      session = null;
      old.stop();
    }
  }

  function setBusy(value) {
    busy = value;
    if (!value) interrupting = false;
    sendBtn.textContent = value ? 'Stop' : 'Send';
    sendBtn.classList.toggle('stop', value);
  }

  async function getAEContext() {
    try {
      await AEBridge.loadJsx('panel-context.jsx', 'claudePanelContext');
      const result = await AEBridge.evalScript('claudePanelContext()');
      if (!result || result === 'EvalScript error.') return null;
      return result;
    } catch (e) {
      return null;
    }
  }

  async function send() {
    if (busy) {
      if (session) {
        interrupting = true;
        session.interrupt();
      }
      return;
    }
    const text = inputEl.value.trim();
    if (!text && !attachments.length) return;

    const images = attachments.slice();
    attachments = [];
    renderAttachments();
    inputEl.value = '';
    autosize();

    let context = null;
    if ($('send-context').checked) context = await getAEContext();

    renderUser(text, images.map((a) => a.dataUrl), !!context);

    const content = images.map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } }));
    content.push({ type: 'text', text: (context ? '<ae_context>\n' + context + '\n</ae_context>\n\n' : '') + (text || 'See the attached image.') });

    setBusy(true);
    startTurn();
    try {
      ensureSession().sendUser(content);
    } catch (e) {
      endTurn();
      setBusy(false);
      notice(e.message, 'error');
    }
  }

  function newChat() {
    if (session) {
      const old = session;
      session = null;
      old.stop();
    }
    resumeId = null;
    store.set('sessionId', null);
    turn = null;
    setBusy(false);
    messagesEl.querySelectorAll(':scope > :not(#empty)').forEach((n) => n.remove());
    $('empty').style.display = '';
    inputEl.focus();
  }

  function onSettingChange() {
    store.set('mode', modeEl.value);
    store.set('model', modelEl.value);
    // The new settings apply when Claude restarts; the conversation resumes where it was
    if (busy) restartPending = true;
    else restartSession();
  }

  // ---------- History of the last chat ----------
  function renderHistory(sessionId) {
    let entries;
    try {
      entries = ClaudeSession.loadTranscript(CLAUDE_CWD, sessionId);
    } catch (e) {
      entries = null;
    }
    if (!entries || !entries.length) return false;
    const wrap = el('div', 'history');
    let current = null;
    const results = [];
    entries.forEach((entry) => {
      const content = entry.message.content;
      if (entry.type === 'user') {
        if (typeof content === 'string') {
          current = null;
          if (!content.startsWith('<')) renderUser(content, [], false, wrap);
          else if (CONTEXT_RE.test(content)) renderUser(content.replace(CONTEXT_RE, ''), [], true, wrap);
        } else if (Array.isArray(content)) {
          const textPart = content.find((c) => c.type === 'text');
          const imgs = content.filter((c) => c.type === 'image' && c.source && c.source.data)
            .map((c) => 'data:' + c.source.media_type + ';base64,' + c.source.data);
          content.filter((c) => c.type === 'tool_result').forEach((c) => results.push(c));
          if (textPart && !content.some((c) => c.type === 'tool_result')) {
            const raw = textPart.text;
            if (raw.startsWith('<') && !CONTEXT_RE.test(raw)) return;
            current = null;
            renderUser(raw.replace(CONTEXT_RE, ''), imgs, CONTEXT_RE.test(raw), wrap);
          }
        }
      } else if (entry.type === 'assistant' && Array.isArray(content)) {
        if (!current) {
          current = el('div', 'msg assistant');
          wrap.appendChild(current);
        }
        renderAssistantContent(content, current, false);
      }
    });
    results.forEach((r) => finishTool(r.tool_use_id, r.content, r.is_error, false));
    if (!wrap.children.length) return false;
    $('empty').style.display = 'none';
    messagesEl.appendChild(wrap);
    messagesEl.appendChild(el('div', 'history-label', 'Earlier in this chat · press + for a new one'));
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return true;
  }

  // ---------- Attachments ----------
  function addAttachment(dataUrl) {
    const m = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.*)$/);
    if (!m) return;
    attachments.push({ dataUrl, mediaType: m[1], data: m[2] });
    renderAttachments();
  }

  function renderAttachments() {
    const box = $('attachments');
    box.innerHTML = '';
    attachments.forEach((a, i) => {
      const item = el('div', 'attachment');
      const img = el('img');
      img.src = a.dataUrl;
      const remove = el('button', '', '×');
      remove.onclick = () => { attachments.splice(i, 1); renderAttachments(); };
      item.appendChild(img);
      item.appendChild(remove);
      box.appendChild(item);
    });
  }

  function waitForStableFile(file, timeoutMs) {
    const start = Date.now();
    let lastSize = -1;
    return new Promise((resolve, reject) => {
      const tick = () => {
        let size = -1;
        try { size = fs.statSync(file).size; } catch (e) {}
        if (size > 0 && size === lastSize) return resolve();
        lastSize = size;
        if (Date.now() - start > timeoutMs) return reject(new Error('Timed out rendering the frame'));
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  async function attachFrame() {
    const btn = $('attach-frame');
    btn.disabled = true;
    try {
      if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });
      const file = path.join(FRAMES_DIR, 'panel-' + Date.now() + '.png');
      const result = await AEBridge.evalScript(
        '(function(){ var c = app.project.activeItem; if (!(c instanceof CompItem)) return "NOCOMP"; ' +
        'c.saveFrameToPng(c.time, new File(' + AEBridge.jsxString(file) + ')); return "ok"; })()');
      if (result === 'NOCOMP') throw new Error('Open a composition first.');
      if (result !== 'ok') throw new Error('After Effects could not render the frame.');
      await waitForStableFile(file, 20000);
      // Keep images small enough for the API and the context window
      try { childProcess.execFileSync('/usr/bin/sips', ['-Z', '1280', file], { stdio: 'ignore' }); } catch (e) {}
      addAttachment('data:image/png;base64,' + fs.readFileSync(file).toString('base64'));
    } catch (e) {
      notice(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Input ----------
  function autosize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight + 2, 180) + 'px';
  }

  inputEl.addEventListener('input', autosize);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  inputEl.addEventListener('paste', (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => addAttachment(reader.result);
        reader.readAsDataURL(item.getAsFile());
      }
    }
  });

  // CEP panels on macOS don't get the standard edit shortcuts by default
  document.addEventListener('keydown', (e) => {
    if (!e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const editable = document.activeElement === inputEl;
    if (key === 'c') { document.execCommand('copy'); e.preventDefault(); }
    else if (key === 'a') {
      if (editable) inputEl.select();
      else {
        const range = document.createRange();
        range.selectNodeContents(messagesEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      e.preventDefault();
    } else if (editable && key === 'x') { document.execCommand('cut'); e.preventDefault(); }
    else if (editable && key === 'z') { document.execCommand(e.shiftKey ? 'redo' : 'undo'); e.preventDefault(); }
    else if (editable && key === 'v') {
      e.preventDefault();
      if (!document.execCommand('paste')) {
        try {
          const text = childProcess.execFileSync('/usr/bin/pbpaste', { encoding: 'utf8' });
          document.execCommand('insertText', false, text);
        } catch (err) {}
      }
    }
  });

  messagesEl.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-href]');
    if (a) {
      e.preventDefault();
      try { window.cep.util.openURLInDefaultBrowser(a.dataset.href); } catch (err) {}
    }
  });

  sendBtn.addEventListener('click', send);
  $('new-chat').addEventListener('click', newChat);
  $('attach-frame').addEventListener('click', attachFrame);
  modeEl.addEventListener('change', onSettingChange);
  modelEl.addEventListener('change', onSettingChange);

  // Stop Claude when the panel closes
  window.addEventListener('beforeunload', () => { if (session) session.stop(); });

  if (resumeId && !renderHistory(resumeId)) {
    resumeId = null;
    store.set('sessionId', null);
  }
  if (!ClaudeSession.findClaude()) {
    notice('Could not find the `claude` command. Install Claude Code, then reopen this panel.', 'error');
  }
  inputEl.focus();
})();
