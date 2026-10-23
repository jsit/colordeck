/** Strict assertions for parser results and regression invariants. */
import assert from "node:assert/strict";
/** Read the inline application source without introducing a build step. */
import { readFileSync } from "node:fs";
/** Node's built-in test registration function. */
import test from "node:test";
/** Execute extracted application helpers in an isolated fixture context. */
import vm from "node:vm";

/** @typedef {[number, number, number]} TestRgb Fractional sRGB channels on a 0–255 scale. */
/** @typedef {{value: string}} FieldStub Minimal input used by component-parser checks. */
/**
 * @typedef {Object} ParserApi
 * @property {(value: string) => (TestRgb | null)} parseFunctional Wrapped-color parser.
 * @property {(key: string, value: string) => (TestRgb | null)} parseBareFormat Bare-tuple parser.
 * @property {(key: string) => (TestRgb | null)} rgbFromInput Fieldset-to-RGB conversion.
 * @property {(key: string, value: string) => boolean} pasteColor Complete-color paste handler.
 * @property {() => TestRgb} getRgb Current fixture color accessor.
 */

/** @type {string} Complete page source containing the application under test. */
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
/** @type {string} Case-insensitive copy for locating inline script tags. */
const lowerHtml = html.toLowerCase();
/** @type {number} Opening script tag offset in the page. */
const scriptTagStart = lowerHtml.indexOf("<script");
/** @type {number} First JavaScript character after the opening tag. */
const scriptBodyStart = html.indexOf(">", scriptTagStart) + 1;
/** @type {number} Closing script tag offset. */
const scriptEnd = lowerHtml.indexOf("</script", scriptBodyStart);
assert.ok(scriptTagStart !== -1 && scriptBodyStart > 0 && scriptEnd !== -1, "index.html should contain the application script");
/** @type {string} Inline JavaScript, excluding its HTML tags. */
const script = html.slice(scriptBodyStart, scriptEnd);
/** @type {number} Start of the helper definitions shared by parsing and conversion. */
const start = script.indexOf("const clamp =");
/** @type {number} End of helpers, before event listeners require real DOM inputs. */
const end = script.indexOf("inputs.forEach", start);
assert.ok(start !== -1 && end !== -1, "parser functions should be present in the application script");

/** @type {Record<string, FieldStub>} Mutable fake input values used by direct component edits. */
const fields = {};
/** @type {{fields: Record<string, FieldStub>, document: {getElementById: (id: string) => FieldStub}, colorParser?: ParserApi}} Isolated parser fixture globals. */
const context = { fields, document: { getElementById: /** @param {string} id @returns {FieldStub} */ (id) => fields[id] || { value: "" } } };
vm.runInNewContext(`const colorNames = [];
const inputByKey = { get: (key) => fields[key] };
let rgb = [91, 140, 118];
const $ = (id) => document.getElementById(id);
${script.slice(start, end)}
globalThis.colorParser = { parseFunctional, parseBareFormat, rgbFromInput, pasteColor, getRgb: () => rgb };`, context);
/** @type {ParserApi} Extracted parser entry points and current-state accessor. */
const { parseFunctional, parseBareFormat, rgbFromInput, pasteColor, getRgb } = context.colorParser;

/** @param {TestRgb | null} actual Parsed channels. @param {TestRgb | null} expected Reference channels. @returns {void} Assert channel equality within 1e-6. */
const closeTo = (actual, expected) => {
  assert.ok(actual, "expected a parsed color");
  assert.equal(actual.length, 3);
  actual.forEach(/** @param {number} channel @param {number} i @returns {void} */ (channel, i) => assert.ok(Math.abs(channel - expected[i]) < 1e-6));
};

