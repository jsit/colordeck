const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function extractFunction(name, nextName, dependencies = []) {
  const start = script.indexOf(`function ${name}(`);
  const end = script.indexOf(`function ${nextName}(`, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = script.slice(start, end);
  return new Function(...dependencies, `${source}; return ${name};`)( // eslint-disable-line no-new-func
    ...dependencies.map((dependency) => ({
      clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
      hslToRgb: () => [1, 2, 3],
      hsvToRgb: () => [1, 2, 3],
      lchToRgb: () => [1, 2, 3],
      oklchToRgb: () => [1, 2, 3],
      cmykToRgb: () => [1, 2, 3],
    })[dependency]),
  );
}

const parseHex = extractFunction("parseHex", "parseFunctional");
const parseFunctional = extractFunction(
  "parseFunctional",
  "parseBareFormat",
  ["clamp", "hslToRgb", "hsvToRgb", "lchToRgb", "oklchToRgb", "cmykToRgb"],
);

test("HEX parsing accepts opaque shorthand and full values only", () => {
  assert.deepEqual(parseHex("#abc"), [170, 187, 204]);
  assert.deepEqual(parseHex("#AABBCC"), [170, 187, 204]);
  assert.equal(parseHex("#f000"), null);
  assert.equal(parseHex("#FF000000"), null);
});

test("functional parsing rejects alpha-bearing syntax", () => {
  assert.deepEqual(parseFunctional("rgb(255, 0, 0)"), [255, 0, 0]);
  assert.deepEqual(parseFunctional("hsl(0 100% 50%)"), [1, 2, 3]);
  assert.equal(parseFunctional("rgba(255, 0, 0, 0)"), null);
  assert.equal(parseFunctional("hsla(0, 100%, 50%, 0)"), null);
  assert.equal(parseFunctional("rgb(255 0 0 / 0)"), null);
  assert.equal(parseFunctional("hsl(0 100% 50% / 0)"), null);
});
