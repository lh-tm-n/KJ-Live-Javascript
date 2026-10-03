/* ============================================================================
 * KJ Live Javascript — languages
 * ---------------------------------------------------------------------------
 * Every piece of visible text lives in this dictionary, so switching languages
 * is instant and nothing technical has to be hard-coded in the markup.
 *
 *   KJ.t('key')                  -> string
 *   KJ.t('key', { ms: 12 })      -> string with {placeholders} replaced
 *   KJ.setLang('id')             -> applies + persists the choice
 *   KJ.workerStrings()           -> the few strings the sandbox needs
 *
 * Loaded second (right after config.js).
 * ========================================================================== */
'use strict';

var KJ = window.KJ || {};

KJ.LANGS = ['en', 'id'];

/* ---------------------------------------------------------------------------
 * Dictionary
 * ------------------------------------------------------------------------- */
KJ.I18N = {

  en: {
    'lang.name': 'English',
    'lang.switch': 'Language',

    'action.run': 'Run',
    'action.stop': 'Stop',
    'action.clear': 'Clear',

    'pane.editor': 'playground',
    'pane.output': 'Output',

    'status.ready': 'Ready',
    'status.running': 'Running',
    'status.finished': 'Finished',
    'status.error': 'Error',
    'status.runtime': 'Something went wrong',
    'status.timeout': 'Took too long',
    'status.stopped': 'Stopped',
    'status.empty': 'Nothing to type',

    'output.empty.title': 'Nothing here yet',
    'output.empty.hint': 'Write some code on the left, then press Run.',
    'output.counter': '{n} messages',
    'output.counterOne': '{n} message',
    'output.limit': 'That is a lot of output — showing the first {max} messages.',
    'output.tag.warn': 'Warning',
    'output.tag.error': 'Error',
    'output.legend.log': 'messages',
    'output.legend.warn': 'warnings',
    'output.legend.error': 'errors',

    'editor.position': 'Line {line}, column {col}',
    'editor.stats': '{lines} lines · {chars} characters',
    'editor.statsOne': '{lines} line · {chars} characters',
    'editor.indent': 'Indent: 2 spaces',

    'divider.hint': 'Drag to resize · double-click to reset',

    'run.stopped': 'Stopped.',
    'run.empty': 'Write some code first.',
    'run.timeout': 'This was taking too long, so it was stopped. Check for a loop that never ends.',
    'run.fallback': 'Safe runner unavailable — running on this page instead.',
    'run.finishedIn': 'done in {ms} ms',

    /* Strings handed to the sandbox (it cannot read this dictionary) */
    'worker.assert': 'Assertion failed',
    'worker.rejection': 'Unhandled promise',
    'worker.table': 'The table view is not available here — use console.log instead.',

    /* Screen-reader announcements */
    'a11y.finished': 'Finished in {ms} milliseconds.',
    'a11y.error': 'The code stopped because of an error.',
    'a11y.runtime': 'The code ran into an unexpected problem.',
    'a11y.timeout': 'The code took too long and was stopped.',
    'a11y.stopped': 'Stopped.',
    'a11y.empty': 'There is no code to run yet.'
  },

  id: {
    'lang.name': 'Bahasa Indonesia',
    'lang.switch': 'Bahasa',

    'action.run': 'Jalankan',
    'action.stop': 'Hentikan',
    'action.clear': 'Bersihkan',

    'pane.editor': 'playground',
    'pane.output': 'Keluaran',

    'status.ready': 'Siap',
    'status.running': 'Berjalan',
    'status.finished': 'Selesai',
    'status.error': 'Galat',
    'status.runtime': 'Terjadi kesalahan',
    'status.timeout': 'Terlalu lama',
    'status.stopped': 'Dihentikan',
    'status.empty': 'Belum ada kode',

    'output.empty.title': 'Belum ada keluaran',
    'output.empty.hint': 'Tulis kode di sebelah kiri, lalu tekan Jalankan.',
    'output.counter': '{n} pesan',
    'output.counterOne': '{n} pesan',
    'output.limit': 'Keluaran sudah banyak — hanya {max} pesan pertama yang ditampilkan.',
    'output.tag.warn': 'Peringatan',
    'output.tag.error': 'Galat',
    'output.legend.log': 'pesan',
    'output.legend.warn': 'peringatan',
    'output.legend.error': 'galat',

    'editor.position': 'Baris {line}, kolom {col}',
    'editor.stats': '{lines} baris · {chars} karakter',
    'editor.statsOne': '{lines} baris · {chars} karakter',
    'editor.indent': 'Spasi: 2',

    'divider.hint': 'Tarik untuk mengubah ukuran · klik dua kali untuk mengembalikan',

    'run.stopped': 'Dihentikan.',
    'run.empty': 'Tulis kode terlebih dahulu.',
    'run.timeout': 'Berjalan terlalu lama, jadi dihentikan. Periksa kemungkinan loop yang tidak pernah berhenti.',
    'run.fallback': 'Pelari aman tidak tersedia — dijalankan di halaman ini.',
    'run.finishedIn': 'selesai dalam {ms} ms',

    'worker.assert': 'Assertion gagal',
    'worker.rejection': 'Promise tidak tertangani',
    'worker.table': 'Tampilan tabel tidak tersedia di sini — gunakan console.log saja.',

    'a11y.finished': 'Selesai dalam {ms} milidetik.',
    'a11y.error': 'Kode berhenti karena ada galat.',
    'a11y.runtime': 'Kode mengalami masalah yang tidak terduga.',
    'a11y.timeout': 'Kode berjalan terlalu lama dan dihentikan.',
    'a11y.stopped': 'Dihentikan.',
    'a11y.empty': 'Belum ada kode untuk dijalankan.'
  }
};

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

