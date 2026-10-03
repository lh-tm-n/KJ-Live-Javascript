/* ============================================================================
 * KJ Live Javascript — the sandbox payload
 * ---------------------------------------------------------------------------
 * This file builds the source of the isolated Web Worker that runs the user's
 * code. It contains:
 *
 *   1. KJ.inspect() — a Node-util.inspect flavoured pretty printer. It is
 *      self-contained on purpose: its source is stringified and injected into
 *      the worker, so it must not reference anything from this file or `window`
 *      (the limits arrive via the injected `KJ.MAX`, see below).
 *   2. KJ.buildWorkerSource() — assembles the worker program: the console
 *      interception, the error handlers and the `new Function()` execution.
 *
 * Loaded second.
 * ========================================================================== */
'use strict';

var KJ = window.KJ || {};

/* ---------------------------------------------------------------------------
 * 1. Value inspector
 * ------------------------------------------------------------------------- */
KJ.inspect = function inspect(value, depth, seen) {
  depth = depth || 0;
  seen = seen || new WeakSet();

  var type = typeof value;

  if (value === null) return 'null';
  if (type === 'undefined') return 'undefined';
  if (type === 'string') {
    return depth === 0 ? clip(value) : JSON.stringify(clip(value));
  }
  if (type === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (type === 'boolean') return String(value);
  if (type === 'bigint') return String(value) + 'n';
  if (type === 'symbol') return value.toString();
  if (type === 'function') {
    var isClass = /^class[\s{]/.test(Function.prototype.toString.call(value));
    if (isClass) return '[class ' + (value.name || 'anonymous') + ']';
    return '[Function' + (value.name ? ': ' + value.name : ' (anonymous)') + ']';
  }

  // Errors read better as "Name: message" plus a cleaned-up stack.
  if (tagOf(value) === '[object Error]') return formatError(value);

  // Circular-reference protection.
  if (seen.has(value)) return '[Circular]';
  if (depth >= KJ.MAX.depth) {
    return Array.isArray(value) ? '[Array]' : (value.constructor && value.constructor.name
      ? '[' + value.constructor.name + ']' : '[Object]');
  }
  seen.add(value);

  var parts = [];
  var tag = tagOf(value);

  try {
    // Typed arrays / DataView
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      var count = Math.min(value.length, KJ.MAX.items);
      for (var i = 0; i < count; i++) {
        parts.push(inspect(value[i], depth + 1, seen));
      }
      if (value.length > KJ.MAX.items) parts.push('... ' + (value.length - KJ.MAX.items) + ' more');
      return value.constructor.name + '(' + value.length + ') [ ' + parts.join(', ') + ' ]';
    }

    // Date / RegExp
    if (tag === '[object Date]') return isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
    if (tag === '[object RegExp]') return String(value);

    // Map
    if (tag === '[object Map]') {
      var mi = 0;
      value.forEach(function (v, k) {
        if (mi++ < KJ.MAX.items) {
          parts.push(inspect(k, depth + 1, seen) + ' => ' + inspect(v, depth + 1, seen));
        }
      });
      return 'Map(' + value.size + ') {' + (mi ? ' ' + parts.join(', ') + ' ' : '') + '}';
    }

    // Set
    if (tag === '[object Set]') {
      var si = 0;
      value.forEach(function (v) {
        if (si++ < KJ.MAX.items) parts.push(inspect(v, depth + 1, seen));
      });
      return 'Set(' + value.size + ') {' + (si ? ' ' + parts.join(', ') + ' ' : '') + '}';
    }

    // Promise (its state is opaque from user land)
    if (tag === '[object Promise]') return '[Promise]';

    // Array
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      var holes = [];
      for (var a = 0; a < value.length && a < KJ.MAX.items; a++) {
        if (a in value) {
          parts.push(inspect(value[a], depth + 1, seen));
        } else {
          holes.push(a);
        }
      }
      if (value.length > KJ.MAX.items) parts.push('... ' + (value.length - KJ.MAX.items) + ' more');
      if (!parts.length) return '[ ' + value.length + ' empty items ]';
      if (holes.length && holes.length !== value.length) parts.push('holes: ' + holes.join(', '));
      return '[ ' + parts.join(', ') + ' ]';
    }

    // Plain object (own enumerable string + symbol keys)
    var own = Object.keys(value);
    Object.getOwnPropertySymbols(value).forEach(function (sym) {
      if (Object.prototype.propertyIsEnumerable.call(value, sym)) own.push(sym);
    });

    for (var j = 0; j < own.length && j < KJ.MAX.items; j++) {
      var key = own[j];
      var label = typeof key === 'symbol'
        ? '[' + key.toString() + ']'
        : (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key));
      var piece;
      try {
        piece = inspect(value[key], depth + 1, seen);
      } catch (err) {
        piece = '[getter threw: ' + (err && err.message) + ']';
      }
      parts.push(label + ': ' + piece);
    }
    if (own.length > KJ.MAX.items) {
      parts.push('... ' + (own.length - KJ.MAX.items) + ' more');
    }

    var ctor = value.constructor && value.constructor.name;
    var prefix = (ctor && ctor !== 'Object') ? ctor + ' ' : '';
    return prefix + (parts.length ? '{ ' + parts.join(', ') + ' }' : '{}');
  } catch (e) {
    return '[unserializable: ' + (e && e.message) + ']';
  } finally {
    seen.delete(value);
  }

  /* -- helpers (nested so the function stays self-contained) --------------- */

  /* Object#toString brand check: survives values from other realms (iframes,
     workers) where `instanceof` would silently return false. */
  function tagOf(v) {
    return Object.prototype.toString.call(v);
  }

  function clip(str) {
    return str.length > KJ.MAX.string
      ? str.slice(0, KJ.MAX.string) + '... [' + (str.length - KJ.MAX.string) + ' more chars]'
      : str;
  }

  function formatError(err) {
    var name = err.name || 'Error';
    var msg = err.message ? name + ': ' + err.message : name;
    if (!err.stack) return msg;
    var frames = String(err.stack).split('\n').slice(1);
    var kept = frames.filter(function (line) {
      if (!line.trim()) return false;
      // Drop the sandbox's own plumbing so only user frames remain.
      if (line.indexOf('blob:') !== -1 || line.indexOf('<anonymous>') !== -1) return false;
      return !/at\s+(runUserCode|runOnMainThread|emit|formatError|inspect)\b/.test(line);
    }).slice(0, 8);
    return kept.length ? msg + '\n' + kept.join('\n') : msg;
  }
};

