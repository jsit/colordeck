/** @type {typeof import("node:assert/strict")} Strict fixture assertions. */
const assert = require("node:assert/strict");
/** @type {typeof import("node:fs")} File access for the inline application script. */
const fs = require("node:fs");
/** @type {typeof import("node:path")} Platform-independent test fixture paths. */
const path = require("node:path");
/** @type {typeof import("node:test")} Node's built-in test registration function. */
const test = require("node:test");

/** @typedef {[number, number, number]} TestRgb Opaque sRGB channels, 0–255. */
/**
 * Minimal input fixture for validation and HEX commit handlers.
 * @typedef {Object} InputStub
 * @property {{key: string}} dataset Component key exposed to the handlers.
 * @property {string} value Current input text.
 * @property {string | null} [invalid] Last written validation state.
 * @property {(name: string, value: string) => void} [setAttribute] Validation marker writer.
 * @property {(name: string) => string} [getAttribute] Validation marker reader.
 */
/** @typedef {{rgb: TestRgb, hexEditRgb: TestRgb, updated: Array<string | undefined>}} EditState */

/** @type {string} Page source containing the parsers and handlers under test. */
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
/** @type {number} Offset of the exact opening inline script tag. */
const scriptStart = html.indexOf("<script>");
/** @type {number} Offset of the corresponding closing script tag. */
const scriptEnd = html.indexOf("</script>", scriptStart);
assert.notEqual(scriptStart, -1);
assert.notEqual(scriptEnd, -1);
/** @type {string} Inline JavaScript without HTML tags. */
const script = html.slice(scriptStart + "<script>".length, scriptEnd);

/**
 * Extract a helper and supply minimal dependencies instead of constructing a DOM.
 * @param {string} name Function to return from the isolated source slice.
 * @param {string} nextName Next function declaration marking the slice boundary.
 * @param {string[]} [dependencies=[]] Dependency names to inject into the helper.
 * @returns {Function} Extracted helper using deterministic conversion stubs.
 */
