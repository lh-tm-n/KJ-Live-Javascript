/* ============================================================================
 * KJ Live Javascript — configuration
 * ---------------------------------------------------------------------------
 * Loaded first. Everything hangs off the single `KJ` namespace so no globals
 * leak into the page and load order between files stays explicit.
 * ========================================================================== */
'use strict';

var KJ = window.KJ || {};
window.KJ = KJ;

/**
 * Tunables. Changing a value here updates both the page and the sandbox:
 * buildWorkerSource() injects these numbers into the worker's preamble.
 */
KJ.CONFIG = {
  timeoutMs: 5000,          // hard limit for a single run (infinite-loop guard)
  maxRows: 2000,            // hard cap on output rows (DOM safety)
  maxStringLength: 10000,   // truncate very long strings / stacks
  maxDepth: 4,              // inspector nesting limit
  maxItems: 100,            // inspector items-per-collection limit
  asyncLingerMs: 15000      // how long the sandbox stays alive after `done`,
                            // so timers / promises can still print
};

/* The inspector reads these limits from `KJ.MAX` instead of the CONFIG object
 * so the exact same code can run inside the Web Worker, where `window` (and
 * therefore `KJ.CONFIG`) does not exist. The sandbox preamble recreates them. */
KJ.MAX = {
  depth: KJ.CONFIG.maxDepth,
  string: KJ.CONFIG.maxStringLength,
  items: KJ.CONFIG.maxItems
};