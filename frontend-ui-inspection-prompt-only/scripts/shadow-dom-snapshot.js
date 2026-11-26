/**
 * Shadow DOM Snapshot Helper — frontend-ui-inspection (Plan 2)
 *
 * Injectable via browser_evaluate/browser_run_code. Complements browser_snapshot
 * when the page uses open Shadow DOM / Web Components.
 *
 * Usage:
 *   await browser_evaluate({ function: "() => { <paste this file> }" });
 *   await browser_evaluate({ function: "() => window.__agentSnapshot.getFull()" });
 *
 * Or load as script content and evaluate once, then call window.__agentSnapshot.*.
 */
(() => {
  'use strict';

  const STATE_KEY = '__agentSnapshotState';
  const API_KEY = '__agentSnapshot';

  function createState() {
    return {
      refToEl: new Map(),
      elToRef: new WeakMap(),
      nodes: new Map(),
      nextRefId: 1,
      observers: new Set(),
      observedRoots: new WeakSet(),
      debounceTimer: null,
      pendingMutations: [],
      diffBuffer: [],
      options: {},
    };
  }

  // Reuse state across reinjection to keep refs stable, unless reset() is called.
  const state = window[STATE_KEY] && window[STATE_KEY].refToEl ? window[STATE_KEY] : (window[STATE_KEY] = createState());

  function resetState() {
    stopObserving();
    state.refToEl.clear();
    state.elToRef = new WeakMap();
    state.nodes.clear();
    state.nextRefId = 1;
    state.observedRoots = new WeakSet();
    state.pendingMutations = [];
    state.diffBuffer = [];
    state.options = {};
  }

  function isElement(node) {
    return !!node && node.nodeType === Node.ELEMENT_NODE;
  }

  function safeCall(fn, fallback) {
    try { return fn(); } catch { return fallback; }
  }

  function isVisible(el) {
    if (!isElement(el)) return false;
    if (!el.isConnected) return false;
    const style = safeCall(() => getComputedStyle(el), null);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = safeCall(() => el.getBoundingClientRect(), null);
    if (!rect) return false;
    return rect.width > 0 && rect.height > 0;
  }

  function getRootNode(el) {
    return safeCall(() => el.getRootNode(), document);
  }

  function getByIdFromRoot(el, id) {
    if (!id) return null;
    const root = getRootNode(el);
    if (root && typeof root.querySelector === 'function') {
      // querySelector with #id works in ShadowRoot; escape basic quotes.
      const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      return safeCall(() => root.querySelector(`#${escaped}`), null);
    }
    return safeCall(() => document.getElementById(id), null);
  }

  function textContentOf(el) {
    return safeCall(() => (el.textContent || '').replace(/\s+/g, ' ').trim(), '');
  }

  function directText(el) {
    // Prefer direct/label-like text over deep subtree noise.
    const own = safeCall(() => {
      let out = '';
      for (const n of el.childNodes || []) {
        if (n.nodeType === Node.TEXT_NODE) out += ` ${n.textContent || ''}`;
      }
      return out.replace(/\s+/g, ' ').trim();
    }, '');
    return own || textContentOf(el).slice(0, 160);
  }

  function getAriaLabelledBy(el) {
    const ids = safeCall(() => (el.getAttribute('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean), []);
    if (!ids.length) return '';
    const parts = [];
    for (const id of ids) {
      const ref = getByIdFromRoot(el, id);
      const txt = ref ? textContentOf(ref) : '';
      if (txt) parts.push(txt);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function getLabelText(el) {
    const labels = [];
    const aria = getAriaLabelledBy(el);
    if (aria) labels.push(aria);
    const ariaLabel = safeCall(() => (el.getAttribute('aria-label') || '').trim(), '');
    if (ariaLabel) labels.push(ariaLabel);

    // <label for="id">
    const id = safeCall(() => el.getAttribute('id'), null);
    if (id) {
      const root = getRootNode(el);
      const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      const forLabel = safeCall(() => root.querySelector(`label[for="${escaped}"]`), null);
      if (forLabel) labels.push(textContentOf(forLabel));
    }

    // Wrapped label
    const wrapping = safeCall(() => el.closest('label'), null);
    if (wrapping) labels.push(textContentOf(wrapping));

    return labels.find(Boolean) || '';
  }

  function inferRole(el) {
    const explicit = safeCall(() => (el.getAttribute('role') || '').trim().toLowerCase(), '');
    if (explicit) return explicit;

    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return el.multiple || Number(el.size) > 1 ? 'listbox' : 'combobox';
    if (tag === 'option') return 'option';
    if (tag === 'summary') return 'button';
    if (tag === 'dialog') return 'dialog';
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'header') return 'banner';
    if (tag === 'footer') return 'contentinfo';
    if (tag === 'form') return 'form';
    if (tag === 'img') return 'img';
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'li') return 'listitem';
    if (tag === 'table') return 'table';
    if (tag === 'tr') return 'row';
    if (tag === 'th') return 'columnheader';
    if (tag === 'td') return 'cell';

    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') return 'button';
      if (type === 'range') return 'slider';
      if (type === 'search') return 'searchbox';
      if (['email', 'tel', 'text', 'url', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week'].includes(type)) return 'textbox';
      return 'input';
    }

    if (el.isContentEditable) return 'textbox';
    return 'generic';
  }

  function getAccessibleName(el) {
    const labelled = getLabelText(el);
    if (labelled) return labelled.slice(0, 200);

    const alt = safeCall(() => (el.getAttribute('alt') || '').trim(), '');
    if (alt) return alt.slice(0, 200);

    const placeholder = safeCall(() => (el.getAttribute('placeholder') || '').trim(), '');
    if (placeholder) return placeholder.slice(0, 200);

    const title = safeCall(() => (el.getAttribute('title') || '').trim(), '');
    if (title) return title.slice(0, 200);

    const value = safeCall(() => (el.value || '').toString().trim(), '');
    if (value && ['INPUT', 'BUTTON', 'OPTION'].includes(el.tagName)) return value.slice(0, 200);

    const txt = directText(el);
    if (txt) return txt.slice(0, 200);

    return '';
  }

  function getStates(el) {
    const states = {};
    const aria = (name) => safeCall(() => el.getAttribute(name), null);

    const disabled = !!el.disabled || aria('aria-disabled') === 'true';
    if (disabled) states.disabled = true;

    const checkedAttr = aria('aria-checked');
    if (checkedAttr === 'true' || checkedAttr === 'mixed' || checkedAttr === 'false') states.checked = checkedAttr;
    else if (typeof el.checked === 'boolean' && (el.type === 'checkbox' || el.type === 'radio')) states.checked = el.checked;

    const expanded = aria('aria-expanded');
    if (expanded === 'true' || expanded === 'false') states.expanded = expanded === 'true';

    const selected = aria('aria-selected');
    if (selected === 'true' || selected === 'false') states.selected = selected === 'true';
    else if (el.tagName === 'OPTION') states.selected = !!el.selected;

    const pressed = aria('aria-pressed');
    if (pressed === 'true' || pressed === 'false' || pressed === 'mixed') states.pressed = pressed;

    const required = !!el.required || aria('aria-required') === 'true';
    if (required) states.required = true;

    const readOnly = !!el.readOnly || aria('aria-readonly') === 'true';
    if (readOnly) states.readonly = true;

    if (aria('aria-hidden') === 'true') states.ariaHidden = true;

    if (typeof el.value === 'string' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && el.type !== 'password') {
      states.value = el.value.slice(0, 200);
    }

    return states;
  }

  function getBounds(el) {
    const r = safeCall(() => el.getBoundingClientRect(), { x: 0, y: 0, width: 0, height: 0 });
    return {
      x: Math.round(r.x || 0),
      y: Math.round(r.y || 0),
      w: Math.round(r.width || 0),
      h: Math.round(r.height || 0),
    };
  }

  function isInteresting(el) {
    if (!isElement(el) || !isVisible(el)) return false;
    const tag = el.tagName;
    const role = inferRole(el);
    const interactiveRoles = new Set([
      'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio',
      'combobox', 'listbox', 'option', 'slider', 'switch', 'tab',
      'menuitem', 'menuitemcheckbox', 'menuitemradio', 'spinbutton',
      'treeitem', 'dialog'
    ]);
    if (interactiveRoles.has(role)) return true;
    if (el.tabIndex >= 0) return true;
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(tag)) return true;
    if (safeCall(() => el.getAttribute('contenteditable'), null) === 'true') return true;
    if (safeCall(() => !!el.getAttribute('role'), false)) return true;
    if (safeCall(() => !!el.onclick, false)) return true;
    const cursor = safeCall(() => getComputedStyle(el).cursor, '');
    if (cursor === 'pointer') return true;
    return false;
  }

  function* walkAllElements(root) {
    if (!root) return;
    const doc = root.ownerDocument || document;
    const walker = safeCall(() => doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT), null);
    if (!walker) return;

    // If root is an element, yield it first, then walk descendants.
    // For ShadowRoot/DocumentFragment, start at first child element.
    let node = isElement(root) ? root : walker.nextNode();
    while (node) {
      yield node;
      const sr = safeCall(() => node.shadowRoot, null);
      if (sr && sr.mode === 'open') {
        yield* walkAllElements(sr);
      }
      node = walker.nextNode();
    }
  }

  function collectInterestingAndRoots(root, interesting = [], roots = []) {
    for (const el of walkAllElements(root)) {
      if (isInteresting(el)) interesting.push(el);
      const sr = safeCall(() => el.shadowRoot, null);
      if (sr && sr.mode === 'open' && !state.observedRoots.has(sr)) roots.push(sr);
    }
    return { interesting, roots };
  }

  function createOrUpdateNode(el) {
    let ref = state.elToRef.get(el);
    if (!ref) {
      ref = `e${state.nextRefId++}`;
      state.elToRef.set(el, ref);
      state.refToEl.set(ref, el);
      safeCall(() => { el.dataset.agentRef = ref; });
    }

    const node = {
      ref,
      role: inferRole(el),
      name: getAccessibleName(el),
      tag: el.tagName.toLowerCase(),
      states: getStates(el),
      bounds: getBounds(el),
      inShadow: getRootNode(el) instanceof ShadowRoot,
    };
    state.nodes.set(ref, node);
    return node;
  }

  function removeNode(el) {
    const ref = state.elToRef.get(el);
    if (!ref) return null;
    state.nodes.delete(ref);
    state.refToEl.delete(ref);
    state.elToRef.delete(el);
    safeCall(() => { if (el.dataset && el.dataset.agentRef === ref) delete el.dataset.agentRef; });
    return ref;
  }

  function fullSnapshot(root = document.body) {
    state.nodes.clear();
    state.refToEl.clear();
    state.elToRef = new WeakMap();
    state.nextRefId = 1;

    const { interesting, roots } = collectInterestingAndRoots(root);
    const nodes = interesting.map((el) => createOrUpdateNode(el));

    // Ensure discovered roots are observed if observing is active.
    if (state.observers.size > 0) {
      for (const sr of roots) observeRoot(sr, state.options);
    }

    return nodes;
  }

  function shallowEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function processMutations(mutations) {
    const added = new Set();
    const removed = new Set();
    const changed = new Set();
    const newShadowRoots = [];

    for (const m of mutations || []) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes || []) {
          if (!isElement(n)) continue;
          const { interesting, roots } = collectInterestingAndRoots(n);
          interesting.forEach((el) => added.add(el));
          newShadowRoots.push(...roots);
        }

        for (const n of m.removedNodes || []) {
          if (!isElement(n)) continue;
          const stack = [n];
          while (stack.length) {
            const current = stack.pop();
            if (state.elToRef.has(current)) removed.add(current);
            const sr = safeCall(() => current.shadowRoot, null);
            if (sr) stack.push(...Array.from(sr.children || []));
            stack.push(...Array.from(current.children || []));
          }
        }
      }

      if (m.type === 'attributes' || m.type === 'characterData') {
        const target = m.type === 'characterData' ? (m.target.parentElement || m.target.parentNode) : m.target;
        if (!isElement(target)) continue;

        if (state.elToRef.has(target)) changed.add(target);
        else if (isInteresting(target)) added.add(target);

        const sr = safeCall(() => target.shadowRoot, null);
        if (sr && sr.mode === 'open' && !state.observedRoots.has(sr)) newShadowRoots.push(sr);
      }
    }

    for (const sr of newShadowRoots) observeRoot(sr, state.options);

    const toReevaluate = new Set([...changed, ...added]);
    const diff = { added: [], removed: [], updated: [], timestamp: Date.now() };

    for (const el of removed) {
      const ref = removeNode(el);
      if (ref) diff.removed.push(ref);
    }

    for (const el of toReevaluate) {
      const connected = !!el.isConnected;
      if (!connected) {
        const ref = removeNode(el);
        if (ref) diff.removed.push(ref);
        continue;
      }

      if (!isInteresting(el)) {
        const ref = removeNode(el);
        if (ref) diff.removed.push(ref);
        continue;
      }

      const prev = state.nodes.get(state.elToRef.get(el));
      const next = createOrUpdateNode(el);

      if (!prev) {
        diff.added.push(next);
      } else {
        const changedMeaningfully =
          prev.role !== next.role ||
          prev.name !== next.name ||
          !shallowEqual(prev.states, next.states) ||
          !shallowEqual(prev.bounds, next.bounds) ||
          prev.inShadow !== next.inShadow ||
          prev.tag !== next.tag;
        if (changedMeaningfully) diff.updated.push(next);
      }
    }

    return diff;
  }

  function recordDiff(diff) {
    const hasChanges = diff && (diff.added.length || diff.removed.length || diff.updated.length);
    if (!hasChanges) return diff;
    state.diffBuffer.push(diff);
    if (state.diffBuffer.length > 200) state.diffBuffer.shift();
    if (typeof state.options.onDiff === 'function') safeCall(() => state.options.onDiff(diff));
    if (state.options.postMessage) {
      safeCall(() => window.postMessage({ type: 'agent-snapshot-diff', diff }, window.location.origin));
    }
    return diff;
  }

  function observeRoot(root, options = {}) {
    if (!root || state.observedRoots.has(root)) return;

    const opts = { ...state.options, ...options };
    const debounceMs = Number.isFinite(opts.debounceMs) ? opts.debounceMs : 80;
    const attributeFilter = Array.isArray(opts.attributeFilter) ? opts.attributeFilter : [
      'role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
      'aria-disabled', 'aria-checked', 'aria-expanded', 'aria-selected', 'aria-pressed',
      'disabled', 'checked', 'selected', 'value', 'type', 'href', 'name',
      'class', 'style', 'hidden', 'open', 'tabindex', 'title', 'alt', 'placeholder'
    ];

    const observer = new MutationObserver((mutations) => {
      state.pendingMutations.push(...mutations);
      clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(() => {
        const batch = state.pendingMutations.splice(0, state.pendingMutations.length);
        recordDiff(processMutations(batch));
      }, debounceMs);
    });

    safeCall(() => observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter,
      characterData: true,
    }));

    state.observers.add(observer);
    state.observedRoots.add(root);
  }

  function startObserving(options = {}) {
    state.options = { ...state.options, ...options };
    observeRoot(document.body, state.options);
    const { roots } = collectInterestingAndRoots(document.body);
    for (const sr of roots) observeRoot(sr, state.options);
    return { observing: true, roots: state.observers.size };
  }

  function stopObserving() {
    for (const obs of state.observers) safeCall(() => obs.disconnect());
    state.observers.clear();
    state.observedRoots = new WeakSet();
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
    state.pendingMutations = [];
    return { observing: false };
  }

  function drainDiffs() {
    return state.diffBuffer.splice(0, state.diffBuffer.length);
  }

  function getDiffs() {
    return [...state.diffBuffer];
  }

  function forceDiff() {
    const { interesting } = collectInterestingAndRoots(document.body);
    const fake = interesting.map((el) => ({ type: 'attributes', target: el }));
    return processMutations(fake);
  }

  function getElement(ref) {
    return state.refToEl.get(ref) || null;
  }

  function getNode(ref) {
    return state.nodes.get(ref) || null;
  }

  function query({ text, role, tag, inShadow } = {}) {
    const q = typeof text === 'string' ? text.toLowerCase().trim() : '';
    return [...state.nodes.values()].filter((n) => {
      if (role && n.role !== role) return false;
      if (tag && n.tag !== String(tag).toLowerCase()) return false;
      if (typeof inShadow === 'boolean' && n.inShadow !== inShadow) return false;
      if (q && !(n.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function summary() {
    const nodes = [...state.nodes.values()];
    return {
      total: nodes.length,
      inShadow: nodes.filter((n) => n.inShadow).length,
      refs: nodes.map((n) => ({ ref: n.ref, role: n.role, name: n.name, tag: n.tag, inShadow: n.inShadow })),
    };
  }

  const api = {
    version: '1.0.0-plan2',
    getFull: (root) => fullSnapshot(root || document.body),
    start: startObserving,
    stop: stopObserving,
    reset: resetState,
    forceDiff,
    drainDiffs,
    getDiffs,
    getElement,
    getNode,
    query,
    summary,
    _state: state,
  };

  window[API_KEY] = api;
  return { installed: true, version: api.version };
})();
