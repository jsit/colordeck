const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

/** @type {string} Page source for full application initialization and event wiring. */
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
/** @type {string} Complete inline application, rather than extracted palette helpers. */
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/** Minimal browser element supporting the app's inputs and palette buttons. */
class Element {
  /** @param {Record<string, string>} attributes HTML attributes. */
  constructor(attributes = {}) {
    Object.assign(this, { attributes, dataset: {}, style: {}, children: [], listeners: {}, value: attributes.value || "", id: attributes.id });
    if (attributes["data-key"]) this.dataset.key = attributes["data-key"];
    if (attributes["data-slider-for"]) this.dataset.sliderFor = attributes["data-slider-for"];
  }
  /** @param {string} name Attribute name. @param {string} value Attribute value. */
  setAttribute(name, value) { this.attributes[name] = value; }
  /** @param {string} name Attribute name. @returns {string | undefined} Attribute value. */
  getAttribute(name) { return this.attributes[name]; }
  /** @param {string} name Event type. @param {Function} handler Event callback. */
  addEventListener(name, handler) { this.listeners[name] = handler; }
  /** @param {Element} child New child button. */
  append(child) { this.children.push(child); }
  /** @param {Element} child Palette button removed from this container. */
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  /** @returns {Element} Last child button. */
  get lastElementChild() { return this.children.at(-1); }
  /** Record focus without requiring a real browser. */
  focus() { this.focused = true; }
  /** @param {string} name Simulated browser event. */
  dispatch(name) { this.listeners[name]?.({ target: this }); }
}

/**
 * @param {string | null} stored Saved palette JSON.
 * @param {string} hash Initial shared color fragment.
 * @param {boolean} blocked Whether storage throws.
 * @returns {object} Full app fixture with DOM controls and reloadable storage.
 */