/** @returns {void} Cover valid syntax, normalization, units, and finite large-value conversions. */
test("functional color syntax accepts supported forms and normalizes values", () => {
  /** @type {Array<[string, TestRgb | null]>} Inputs paired with exact expected RGB, or null when only finiteness is checked. */
  const valid = [
    ["rgb(12, 0, 0)", [12, 0, 0]],
    ["rgb(100% 0% 0%)", [255, 0, 0]],
    ["rgb(50% 0% 0%)", [127.5, 0, 0]],
    ["rgb(255 255 100%)", [255, 255, 255]],
    ["hsl(120, 100%, 50%)", [0, 255, 0]],
    ["hsl(120 100 50)", [0, 255, 0]],
    ["hsl(120 100% 50)", [0, 255, 0]],
    ["hsl(120 150% -10%)", [0, 0, 0]],
    ["hsv(120 100% 100%)", [0, 255, 0]],
    ["lch(50% 40 30deg)", null],
    ["oklch(50% .1 30deg)", null],
    ["cmyk(0%, 100%, 100%, 0%)", [255, 0, 0]],
    ["rgb(1e308 0 0)", [255, 0, 0]],
    ["lch(50% 1e308 0deg)", null]
  ];
  /** @type {[string, TestRgb | null]} Current input string and its expected channels. */
  for (const [input, expected] of valid) {
    /** @type {TestRgb | null} Result of parsing the current valid example. */
    const actual = parseFunctional(input);
    if (expected) closeTo(actual, expected);
    else assert.ok(actual?.every(Number.isFinite), `expected finite output for ${input}`);
  }
  closeTo(parseFunctional("hsl(20 30% 40)"), parseFunctional("hsl(20 30% 40%)"));
  /** @type {TestRgb | null} Cyan reference used to verify equivalent hue angle units. */
  const expectedHue = parseFunctional("hsl(180deg 100% 50%)");
  /** @type {string} Alternative angle notation representing 180 degrees. */
  for (const hue of ["0.5turn", `${Math.PI}rad`, "200grad"]) {
    closeTo(parseFunctional(`hsl(${hue} 100% 50%)`), expectedHue);
  }
  closeTo(parseFunctional("oklch(0.6 0.1 150)"), parseFunctional("oklch(60% 0.1 150)"));
  closeTo(parseFunctional("oklch(60% 25% 150)"), parseFunctional("oklch(60% 0.1 150)"));
  closeTo(parseFunctional("lch(50% 20% 150)"), parseFunctional("lch(50% 30 150)"));
});

/** @returns {void} Reject malformed function text, unsupported alpha, and incompatible units. */
test("functional color syntax rejects malformed tokens, separators, counts, and units", () => {
  /** @type {string[]} Wrapped colors that must not be accepted. */
  const invalid = [
    "rgb(12oops 0 0)",
    "hsl(20 30 40 50 60)",
    "rgb(1 2 3 4)",
    "rgb(1 2 / 3)",
    "rgb(1 2 3 / .5 / .2)",
    "rgb(1, 2, 3 / .5)",
    "rgb(1,,3)",
    "rgb(1deg 2 3)",
    "hsl(20 30deg 40%)",
    "hsl(120, 100, 50)",
    "hsla(480deg 100% 50%)",
    "hsla(120, 100, 50)",
    "hsv(20 30% 40% / .5)",
    "lch(50% 30deg 20deg)",
    "cmyk(0 0 0 0 / .5)",
    "rgb(1 2 3) trailing",
    "rgb(255 0 0 / 0.5)",
    "rgba(255, 0, 0, 0.5)"
  ];
  /** @type {string} Current invalid example passed to the parser. */
  for (const input of invalid) assert.equal(parseFunctional(input), null, input);
});

/** @returns {void} Verify equivalent hue units and chroma percentages give equivalent colors. */
test("functional angles and perceptual percentages are converted", () => {
  /** @type {Array<[string, string]>} Pairs of syntactically different but equivalent colors. */
  const equivalents = [
    ["hsl(120deg 100% 50%)", "hsl(133.33333333333334grad 100% 50%)"],
    ["hsl(120deg 100% 50%)", "hsl(2.0943951023931953rad 100% 50%)"],
    ["lch(50% 45 0deg)", "lch(50% 30% 0deg)"],
    ["oklch(50% .1 0deg)", "oklch(50% 25% 0deg)"]
  ];
  /** @type {[string, string]} Current reference and alternate color-function strings. */
  for (const [first, second] of equivalents) {
    /** @type {TestRgb | null} Reference conversion output. */
    const expected = parseFunctional(first);
    /** @type {TestRgb | null} Alternate notation's conversion output. */
    const actual = parseFunctional(second);
    assert.ok(expected && actual);
    expected.forEach(/** @param {number} channel @param {number} i @returns {void} */ (channel, i) => assert.ok(Math.abs(channel - actual[i]) < 1e-6));
  }
});

