/* ============================================================================
 * KJ Live Javascript — editor
 * ---------------------------------------------------------------------------
 * Owns the CodeMirror instance. Exposed as `KJ.editor` so js/app.js can read
 * and write the source. The keyboard shortcuts call KJ.runCode / KJ.stopRun,
 * which js/app.js publishes when it finishes booting.
 *
 * Loaded third.
 * ========================================================================== */
'use strict';

var KJ = window.KJ || {};

/* Starter code — what the editor shows on first load. */
KJ.STARTER_CODE = `/* ================================================================
 *  KJ Live Javascript
 *  Change anything below, then press Run.
 * ================================================================ */

console.log('Hello from KJ Live Javascript 👋');

// Objects, arrays, Sets and methods are pretty-printed.
const user = {
  id: 42,
  name: 'KJ',
  role: 'Frontend Developer',
  skills: new Set(['HTML', 'CSS', 'JavaScript']),
  scores: [98, 87, 75],
  greet() { return \`Hi, I'm \${this.name}\`; }
};

console.log(user);
console.log('greet() ->', user.greet());

// Circular references are safe.
const node = { label: 'root' };
node.self = node;
console.log(node);

// Warnings render in amber, errors in red.
console.warn('Heads up: warnings are highlighted.');

try {
  JSON.parse('{ not: valid json }');
} catch (err) {
  console.error(err);
}

// Async code works as well.
setTimeout(() => console.log('setTimeout fired after 600ms'), 600);
Promise.resolve('resolved!').then(v => console.log('Promise resolved:', v));

// Try an infinite loop and press Stop (or wait 5s) to see the guard in action.
// while (true) {}
`;

KJ.editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
  mode: 'javascript',
  theme: 'material-darker',       // dark theme
  lineNumbers: true,              // line numbers
  lineWrapping: true,
  autoCloseBrackets: true,
  matchBrackets: true,
  styleActiveLine: true,
  tabSize: 2,
  indentUnit: 2,
  indentWithTabs: false,
  viewportMargin: 20,
  extraKeys: {
    // Ctrl/Cmd+Enter is handled once globally in js/app.js, so it is not bound
    // here as well (that would run the code twice).
    'Ctrl-S': function (cm) { KJ.runCode(cm); },
    'Esc': function () { KJ.stopRun(); },
    'Tab': function (cm) { cm.execCommand('indentMore'); },
    'Shift-Tab': function (cm) { cm.execCommand('indentLess'); }
  }
});

KJ.editor.setValue(KJ.STARTER_CODE.trim());

// CodeMirror measures itself on creation, so it needs a manual refresh once
// the flex layout has settled (and whenever the window is resized).
window.addEventListener('load', function () {
  KJ.editor.refresh();
  KJ.refreshMeta();
});
window.addEventListener('resize', function () {
  KJ.editor.refresh();
});

/** Keep the "Line x, column y" readout and the line/char counter in sync. */
KJ.refreshMeta = function refreshMeta() {
  var editor = KJ.editor;
  var cursor = editor.getCursor();
  var lines = editor.lineCount();
  var value = editor.getValue().length;

  document.getElementById('editorMeta').textContent =
    KJ.t('editor.position', { line: cursor.line + 1, col: cursor.ch + 1 });
  document.getElementById('codeStats').textContent =
    KJ.t(lines === 1 ? 'editor.statsOne' : 'editor.stats', { lines: lines, chars: value });
};

KJ.editor.on('change', KJ.refreshMeta);
KJ.editor.on('cursorActivity', KJ.refreshMeta);