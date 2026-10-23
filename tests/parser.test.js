import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const lowerHtml = html.toLowerCase();
const scriptTagStart = lowerHtml.indexOf("<script");
const scriptBodyStart = html.indexOf(">", scriptTagStart) + 1;
const scriptEnd = lowerHtml.indexOf("</script", scriptBodyStart);
assert.ok(scriptTagStart !== -1 && scriptBodyStart > 0 && scriptEnd !== -1, "index.html should contain the application script");
const script = html.slice(scriptBodyStart, scriptEnd);
const start = script.indexOf("const clamp =");
const end = script.indexOf("inputs.forEach", start);
assert.ok(start !== -1 && end !== -1, "parser functions should be present in the application script");

const fields = {};
const context = { fields, document: { getElementById: (id) => fields[id] || { value: "" } } };
vm.runInNewContext(`let rgb = [91, 140, 118];
const $ = (id) => document.getElementById(id);
${script.slice(start, end)}
globalThis.colorParser = { parseFunctional, parseBareFormat, rgbFromInput, pasteColor, getRgb: () => rgb };`, context);
const { parseFunctional, parseBareFormat, rgbFromInput, pasteColor, getRgb } = context.colorParser;

const closeTo = (actual, expected) => {
  assert.ok(actual, "expected a parsed color");
  assert.equal(actual.length, 3);
  actual.forEach((channel, i) => assert.ok(Math.abs(channel - expected[i]) < 1e-6));
};

test("functional color syntax accepts supported forms and normalizes values", () => {
  const valid = [
    ["rgb(12, 0, 0)", [12, 0, 0]],
    ["rgb(100% 0% 0%)", [255, 0, 0]],
    ["rgb(12 0 0 / 50%)", [12, 0, 0]],
    ["hsl(120, 100%, 50%)", [0, 255, 0]],
    ["hsla(480deg 100% 50% / .5)", [0, 255, 0]],
    ["hsl(120 150% -10%)", [0, 0, 0]],
    ["hsv(120 100% 100%)", [0, 255, 0]],
    ["lch(50% 40 30deg)", null],
    ["oklch(50% .1 30deg)", null],
    ["cmyk(0%, 100%, 100%, 0%)", [255, 0, 0]],
    ["rgb(1e308 0 0)", [255, 0, 0]],
    ["lch(50% 1e308 0deg)", null]
  ];
  for (const [input, expected] of valid) {
    const actual = parseFunctional(input);
    if (expected) closeTo(actual, expected);
    else assert.ok(actual?.every(Number.isFinite), `expected finite output for ${input}`);
  }
});

test("functional color syntax rejects malformed tokens, separators, counts, and units", () => {
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
    "hsl(20 30% 40)",
    "hsv(20 30% 40% / .5)",
    "lch(50% 30deg 20deg)",
    "cmyk(0 0 0 0 / .5)",
    "rgb(1 2 3) trailing"
  ];
  for (const input of invalid) assert.equal(parseFunctional(input), null, input);
});

test("functional angles and perceptual percentages are converted", () => {
  const equivalents = [
    ["hsl(120deg 100% 50%)", "hsl(133.33333333333334grad 100% 50%)"],
    ["hsl(120deg 100% 50%)", "hsl(2.0943951023931953rad 100% 50%)"],
    ["lch(50% 45 0deg)", "lch(50% 30% 0deg)"],
    ["oklch(50% .1 0deg)", "oklch(50% 25% 0deg)"]
  ];
  for (const [first, second] of equivalents) {
    const expected = parseFunctional(first);
    const actual = parseFunctional(second);
    assert.ok(expected && actual);
    expected.forEach((channel, i) => assert.ok(Math.abs(channel - actual[i]) < 1e-6));
  }
});

test("bare values retain flexible separators and HSL units", () => {
  const valid = [
    ["hsl-h", "120, 100%, 50%", [0, 255, 0]],
    ["hsl-h", "120 100 50", [0, 255, 0]],
    ["hsl-h", "120deg, 100%, 50%", [0, 255, 0]],
    ["rgb-r", "100%, 0%, 0%", [255, 0, 0]]
  ];
  for (const [key, input, expected] of valid) closeTo(parseBareFormat(key, input), expected);
});

test("bare values reject suffixes outside their component roles", () => {
  const invalid = [
    ["rgb-r", "10deg 20 30"],
    ["hsl-h", "20 30deg 40"],
    ["hsl-h", "20% 30 40"],
    ["lch-l", "50 20deg 30"],
    ["lch-l", "50 20 30rad"],
    ["cmyk-c", "0 0 0 0deg"],
    ["rgb-r", "10 20 30/"]
  ];
  for (const [key, input] of invalid) assert.equal(parseBareFormat(key, input), null, input);
});

test("direct component edits with extreme hues remain finite", () => {
  for (const [format, key] of [["lch", "lch-h"], ["oklch", "oklch-h"]]) {
    for (const component of ["l", "c", "h"]) fields[`${format}-${component}`] = { value: component === "l" ? "50" : component === "c" ? "0.2" : "1e308" };
    const color = rgbFromInput(key);
    assert.ok(color?.every(Number.isFinite), `${format} should normalize its extreme hue`);
  }
});

test("rejected pasted colors do not mutate the selected color", () => {
  const initial = Array.from(getRgb());
  for (const input of ["rgb(12oops 0 0)", "hsl(20 30 40 50 60)", "rgb(1e999 0 0)"]) {
    assert.equal(pasteColor("rgb-r", input), false, input);
    assert.deepEqual(Array.from(getRgb()), initial, input);
  }
});
