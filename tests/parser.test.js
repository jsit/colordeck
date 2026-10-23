const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(script, "index.html should contain the application script");
const parserSource = script.slice(script.indexOf("        const clamp ="), script.indexOf("        inputs.forEach((input) => {"));
const { parseFunctional, parseBareFormat } = vm.runInNewContext(
  `${parserSource}\n;({ parseFunctional, parseBareFormat })`,
);

function assertColorsEqual(actual, expected) {
  assert.ok(actual && expected, "both colors should parse");
  actual.forEach((channel, i) => assert.ok(Math.abs(channel - expected[i]) < 1e-8, `${channel} != ${expected[i]}`));
}

test("RGB percentages work with space and comma separators", () => {
  assert.deepEqual(Array.from(parseFunctional("rgb(100% 0% 0%)")), [255, 0, 0]);
  assert.deepEqual(Array.from(parseFunctional("rgb(100%, 0%, 0%)")), [255, 0, 0]);
});

test("wrapped OKLCH unitless and percentage lightness use CSS scales", () => {
  assertColorsEqual(parseFunctional("oklch(0.6 0.1 150)"), parseFunctional("oklch(60% 0.1 150)"));
  assertColorsEqual(parseFunctional("oklch(60% 25% 150)"), parseFunctional("oklch(60% 0.1 150)"));
  assertColorsEqual(parseBareFormat("oklch-l", "60 0.1 150"), parseFunctional("oklch(60% 0.1 150)"));
});

test("LCH chroma percentages use the CSS reference range", () => {
  assertColorsEqual(parseFunctional("lch(50% 20% 150)"), parseFunctional("lch(50% 30 150)"));
});

test("hue units convert to equivalent degrees", () => {
  const expected = parseFunctional("hsl(180deg 100% 50%)");
  for (const hue of ["0.5turn", `${Math.PI}rad`, "200grad"]) {
    assertColorsEqual(parseFunctional(`hsl(${hue} 100% 50%)`), expected);
  }
});

test("bare HSL forms keep the UI's percent-scale syntax", () => {
  const expected = parseBareFormat("hsl-h", "153 11% 45%");
  assertColorsEqual(parseBareFormat("hsl-h", "153 11 45"), expected);
  assertColorsEqual(parseBareFormat("hsl-h", "153,11%,45%"), expected);
});

test("unsupported units and ignored alpha components are rejected", () => {
  assert.equal(parseFunctional("rgb(100foo 0 0)"), null);
  assert.equal(parseFunctional("rgb(255 0 0 / 0.5)"), null);
  assert.equal(parseFunctional("rgba(255, 0, 0, 0.5)"), null);
});