/* ---------------------------------------------------------------------------
 * 2. Worker program
 *
 * The source is assembled at runtime and `KJ.inspect` is injected by
 * stringifying it, so the formatting logic exists in exactly one place while
 * still executing inside the worker.
 * ------------------------------------------------------------------------- */
KJ.buildWorkerSource = function buildWorkerSource() {
  var C = KJ.CONFIG;
  var T = KJ.workerStrings();   // the worker cannot read the dictionary itself

  return [
    '"use strict";',
    '/* Limits, inspector and messages injected by js/sandbox.js — no window in here. */',
    'var KJ = { MAX: { depth: ' + C.maxDepth + ', string: ' + C.maxStringLength + ', items: ' + C.maxItems + ' } };',
    'var T = ' + JSON.stringify(T) + ';',
    'var inspect = ' + KJ.inspect.toString() + ';',
    'var startedAt = 0;',

    /* Send one already-formatted console line back to the page. */
    'function emit(level, args) {',
    '  var text;',
    '  try {',
    '    text = Array.prototype.map.call(args, function (a) {',
    '      return typeof a === "string" ? a : inspect(a, 0, new WeakSet());',
    '    }).join(" ");',
    '  } catch (err) {',
    '    text = "[could not format output: " + (err && err.message) + "]";',
    '  }',
    '  self.postMessage({ type: "log", level: level, text: text });',
    '}',

    /* ---- console interception ------------------------------------------- */
    'console.log    = function () { emit("log", arguments); };',
    'console.info   = function () { emit("log", arguments); };',
    'console.debug  = function () { emit("log", arguments); };',
    'console.warn   = function () { emit("warn", arguments); };',
    'console.error  = function () { emit("error", arguments); };',
    'console.trace  = function () { emit("log", arguments); };',
    'console.table  = function () { emit("log", [T.table]); };',
    'console.assert = function (ok) {',
    '  if (!ok) emit("error", [T.assert + (arguments.length > 1 ? ": " + inspect(arguments[1], 0, new WeakSet()) : "")]);',
    '};',
    'console.group = console.groupCollapsed = console.groupEnd = function () {};',
    'console.count  = function () {};',
    'console.time   = function () {};',
    'console.timeEnd = function () {};',

    /* ---- uncaught errors ------------------------------------------------ */
    /* Both handlers also post a terminal "done" message, otherwise the page
       would sit in the "Running" state until the watchdog timeout (an async
       throw never returns to the try/catch below). */
    'self.onerror = function (message, source, lineno, colno, error) {',
    '  var text;',
    '  try { text = error ? inspect(error, 0, new WeakSet()) : String(message); }',
    '  catch (e) { text = String(message); }',
    '  if (!error && source && lineno) {',
    '    text += "\\n    at playground line " + lineno + ", column " + colno;',
    '  }',
    '  self.postMessage({ type: "log", level: "error", text: text, uncaught: true });',
    '  self.postMessage({ type: "done", ms: Date.now() - startedAt, failed: true, uncaught: true });',
    '  return true;',
    '};',
    'self.addEventListener("unhandledrejection", function (event) {',
    '  var reason = event && event.reason;',
    '  var text;',
    '  try { text = inspect(reason, 0, new WeakSet()); } catch (e) { text = String(reason); }',
    '  self.postMessage({ type: "log", level: "error", text: T.rejection + ": " + text, uncaught: true });',
    '  self.postMessage({ type: "done", ms: Date.now() - startedAt, failed: true, uncaught: true });',
    '});',

    /* ---- run ------------------------------------------------------------ */
    'self.onmessage = function (event) {',
    '  startedAt = Date.now();',
    '  var code = event.data.code;',
    '  try {',
    '    /* new Function() === eval inside a function scope: the quickest way to',
    '       execute a string as JavaScript without any server. */',
    '    var runUserCode = new Function(code);',
    '    runUserCode();',
    '    self.postMessage({ type: "done", ms: Date.now() - startedAt });',
    '  } catch (error) {',
    '    /* SyntaxError and runtime errors alike land here. */',
    '    self.postMessage({ type: "log", level: "error", text: inspect(error, 0, new WeakSet()) });',
    '    self.postMessage({ type: "done", ms: Date.now() - startedAt, failed: true });',
    '  }',
    '};'
  ].join('\n');
};