function extractFunction(name, nextName, dependencies = []) {
  /** @type {number} Offset of the requested declaration. */
  const start = script.indexOf(`function ${name}(`);
  /** @type {number} Offset of the following declaration. */
  const end = script.indexOf(`function ${nextName}(`, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  /** @type {string} Helper declarations evaluated by the generated fixture function. */
  const source = script.slice(start, end);
  return new Function(...dependencies, `${source}; return ${name};`)( // eslint-disable-line no-new-func
    ...dependencies.map(/** @param {string} dependency @returns {Function | undefined} Fixture helper matching the injected name. */ (dependency) => ({
      /** @param {number} value @param {number} min @param {number} max @returns {number} */
      clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
      /** @returns {TestRgb} Deterministic HSL conversion placeholder. */
      hslToRgb: () => [1, 2, 3],
      /** @returns {TestRgb} Deterministic HSV conversion placeholder. */
      hsvToRgb: () => [1, 2, 3],
      /** @returns {TestRgb} Deterministic LCH conversion placeholder. */
      lchToRgb: () => [1, 2, 3],
      /** @returns {TestRgb} Deterministic OKLCH conversion placeholder. */
      oklchToRgb: () => [1, 2, 3],
      /** @returns {TestRgb} Deterministic CMYK conversion placeholder. */
      cmykToRgb: () => [1, 2, 3],
    })[dependency]),
  );
}

/** @type {(value: string) => (TestRgb | null)} Opaque-only HEX parser extracted from the page. */
const parseHex = extractFunction("parseHex", "parseFunctional");
/** @type {number} Start of the blur validation helper. */
const blurHelperStart = script.indexOf("function settleInputOnBlur(");
/** @type {number} End of that helper, before the HEX parser. */
const blurHelperEnd = script.indexOf("function parseHex(", blurHelperStart);
assert.notEqual(blurHelperStart, -1);
assert.notEqual(blurHelperEnd, -1);
/** @param {(key: string) => void} settleChromaChange Spy for successful blur commits. @returns {(input: InputStub) => void} Isolated blur helper. */
const createSettleInputOnBlur = (settleChromaChange) => new Function(
  "settleChromaChange",
  `${script.slice(blurHelperStart, blurHelperEnd)}; return settleInputOnBlur;`,
)(settleChromaChange); // eslint-disable-line no-new-func
/** @type {number} Start of numeric token helpers needed by functional parsing. */
const parserStart = script.indexOf("function parseColorNumber(");
/** @type {number} End of functional parsing, before bare-tuple parsing. */
const parserEnd = script.indexOf("function parseBareFormat(", parserStart);
/** @type {(value: string) => (TestRgb | null)} Real functional parser with color-math stubs; these checks target syntax/alpha policy. */
const parseFunctional = new Function(
  "clamp", "hslToRgb", "hsvToRgb", "lchToRgb", "oklchToRgb", "cmykToRgb",
  `${script.slice(parserStart, parserEnd)}; return parseFunctional;`,
)(
  /** @param {number} value @param {number} min @param {number} max @returns {number} */
  (value, min, max) => Math.min(max, Math.max(min, value)),
  /** @returns {TestRgb} HSL conversion stub. */
  () => [1, 2, 3],
  /** @returns {TestRgb} HSV conversion stub. */
  () => [1, 2, 3],
  /** @returns {TestRgb} LCH conversion stub. */
  () => [1, 2, 3],
  /** @returns {TestRgb} OKLCH conversion stub. */
  () => [1, 2, 3],
  /** @returns {TestRgb} CMYK conversion stub. */
  () => [1, 2, 3],
);

/** @returns {void} Accept supported opaque HEX lengths and reject alpha-bearing lengths. */
test("HEX parsing accepts opaque shorthand and full values only", () => {
  assert.deepEqual(parseHex("#abc"), [170, 187, 204]);
  assert.deepEqual(parseHex("#AABBCC"), [170, 187, 204]);
  assert.equal(parseHex("#f000"), null);
  assert.equal(parseHex("#FF000000"), null);
});

/** @returns {void} Verify rejected full HEX edits restore the snapshot without erasing validation state. */
test("HEX input restores the pre-edit color when a completed edit is rejected", () => {
  /** @type {number} Start of the real input handler. */
  const handlerStart = script.indexOf("function handleInput(");
  /** @type {number} End of its extractable helper region. */
  const handlerEnd = script.indexOf("function pasteColor(", handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  /** @type {string} Application handlers inserted into the generated fixture. */
  const source = script.slice(handlerStart, handlerEnd);
  /** @type {InputStub} Editable HEX input with a validation-state spy. */
  const input = {
    dataset: { key: "hex" },
    value: "#FF0000",
    invalid: null,
    /** @param {string} name @param {string} value @returns {void} Record invalid-state changes. */
    setAttribute(name, value) {
      if (name === "aria-invalid") this.invalid = value;
    },
  };
  /** @type {EditState} Selected color, rollback snapshot, and field-update call history. */
  const state = {
    rgb: [91, 140, 118],
    hexEditRgb: [91, 140, 118],
    updated: [],
  };
  /** @type {() => void} Generated input handler using fake DOM/conversion dependencies. */
  const createHandler = new Function(
    "input", "state",
    `let rgb = state.rgb;
    let hexEditRgb = state.hexEditRgb;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const parseFunctional = () => null;
    const parseBareFormat = () => null;
    const rgbFromInput = (key) => {
      if (key !== "hex" || !/^#?[\\da-f]{6}$/i.test(input.value.trim())) return null;
      const hex = input.value.trim().replace(/^#/, "");
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    };
    const updateFields = (key) => state.updated.push(key);
    ${source}
    return () => {
      handleInput(input);
      state.rgb = rgb;
    };`,
  )(
    input,
    state,
  );

  createHandler();
  assert.deepEqual(input.invalid, "false");
  assert.deepEqual(state.rgb, [255, 0, 0]);
  assert.deepEqual(state.updated, ["hex"]);
  input.value = "#FF000000";
  createHandler();

  assert.deepEqual(input.invalid, "true");
  assert.deepEqual(state.rgb, [91, 140, 118]);
  assert.deepEqual(state.updated, ["hex", "hex"]);
});

/** @returns {void} Verify an Enter shorthand commit replaces the rollback snapshot for later rejected edits. */
test("rejected HEX after an Enter commit restores the committed shorthand color", () => {
  /** @type {number} Start of the source input handler region. */
  const handlerStart = script.indexOf("function handleInput(");
  /** @type {number} End of the source input handler region. */
  const handlerEnd = script.indexOf("function pasteColor(", handlerStart);
  /** @type {number} Start of the shorthand-commit helper. */
  const commitStart = script.indexOf("function commitHexShorthand(");
  /** @type {number} End of the shorthand-commit helper region. */
  const commitEnd = script.indexOf("function pasteColor(", commitStart);
  /** @type {RegExpMatchArray | null} Source body of the real HEX keydown listener. */
  const keydownHandler = script.match(/input\.addEventListener\("keydown", \(event\) => \{([\s\S]*?)\n          \}\);/);
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  assert.notEqual(commitStart, -1);
  assert.notEqual(commitEnd, -1);
  assert.ok(keydownHandler);

  /** @type {InputStub} Pending shorthand text and validation-state writer. */
  const input = {
    dataset: { key: "hex" },
    value: "#abc",
    invalid: null,
    /** @param {string} name @param {string} value @returns {void} Save invalid-state changes. */
    setAttribute(name, value) {
      if (name === "aria-invalid") this.invalid = value;
    },
  };
  /** @type {EditState} Shared edit/rollback state visible to the generated fixture. */
  const state = {
    rgb: [91, 140, 118],
    hexEditRgb: [91, 140, 118],
    updated: [],
  };
  /** @type {{pressEnter: () => boolean, reject: () => void}} Fixture actions using the extracted Enter and input handlers. */
  const createHandlers = new Function(
    "input", "state", "parseHex",
    `let rgb = state.rgb;
    let hexEditRgb = state.hexEditRgb;
    const $ = () => input;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const parseFunctional = () => null;
    const parseBareFormat = () => null;
    const rememberInputHue = () => {};
    const rgbFromInput = (key) => {
      if (key !== "hex" || !/^#?[\\da-f]{6}$/i.test(input.value.trim())) return null;
      const hex = input.value.trim().replace(/^#/, "");
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    };
    const updateFields = (key) => {
      state.updated.push(key);
      if (key === undefined) input.value = "#" + rgb.map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
    };
    ${script.slice(commitStart, commitEnd)}
    ${script.slice(handlerStart, handlerEnd)}
    let keydown;
    input.addEventListener = (type, listener) => {
      if (type === "keydown") keydown = listener;
    };
    input.addEventListener("keydown", (event) => {${keydownHandler[1]}
    });
    return {
      pressEnter() {
        let prevented = false;
        keydown({ key: "Enter", preventDefault() { prevented = true; } });
        state.rgb = rgb;
        state.hexEditRgb = hexEditRgb;
        return prevented;
      },
      reject() {
        handleInput(input);
        state.rgb = rgb;
        state.hexEditRgb = hexEditRgb;
      },
    };`,
  )(input, state, parseHex); // eslint-disable-line no-new-func

  assert.equal(createHandlers.pressEnter(), true);
  assert.equal(input.value, "#AABBCC");
  assert.deepEqual(state.rgb, [170, 187, 204]);
  assert.deepEqual(state.hexEditRgb, [170, 187, 204]);

  input.value += "00";
  createHandlers.reject();
  assert.equal(input.invalid, "true");
  assert.deepEqual(state.rgb, [170, 187, 204]);
});

/** @returns {void} Reject alpha aliases and slash-alpha syntax without invoking real color conversions. */
test("functional parsing rejects alpha-bearing syntax", () => {
  assert.deepEqual(parseFunctional("rgb(255, 0, 0)"), [255, 0, 0]);
  assert.deepEqual(parseFunctional("hsl(0 100% 50%)"), [1, 2, 3]);
  assert.equal(parseFunctional("rgba(255, 0, 0, 0)"), null);
  assert.equal(parseFunctional("hsla(0, 100%, 50%, 0)"), null);
  assert.equal(parseFunctional("rgb(255 0 0 / 0)"), null);
  assert.equal(parseFunctional("hsl(0 100% 50% / 0)"), null);
});

/** @returns {void} Preserve rejected HEX text and its error marker after blur. */
test("rejected alpha HEX input remains available after blur", () => {
  /** @type {string[]} Keys whose edits were settled by the blur helper. */
  const settledKeys = [];
  /** @type {(input: InputStub) => void} Blur helper with a call-recording settlement spy. */
  const settleOnBlur = createSettleInputOnBlur(/** @param {string} key @returns {number} */ (key) => settledKeys.push(key));
  /** @type {Record<string, string>} Mutable fake input validation attributes. */
  const attributes = { "aria-invalid": "false" };
  /** @type {InputStub} Alpha HEX input whose rejected text must remain visible. */
  const input = {
    value: "#FF000000",
    dataset: { key: "hex" },
    /** @param {string} name @returns {string} Read the fixture's validation marker. */
    getAttribute: (name) => attributes[name],
  };
  if (!parseHex(input.value)) attributes["aria-invalid"] = "true";

  settleOnBlur(input);
  assert.deepEqual(settledKeys, []);
  assert.equal(input.value, "#FF000000");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.match(script, /input\.addEventListener\("blur", \(\) => \{[\s\S]*?settleInputOnBlur\(input\);/);
});

/** @returns {void} Ensure the alpha rejection guard doesn't suppress valid blur commits. */
test("valid input still settles on blur", () => {
  /** @type {string[]} Committed field keys captured by the spy. */
  const settledKeys = [];
  createSettleInputOnBlur(/** @param {string} key @returns {number} */ (key) => settledKeys.push(key))({
    dataset: { key: "hex" },
    /** @returns {string} Validation marker representing a valid field. */
    getAttribute: () => "false",
  });
  assert.deepEqual(settledKeys, ["hex"]);
});

/** @returns {void} Keep a rejected functional alpha paste available for correction after blur. */
test("rejected functional alpha paste stays visible and invalid after blur", () => {
  /** @type {string} Fully transparent red expressed in legacy RGBA syntax. */
  const pasted = "rgba(255, 0, 0, 0)";
  assert.equal(parseFunctional(pasted), null);

  /** @type {string[]} Settled field keys; must stay empty for the rejected input. */
  const settledKeys = [];
  /** @type {(input: InputStub) => void} Isolated blur helper with a settlement spy. */
  const settleOnBlur = createSettleInputOnBlur(/** @param {string} key @returns {number} */ (key) => settledKeys.push(key));
  /** @type {Record<string, string>} Invalid-state fixture attributes. */
  const attributes = { "aria-invalid": "true" };
  /** @type {InputStub} Field containing rejected RGBA text. */
  const input = {
    dataset: { key: "hex" },
    value: pasted,
    /** @param {string} name @returns {string} Read the fixture's invalid-state attribute. */
    getAttribute: (name) => attributes[name],
  };

  settleOnBlur(input);

  assert.equal(input.value, pasted);
  assert.equal(attributes["aria-invalid"], "true");
  assert.deepEqual(settledKeys, []);
});