/** Translate a key, replacing {placeholders} from the optional values object. */
KJ.t = function t(key, vars) {
  var table = KJ.I18N[KJ.LANG] || KJ.I18N.en;
  var value = table[key];

  if (value === undefined) {
    value = KJ.I18N.en[key];      // fall back to English
    if (value === undefined) return key;
  }
  if (!vars) return value;

  return value.replace(/\{(\w+)\}/g, function (match, name) {
    return vars[name] !== undefined ? vars[name] : match;
  });
};

/** Remember the choice; private-mode browsers simply skip it. */
function persist(lang) {
  try { window.localStorage.setItem('kj-lang', lang); } catch (e) { /* no storage */ }
}

function restore() {
  try {
    var saved = window.localStorage.getItem('kj-lang');
    if (KJ.LANGS.indexOf(saved) !== -1) return saved;
  } catch (e) { /* no storage */ }
  // Fall back to the visitor's browser language.
  var nav = (window.navigator && (window.navigator.language || window.navigator.userLanguage)) || 'en';
  return nav.toLowerCase().indexOf('id') === 0 ? 'id' : 'en';
}

/** Paint every translated node in the document. */
function paint() {
  var nodes = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].textContent = KJ.t(nodes[i].getAttribute('data-i18n'));
  }

  // Attributes (title, aria-label): data-i18n-<attribute>="key"
  var all = document.querySelectorAll('[data-i18n-title], [data-i18n-aria-label]');
  for (var j = 0; j < all.length; j++) {
    ['title', 'aria-label'].forEach(function (attr) {
      var key = all[j].getAttribute('data-i18n-' + attr);
      if (key) all[j].setAttribute(attr, KJ.t(key));
    });
  }

  // Language switch buttons
  var buttons = document.querySelectorAll('[data-lang]');
  for (var k = 0; k < buttons.length; k++) {
    buttons[k].setAttribute('aria-pressed', buttons[k].getAttribute('data-lang') === KJ.LANG ? 'true' : 'false');
  }
}

/** Switch language, repaint the page and remember the choice. */
KJ.setLang = function setLang(lang) {
  if (KJ.LANGS.indexOf(lang) === -1) lang = 'en';
  KJ.LANG = lang;
  document.documentElement.setAttribute('lang', lang === 'id' ? 'id' : 'en');
  persist(lang);
  KJ.paint();
  if (KJ.onLangChange) KJ.onLangChange();
};

/* ---------------------------------------------------------------------------
 * Boot — pick a language before the first paint.
 * ------------------------------------------------------------------------- */
KJ.LANG = restore();

/** Repaint the page without changing the language (used for the first paint). */
KJ.paint = paint;

/** The handful of strings the Web Worker needs (it cannot see this file). */
KJ.workerStrings = function workerStrings() {
  return {
    assert: KJ.t('worker.assert'),
    rejection: KJ.t('worker.rejection'),
    table: KJ.t('worker.table')
  };
};