function createApp(stored = null, hash = "", blocked = false) {
  /** @type {Element[]} Elements parsed from actual page markup. */
  const elements = [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(/** @param {RegExpMatchArray} tag @returns {Element} */ (tag) =>
    new Element(Object.fromEntries([...tag[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(/** @param {RegExpMatchArray} attribute @returns {string[]} */ (attribute) => [attribute[1], attribute[2]]))));
  /** @type {Map<string, Element>} Actual page controls indexed by ID. */
  const byId = new Map(elements.filter(/** @param {Element} element @returns {boolean} */ (element) => Boolean(element.id)).map(/** @param {Element} element @returns {Array} */ (element) => [element.id, element]));
  /** @type {object} URL state updated by the real application. */
  const location = { href: `https://colordeck.org/${hash}`, hash };
  /** @type {Record<string, Function>} Window event handlers for fragment navigation. */
  const windowListeners = {};
  /** @type {URL[]} Same-document history stack, including the initial page entry. */
  const historyEntries = [new URL(location.href)];
  /** @type {number} Current entry in the simulated browser history. */
  let historyIndex = 0;
  /** @type {object} Browser globals needed by the complete inline script. */
  const context = {
    URL, console, setTimeout, clearTimeout,
    document: {
      /** @param {string} selector Supported app selector. @returns {Element[]} Matching elements. */
      querySelectorAll: (selector) => selector === "[id]" ? [...byId.values()] : selector === "[data-key]" ? elements.filter((element) => element.dataset.key) : selector === "[data-slider-for]" ? elements.filter((element) => element.dataset.sliderFor) : [],
      /** @returns {Element} New palette button. */
      createElement: () => new Element()
    },
    window: {
      location,
      /** @param {string} name Window event type. @param {Function} handler Registered callback. */
      addEventListener(name, handler) { windowListeners[name] = handler; },
      history: {
        /** @param {unknown} state History state. @param {string} title Unused title. @param {URL} url Replacement URL. */
        replaceState(state, title, url) {
          historyEntries[historyIndex] = new URL(url);
          location.href = String(url); location.hash = url.hash;
        },
        /** @param {unknown} state History state. @param {string} title Unused title. @param {URL} url New history URL. */
        pushState(state, title, url) {
          historyEntries.splice(historyIndex + 1);
          historyEntries.push(new URL(url));
          historyIndex++;
          location.href = String(url); location.hash = url.hash;
        }
      }
    },
    localStorage: {
      /** @returns {string | null} Previously saved palette. */
      getItem() { if (blocked) throw new Error("Storage blocked"); return stored; },
      /** @param {string} key Storage key. @param {string} value Saved snapshot. */
      setItem(key, value) { if (blocked) throw new Error("Storage blocked"); stored = value; }
    }
  };
  vm.runInNewContext(script, context);
  return {
    byId,
    /** @returns {string | null} Current browser storage contents. */
    saved: () => stored,
    /** @returns {string} Current URL fragment. */
    hash: () => location.hash,
    /** @param {string} fragment New fragment loaded through normal browser navigation. */
    navigate(fragment) {
      context.window.history.pushState(null, "", new URL(`https://colordeck.org/${fragment}`));
      windowListeners.hashchange();
    },
    /** @returns {number} Number of navigable history entries. */
    historyLength: () => historyEntries.length,
    /** @param {-1 | 1} direction Simulate Back or Forward and dispatch fragment navigation. */
    travel(direction) {
      /** @type {number} Target history position. */
      const destination = historyIndex + direction;
      if (destination < 0 || destination >= historyEntries.length) return;
      historyIndex = destination;
      location.href = String(historyEntries[historyIndex]);
      location.hash = historyEntries[historyIndex].hash;
      windowListeners.hashchange();
    },
    /** @param {string} value Complete HEX edit to commit. */
    edit(value) {
      /** @type {Element} Actual HEX control with real app handlers. */
      const input = byId.get("hex");
      input.dispatch("focus"); input.value = value; input.dispatch("input"); input.dispatch("blur");
    },
    /** @returns {Element[]} Palette squares, excluding their arrow controls. */
    squares: () => byId.get("palette-colors").children.map(/** @param {Element} entry @returns {Element} */ (entry) => entry.children[0]),
    /** @param {number} index Swatch position. @param {-1 | 1} direction Movement offset. @returns {Element} Movement control. */
    arrow: (index, direction) => byId.get("palette-colors").children[index].children[direction === -1 ? 1 : 2]
  };
}

/** Verify add/select/edit isolation through the real input and button handlers. */
test("palette duplicates, auto-saves edits, and switches every format", () => {
  /** @type {object} App initialized with the default color. */
  const app = createApp();
  assert.equal(app.squares().length, 1);
  app.byId.get("palette-add").dispatch("click");
  assert.equal(app.squares().length, 2);
  assert.equal(app.squares()[1].getAttribute("aria-pressed"), "true");
  app.edit("#FF0000");
  assert.equal(app.squares()[0].style.backgroundColor, "#5B8C76");
  assert.equal(app.squares()[1].style.backgroundColor, "#FF0000");
  app.squares()[0].dispatch("click");
  assert.equal(app.byId.get("hex").value, "#5B8C76");
  app.squares()[1].dispatch("click");
  assert.equal(app.byId.get("hex").value, "#FF0000");
  assert.equal(app.byId.get("rgb-r").value, "255");
  assert.equal(app.byId.get("hsl-s").value, "100");
  assert.equal(app.byId.get("hsv-v").value, "100");
  assert.equal(app.byId.get("cmyk-c").value, "0");
  assert.equal(app.byId.get("native-picker").value, "#ff0000");
  assert.equal(app.byId.get("preview-hex").textContent, "#FF0000");
  assert.equal(JSON.parse(app.saved()).selected, 1);
});

/** Verify persistence without a fragment and URL precedence when opening a shared palette. */
test("palette restores saved selection unless a shared palette is supplied", () => {
  /** @type {object} Original app session. */
  const app = createApp();
  app.byId.get("palette-add").dispatch("click");
  app.edit("#123456");
  /** @type {object} Reload using the previous session's local storage. */
  const reloaded = createApp(app.saved());
  assert.equal(reloaded.byId.get("hex").value, "#123456");
  assert.equal(reloaded.squares().length, 2);
  /** @type {object} Shared palette replaces browser-saved entries and starts with its first color. */
  const linked = createApp(app.saved(), "#CC0033,EF00FF");
  assert.equal(linked.squares().length, 2);
  assert.equal(linked.byId.get("hex").value, "#CC0033");
  assert.equal(linked.squares()[1].style.backgroundColor, "#EF00FF");
  assert.equal(JSON.parse(linked.saved()).selected, 0);
  assert.equal(createApp(linked.saved()).hash(), "#CC0033,EF00FF");
  assert.equal(createApp(app.saved(), "#ABCDEF").squares().length, 1);
});

/** Verify each palette mutation is reflected in a shareable URL without reordering on selection. */
test("palette URL tracks edits, additions, removals, and duplicate colors", () => {
  /** @type {object} App loading shorthand and lowercase URL tokens. */
  const app = createApp(null, "#c03,ef00ff");
  assert.equal(app.hash(), "#CC0033,EF00FF");
  app.squares()[1].dispatch("click");
  assert.equal(app.hash(), "#CC0033,EF00FF");
  app.edit("#123456");
  assert.equal(app.hash(), "#CC0033,123456");
  app.byId.get("palette-add").dispatch("click");
  assert.equal(app.hash(), "#CC0033,123456,123456");
  app.byId.get("palette-remove").dispatch("click");
  assert.equal(app.hash(), "#CC0033,123456");
  assert.deepEqual(JSON.parse(createApp(null, app.hash()).saved()).colors, JSON.parse(app.saved()).colors);
});

/** Verify fragment navigation replaces the entire palette only when all tokens are valid. */
test("palette URL navigation validates every color before changing the palette", () => {
  /** @type {object} Initially loaded palette. */
  const app = createApp(null, "#123456,ABCDEF");
  app.navigate("#FF0000,00FF00,0000FF");
  assert.equal(app.squares().length, 3);
  assert.equal(app.byId.get("hex").value, "#FF0000");
  app.navigate("#FFFFFF");
  assert.equal(app.squares().length, 1);
  assert.equal(app.byId.get("hex").value, "#FFFFFF");
  /** @type {string} Saved state that invalid navigation must not change. */
  const saved = app.saved();
  /** @type {string} Invalid fragments, including unsupported alpha and missing entries. */
  for (const fragment of ["#", "#123456,", "#123456,nope", "#123456,,ABCDEF", "#1234", "#12345678"]) {
    app.navigate(fragment);
    assert.equal(app.saved(), saved);
    assert.equal(app.byId.get("hex").value, "#FFFFFF");
    assert.deepEqual(JSON.parse(createApp(saved, fragment).saved()).colors, [[255, 255, 255]]);
  }
});

/** Verify removing middle, last, and first entries updates selection, controls, and persistence. */
test("palette removes the selected color and keeps neighboring swatches editable", () => {
  /** @type {object} App with four distinct colors, initially editing the second entry. */
  const app = createApp(JSON.stringify({ colors: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]], selected: 1 }));
  app.byId.get("palette-remove").dispatch("click");
  assert.equal(app.squares().length, 3);
  assert.equal(app.byId.get("hex").value, "#0000FF");
  assert.equal(app.squares()[1].getAttribute("aria-pressed"), "true");
  assert.equal(app.squares()[1].focused, true);
  assert.deepEqual(JSON.parse(app.saved()).colors, [[255, 0, 0], [0, 0, 255], [255, 255, 255]]);
  app.squares()[2].dispatch("click");
  app.byId.get("palette-remove").dispatch("click");
  assert.equal(app.byId.get("hex").value, "#0000FF");
  assert.equal(app.squares().length, 2);
  app.squares()[0].dispatch("click");
  app.byId.get("palette-remove").dispatch("click");
  assert.equal(app.byId.get("hex").value, "#0000FF");
  assert.equal(app.squares()[0].getAttribute("aria-label"), "Color 1: #0000FF");
  assert.equal(app.byId.get("palette-remove").disabled, true);
  // The handler also guards the last color if invoked without native disabled-button behavior.
  app.byId.get("palette-remove").dispatch("click");
  assert.equal(app.squares().length, 1);
  assert.equal(createApp(app.saved()).squares().length, 1);
  app.byId.get("palette-add").dispatch("click");
  assert.equal(app.byId.get("palette-remove").disabled, false);
  app.edit("#ABCDEF");
  assert.equal(app.squares()[0].style.backgroundColor, "#0000FF");
  assert.equal(app.squares()[1].style.backgroundColor, "#ABCDEF");
});

/** Verify both arrow directions keep the selected color and save the reordered palette. */
test("palette arrows move the selected color and persist the new order", () => {
  /** @type {object} Three-color palette with its middle swatch selected. */
  const app = createApp(null, "#FF0000,00FF00,0000FF");
  app.squares()[1].dispatch("click");
  app.arrow(1, 1).dispatch("click");
  assert.equal(app.hash(), "#FF0000,0000FF,00FF00");
  assert.equal(app.byId.get("hex").value, "#00FF00");
  assert.equal(app.squares()[2].getAttribute("aria-pressed"), "true");
  assert.equal(app.squares()[2].focused, true);
  assert.equal(app.arrow(2, 1).disabled, true);
  assert.equal(app.arrow(0, -1).disabled, true);
  assert.equal(app.arrow(2, -1).getAttribute("aria-label"), "Move color 3: #00FF00 left");
  assert.equal(JSON.parse(app.saved()).selected, 2);
  assert.equal(createApp(app.saved()).hash(), app.hash());
  assert.equal(JSON.parse(createApp(app.saved()).saved()).selected, 2);
  app.arrow(2, -1).dispatch("click");
  assert.equal(app.hash(), "#FF0000,00FF00,0000FF");
  assert.equal(app.squares()[1].getAttribute("aria-pressed"), "true");
  app.edit("#ABCDEF");
  assert.equal(app.hash(), "#FF0000,ABCDEF,0000FF");
  app.byId.get("palette-remove").dispatch("click");
  assert.equal(app.hash(), "#FF0000,0000FF");
});

/** Verify moving other swatches cannot change or overwrite the selected color. */
test("palette arrows handle unselected neighbors, duplicates, and boundaries", () => {
  /** @type {object} Palette initially editing its first red swatch. */
  const app = createApp(null, "#FF0000,00FF00,0000FF");
  app.arrow(1, 1).dispatch("click");
  assert.equal(app.hash(), "#FF0000,0000FF,00FF00");
  assert.equal(app.squares()[0].getAttribute("aria-pressed"), "true");
  app.arrow(1, -1).dispatch("click");
  assert.equal(app.hash(), "#0000FF,FF0000,00FF00");
  assert.equal(app.byId.get("hex").value, "#FF0000");
  assert.equal(app.squares()[1].getAttribute("aria-pressed"), "true");
  // Guard edge moves even when a fixture bypasses native disabled-button behavior.
  app.arrow(0, -1).dispatch("click");
  app.arrow(2, 1).dispatch("click");
  assert.equal(app.hash(), "#0000FF,FF0000,00FF00");
  app.navigate("#FF0000,FF0000");
  app.squares()[1].dispatch("click");
  app.arrow(1, -1).dispatch("click");
  assert.equal(JSON.parse(app.saved()).selected, 0);
  app.navigate("#123456");
  assert.equal(app.arrow(0, -1).disabled, true);
  assert.equal(app.arrow(0, 1).disabled, true);
  app.arrow(0, 1).dispatch("click");
  assert.equal(app.hash(), "#123456");
});

/** Verify Back/Forward restore palette edits and order without creating new history entries. */
test("palette changes create history entries that Back and Forward can restore", () => {
  /** @type {object} Shared palette with one initial history entry. */
  const app = createApp(null, "#f00,00f");
  assert.equal(app.hash(), "#FF0000,0000FF");
  assert.equal(app.historyLength(), 1);
  app.squares()[1].dispatch("click");
  assert.equal(app.historyLength(), 1);
  app.edit("#00FF00");
  assert.equal(app.hash(), "#FF0000,00FF00");
  assert.equal(app.historyLength(), 2);
  app.byId.get("palette-add").dispatch("click");
  assert.equal(app.hash(), "#FF0000,00FF00,00FF00");
  app.arrow(0, 1).dispatch("click");
  assert.equal(app.hash(), "#00FF00,FF0000,00FF00");
  app.byId.get("palette-remove").dispatch("click");
  assert.equal(app.hash(), "#00FF00,FF0000");
  assert.equal(app.historyLength(), 5);
  app.travel(-1);
  assert.equal(app.hash(), "#00FF00,FF0000,00FF00");
  assert.equal(app.squares().length, 3);
  app.travel(-1);
  assert.equal(app.hash(), "#FF0000,00FF00,00FF00");
  app.travel(-1);
  assert.equal(app.hash(), "#FF0000,00FF00");
  app.travel(-1);
  assert.equal(app.hash(), "#FF0000,0000FF");
  assert.equal(app.historyLength(), 5);
  app.squares()[1].dispatch("click");
  assert.equal(app.byId.get("hex").value, "#0000FF");
  app.travel(1);
  assert.equal(app.hash(), "#FF0000,00FF00");
  assert.deepEqual(JSON.parse(app.saved()).colors, [[255, 0, 0], [0, 255, 0]]);
  app.travel(1);
  app.travel(1);
  app.travel(1);
  assert.equal(app.hash(), "#00FF00,FF0000");
  assert.equal(app.squares().length, 2);
  assert.equal(app.historyLength(), 5);
  app.travel(-1);
  app.edit("#ABCDEF");
  assert.equal(app.hash(), "#ABCDEF,FF0000,00FF00");
  app.travel(1);
  assert.equal(app.hash(), "#ABCDEF,FF0000,00FF00");
});

/** Verify canonicalizing a manually entered fragment does not discard forward history. */
test("palette history normalization preserves Forward navigation", () => {
  /** @type {object} Initial state followed by a manually entered shorthand palette. */
  const app = createApp(null, "#FF0000");
  app.navigate("#0f0,00f");
  assert.equal(app.hash(), "#00FF00,0000FF");
  app.edit("#ABCDEF");
  assert.equal(app.historyLength(), 3);
  app.travel(-1);
  assert.equal(app.hash(), "#00FF00,0000FF");
  app.travel(-1);
  assert.equal(app.hash(), "#FF0000");
  app.travel(1);
  app.travel(1);
  assert.equal(app.hash(), "#ABCDEF,0000FF");
  assert.equal(app.historyLength(), 3);
});

/** Verify malformed and inaccessible storage never prevents color editing. */
test("palette tolerates invalid or blocked storage", () => {
  /** @type {string | null} Current invalid saved snapshot. */
  for (const stored of [null, "{", '{"colors":[[999,0,0]],"selected":0}', '{"colors":[[0,0,0]],"selected":5}']) {
    assert.equal(createApp(stored).squares().length, 1);
  }
  /** @type {object} App with localStorage access denied. */
  const app = createApp(null, "", true);
  app.edit("#123456");
  assert.equal(app.squares()[0].style.backgroundColor, "#123456");
  assert.match(app.byId.get("palette-note").textContent, /Could not save/);
});
