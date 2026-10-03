/* ============================================================================
 * KJ Live Javascript — page controller
 * ---------------------------------------------------------------------------
 * Everything that touches the DOM: the output pane, the run/stop lifecycle, the
 * buttons, the language switch, the divider and the boot sequence. Loaded last.
 *
 * How a run works (no backend anywhere):
 *   1. The editor's source is run along with a freshly emptied output pane.
 *   2. A Web Worker is booted from a Blob — a separate realm with no DOM, no
 *      cookies, no storage and no access to this page.
 *   3. Inside it, console.log / warn / error / info / debug are replaced by
 *      functions that pretty-print their arguments and postMessage them back.
 *   4. Those messages are appended to the output pane. Syntax errors, runtime
 *      errors and unhandled rejections all land there too.
 *   5. Because a Worker shares no event loop, terminate() can kill a runaway
 *      script — that is what the Stop button and the watchdog use.
 *
 * Every visible string comes from js/i18n.js, so switching language repaints
 * the page *and* the messages already on screen.
 * ========================================================================== */
'use strict';

(function () {

  var CONFIG = KJ.CONFIG;
  var editor = KJ.editor;

  /* -------------------------------------------------------------------------
   * 1. DOM references
   * ---------------------------------------------------------------------- */
  var el = {
    runBtn:      document.getElementById('runBtn'),
    stopBtn:     document.getElementById('stopBtn'),
    clearBtn:    document.getElementById('clearBtn'),
    clearSmall:  document.getElementById('clearBtnSmall'),
    editorPane:  document.getElementById('editorPane'),
    consolePane: document.getElementById('consolePane'),
    workspace:   document.getElementById('workspace'),
    divider:     document.getElementById('divider'),
    output:      document.getElementById('output'),
    emptyState:  document.getElementById('emptyState'),
    counter:     document.getElementById('counter'),
    timing:      document.getElementById('timing'),
    statusDot:   document.getElementById('statusDot'),
    statusText:  document.getElementById('statusText'),
    liveStatus:  document.getElementById('liveStatus')
  };

  var state = {
    worker: null,
    timer: null,
    lingerTimer: null,
    running: false,
    log: [],            // every message, so a language switch can repaint them
    limited: false,     // has the row cap been hit?
    statusKey: 'status.ready',
    statusDot: 'bg-emerald-400',
    statusPulse: false
  };

  /* Per-level styling for one output row (language-neutral). */
  var LEVEL_STYLES = {
    log:    { text: 'text-slate-200', bar: 'border-l-transparent' },
    warn:   { text: 'text-amber-300',  bar: 'border-l-amber-400/70', tag: 'output.tag.warn',  tagBorder: 'border-amber-400/40' },
    error:  { text: 'text-rose-300',   bar: 'border-l-rose-500/70',  tag: 'output.tag.error', tagBorder: 'border-rose-400/40' },
    system: { text: 'text-slate-400',  bar: 'border-l-sky-500/50' }
  };

  /* -------------------------------------------------------------------------
   * 2. Output pane
   * ---------------------------------------------------------------------- */

  /** "3 messages" / "1 message" — English needs the singular, Indonesian does not. */
  function counterText(n) {
    return KJ.t(n === 1 ? 'output.counterOne' : 'output.counter', { n: n });
  }

  /** Remove every message (used on each run and by the Clear button). */
  function clearOutput() {
    state.log.length = 0;
    state.limited = false;
    el.output.textContent = '';
    el.output.appendChild(el.emptyState);
    el.counter.textContent = counterText(0);
  }

  /** True when the user is at (or near) the bottom, so we may auto-scroll. */
  function isPinnedToBottom() {
    var o = el.output;
    return o.scrollHeight - o.scrollTop - o.clientHeight < 48;
  }

  /** Build one output row in the DOM. */
  function renderRow(index, level, text) {
    var styles = LEVEL_STYLES[level] || LEVEL_STYLES.log;
    var row = document.createElement('div');
    row.className = 'kj-row flex items-start gap-2.5 border-l-2 px-3 py-[3px] hover:bg-white/[.03] ' + styles.bar;

    var number = document.createElement('span');
    number.className = 'mt-[1px] w-8 shrink-0 select-none text-right font-mono text-[11px] leading-relaxed text-slate-600';
    number.textContent = index;

    var body = document.createElement('pre');
    body.className = 'kj-scroll min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed ' +
      styles.text + (level === 'error' ? ' font-semibold' : '');
    body.textContent = text;   // textContent => output can never inject HTML

    row.appendChild(number);
    row.appendChild(body);

    if (styles.tag) {
      var tag = document.createElement('span');
      tag.className = 'kj-tag shrink-0 rounded border px-1.5 py-[1px] font-sans text-[9px] font-bold uppercase tracking-wider opacity-80 ' +
        styles.tagBorder;
      tag.textContent = KJ.t(styles.tag);
      row.appendChild(tag);
    }

    return row;
  }

  /** The "that is a lot of output" notice. */
  function renderLimitNote() {
    var note = document.createElement('div');
    note.className = 'px-3 py-2 text-[11px] text-amber-400/90';
    note.textContent = KJ.t('output.limit', { max: CONFIG.maxRows });
    return note;
  }

  /**
   * Record a message and show it.
   * @param {'log'|'warn'|'error'|'system'} level
   * @param {string} text
   */
  function appendMessage(level, text) {
    var wasPinned = isPinnedToBottom();
    var first = state.log.length === 0;

    if (first) el.output.textContent = '';   // first message drops the empty state

    if (state.log.length < CONFIG.maxRows) {
      state.log.push({ level: level, text: text });
      el.output.appendChild(renderRow(state.log.length, level, text));
    } else if (!state.limited) {
      state.limited = true;                  // one notice only, however noisy it gets
      el.output.appendChild(renderLimitNote());
    }

    el.counter.textContent = counterText(state.log.length);
    if (wasPinned) el.output.scrollTop = el.output.scrollHeight;
  }

  /** Repaint every message from scratch (used when the language changes). */
  function renderAll() {
    var wasPinned = state.log.length === 0 || isPinnedToBottom();
    el.output.textContent = '';
    if (!state.log.length) {
      el.output.appendChild(el.emptyState);
    } else {
      state.log.forEach(function (entry, i) {
        el.output.appendChild(renderRow(i + 1, entry.level, entry.text));
      });
      if (state.limited) el.output.appendChild(renderLimitNote());
    }
    el.counter.textContent = counterText(state.log.length);
    if (wasPinned) el.output.scrollTop = el.output.scrollHeight;
  }

  /** Update the header pill. `key` is a dictionary key. */
  function setStatus(key, dotClass, pulse) {
    state.statusKey = key;
    state.statusDot = dotClass;
    state.statusPulse = !!pulse;
    el.statusText.textContent = KJ.t(key);
    el.statusDot.className = 'h-1.5 w-1.5 rounded-full ' + dotClass + (pulse ? ' kj-pulse' : '');
  }

  /** Announce a result to screen readers. */
  function announce(key, vars) {
    el.liveStatus.textContent = KJ.t(key, vars);
  }

  /* -------------------------------------------------------------------------
   * 3. Run / stop lifecycle
   * ---------------------------------------------------------------------- */

  /** Execute the editor's code in an isolated sandbox. */
  function runCode() {
    var code = editor.getValue();

    // Requirement: the output pane is wiped on every run.
    clearOutput();
    el.timing.textContent = '';
    state.timingText = 0;
    disposeWorker();          // cancel any previous run and its pending async work
    el.output.scrollTop = 0;

    if (!code.trim()) {
      appendMessage('system', KJ.t('run.empty'));
      setStatus('status.empty', 'bg-slate-400', false);
      announce('a11y.empty');
      return;
    }

    var worker;
    try {
      var blob = new Blob([KJ.buildWorkerSource()], { type: 'text/javascript' });
      worker = new Worker(URL.createObjectURL(blob));
    } catch (err) {
      // Extremely rare (e.g. blob URLs blocked by a strict CSP policy).
      appendMessage('system', KJ.t('run.fallback'));
      runOnMainThread(code);
      return;
    }

    state.worker = worker;
    state.running = true;
    syncStopBtn();
    setStatus('status.running', 'bg-amber-400', true);

    // Endless-loop guard: the worker shares no event loop, so terminate() works.
    state.timer = window.setTimeout(function () {
      appendMessage('error', KJ.t('run.timeout'));
      disposeWorker();
      setStatus('status.timeout', 'bg-rose-400', false);
      announce('a11y.timeout');
    }, CONFIG.timeoutMs);

    worker.onmessage = function (event) {
      var msg = event.data || {};

      if (msg.type === 'log') {
        appendMessage(msg.level, msg.text);
        if (msg.uncaught) {
          finishRun();
          setStatus('status.runtime', 'bg-rose-400', false);
          announce('a11y.runtime');
        }
      } else if (msg.type === 'done') {
        finishRun();
        state.timingText = msg.ms;
        el.timing.textContent = KJ.t('run.finishedIn', { ms: msg.ms });
        if (!msg.failed) {
          setStatus('status.finished', 'bg-emerald-400', false);
          announce('a11y.finished', { ms: msg.ms });
        } else if (msg.uncaught) {
          // Thrown from a timer or promise: already reported above, keep that wording.
          setStatus('status.runtime', 'bg-rose-400', false);
          announce('a11y.runtime');
        } else {
          setStatus('status.error', 'bg-rose-400', false);
          announce('a11y.error');
        }
      }
    };

    worker.onerror = function (event) {
      appendMessage('error', 'Sandbox error: ' + (event.message || 'unknown failure'));
      disposeWorker();
      setStatus('status.error', 'bg-rose-400', false);
      announce('a11y.error');
    };

    worker.postMessage({ code: code });
  }

  /** Stop is only meaningful while code is actually executing. */
  function syncStopBtn() {
    el.stopBtn.disabled = !state.running;
  }

  /** Synchronous execution ended: cancel the watchdog but keep the realm alive
   *  briefly so async logs (setTimeout, promises) still print. */
  function finishRun() {
    window.clearTimeout(state.timer);
    state.timer = null;
    state.running = false;
    state.lingerTimer = window.setTimeout(disposeWorker, CONFIG.asyncLingerMs);
    syncStopBtn();
  }

  /** Tear down the active sandbox (safe to call when nothing is running). */
  function disposeWorker() {
    window.clearTimeout(state.timer);
    window.clearTimeout(state.lingerTimer);
    state.timer = null;
    state.lingerTimer = null;
    if (state.worker) {
      state.worker.onmessage = null;
      state.worker.onerror = null;
      state.worker.terminate();
      state.worker = null;
    }
    state.running = false;
    syncStopBtn();
  }

  /** User pressed Stop (or Esc). */
  function stopRun() {
    if (!state.running) return;
    disposeWorker();
    appendMessage('system', KJ.t('run.stopped'));
    setStatus('status.stopped', 'bg-slate-400', false);
    announce('a11y.stopped');
  }

  /* -------------------------------------------------------------------------
   * 4. Fallback runner
   *
   * Used only when a Web Worker cannot be started. Same interception and the
   * same try/catch semantics, but on the main thread: no Stop button, no
   * endless-loop guard and no async output.
   * ---------------------------------------------------------------------- */
  function runOnMainThread(code) {
    var original = {};
    ['log', 'info', 'debug', 'warn', 'error'].forEach(function (level) {
      original[level] = console[level];
      console[level] = function () {
        var text = Array.prototype.map.call(arguments, function (arg) {
          return typeof arg === 'string' ? arg : KJ.inspect(arg, 0, new WeakSet());
        }).join(' ');
        appendMessage(level, text);
      };
    });

    var startedAt = performance.now();
    try {
      new Function(code)();   // eslint-disable-line no-new-func
      state.timingText = Math.round(performance.now() - startedAt);
      el.timing.textContent = KJ.t('run.finishedIn', { ms: state.timingText });
      setStatus('status.finished', 'bg-emerald-400', false);
    } catch (error) {
      appendMessage('error', KJ.inspect(error, 0, new WeakSet()));
      setStatus('status.error', 'bg-rose-400', false);
    } finally {
      Object.keys(original).forEach(function (level) { console[level] = original[level]; });
    }
  }

  /* -------------------------------------------------------------------------
   * 5. UI wiring
   * ---------------------------------------------------------------------- */
  el.runBtn.addEventListener('click', function () { runCode(); });
  el.stopBtn.addEventListener('click', stopRun);
  el.clearBtn.addEventListener('click', function () { clearOutput(); editor.focus(); });
  el.clearSmall.addEventListener('click', function () { clearOutput(); editor.focus(); });

  // Language buttons
  Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (button) {
    button.addEventListener('click', function () {
      KJ.setLang(button.getAttribute('data-lang'));
      editor.focus();
    });
  });

  // Ctrl/Cmd + Enter also runs the code (kept as a shortcut, not advertised).
  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runCode();
    }
  });

  // Make sure no worker survives a navigation.
  window.addEventListener('beforeunload', disposeWorker);

  /* -------------------------------------------------------------------------
   * 6. Draggable divider (desktop)
   * Double-click resets the even split; arrow keys resize when focused.
   * ---------------------------------------------------------------------- */
  (function initDivider() {
    var MIN = 20;   // percent
    var MAX = 80;
    var dragging = false;

    function setRatio(ratio) {
      var clamped = Math.min(MAX, Math.max(MIN, ratio));
      el.editorPane.style.flex = '0 0 ' + clamped + '%';
      el.consolePane.style.flex = '1 1 0%';
      editor.refresh();
    }

    el.divider.addEventListener('pointerdown', function (event) {
      dragging = true;
      el.divider.setPointerCapture(event.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      event.preventDefault();
    });

    el.divider.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var rect = el.workspace.getBoundingClientRect();
      setRatio(((event.clientX - rect.left) / rect.width) * 100);
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      if (event.pointerId !== undefined && el.divider.hasPointerCapture(event.pointerId)) {
        el.divider.releasePointerCapture(event.pointerId);
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    el.divider.addEventListener('pointerup', endDrag);
    el.divider.addEventListener('pointercancel', endDrag);
    el.divider.addEventListener('dblclick', function () {
      el.editorPane.style.flex = '';
      el.consolePane.style.flex = '';
      editor.refresh();
    });

    el.divider.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      var rect = el.workspace.getBoundingClientRect();
      var current = el.editorPane.getBoundingClientRect().width / rect.width * 100;
      setRatio(current + (event.key === 'ArrowLeft' ? -2 : 2));
    });
  })();

  /* -------------------------------------------------------------------------
   * 7. Language changes
   * ---------------------------------------------------------------------- */
  KJ.onLangChange = function onLangChange() {
    el.timing.textContent = state.timingText ? KJ.t('run.finishedIn', { ms: state.timingText }) : '';
    setStatus(state.statusKey, state.statusDot, state.statusPulse);
    renderAll();
    KJ.refreshMeta();
  };

  /* -------------------------------------------------------------------------
   * 8. Boot
   * ---------------------------------------------------------------------- */
  KJ.runCode = runCode;   // published for the editor's keyboard shortcuts
  KJ.stopRun = stopRun;

  KJ.paint();             // first paint in the language picked by js/i18n.js
  clearOutput();
  setStatus('status.ready', 'bg-emerald-400', false);
  KJ.refreshMeta();
  editor.focus();

})();