/** @returns {void} Keep convenient bare tuples while respecting percentages and UI lightness units. */
test("bare values retain flexible separators and HSL units", () => {
  /** @type {Array<[string, string, TestRgb]>} Target field, pasted text, and expected RGB examples. */
  const valid = [
    ["hsl-h", "120, 100%, 50%", [0, 255, 0]],
    ["hsl-h", "120 100 50", [0, 255, 0]],
    ["hsl-h", "120deg, 100%, 50%", [0, 255, 0]],
    ["rgb-r", "100%, 0%, 0%", [255, 0, 0]],
    ["rgb-r", "50% 0% 0%", [127.5, 0, 0]],
    ["rgb-r", "255 255 100%", [255, 255, 255]]
  ];
  /** @type {[string, string, TestRgb]} Current field key, tuple text, and expected channels. */
  for (const [key, input, expected] of valid) closeTo(parseBareFormat(key, input), expected);
  /** @type {TestRgb | null} Baseline HSL tuple for comparing separator/percentage variants. */
  const hslExpected = parseBareFormat("hsl-h", "153 11% 45%");
  closeTo(parseBareFormat("hsl-h", "153 11 45"), hslExpected);
  closeTo(parseBareFormat("hsl-h", "153,11%,45%"), hslExpected);
  closeTo(parseBareFormat("oklch-l", "60 0.1 150"), parseFunctional("oklch(60% 0.1 150)"));
});

/** @returns {void} Prevent hue units and stray separators from being ignored in non-hue positions. */
test("bare values reject suffixes outside their component roles", () => {
  /** @type {Array<[string, string]>} Field keys paired with incompatible tuple syntax. */
  const invalid = [
    ["rgb-r", "10deg 20 30"],
    ["hsl-h", "20 30deg 40"],
    ["hsl-h", "20% 30 40"],
    ["lch-l", "50 20deg 30"],
    ["lch-l", "50 20deg 30"],
    ["cmyk-c", "0 0 0 0deg"],
    ["rgb-r", "10 20 30/"]
  ];
  /** @type {[string, string]} Current field key and rejected text. */
  for (const [key, input] of invalid) assert.equal(parseBareFormat(key, input), null, input);
});

/** @returns {void} Verify perceptual hue normalization prevents overflow in direct edits. */
test("direct component edits with extreme hues remain finite", () => {
  /** @type {[string, string]} Model name and its hue-input key. */
  for (const [format, key] of [["lch", "lch-h"], ["oklch", "oklch-h"]]) {
    /** @type {string} Model channel whose fake field is being populated. */
    for (const component of ["l", "c", "h"]) fields[`${format}-${component}`] = { value: component === "l" ? "50" : component === "c" ? "0.2" : "1e308" };
    /** @type {TestRgb | null} RGB result from the three fixture fields. */
    const color = rgbFromInput(key);
    assert.ok(color?.every(Number.isFinite), `${format} should normalize its extreme hue`);
  }
});

/** @returns {void} Ensure rejected complete-color pastes leave the selected RGB unchanged. */
test("rejected pasted colors do not mutate the selected color", () => {
  /** @type {number[]} Host-realm copy of the fixture's initial RGB state. */
  const initial = Array.from(getRgb());
  /** @type {string} Invalid or overflowing color-function input. */
  for (const input of ["rgb(12oops 0 0)", "hsl(20 30 40 50 60)", "rgb(1e999 0 0)"]) {
    assert.equal(pasteColor("rgb-r", input), false, input);
    assert.deepEqual(Array.from(getRgb()), initial, input);
  }
});
