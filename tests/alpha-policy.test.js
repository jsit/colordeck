const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scriptStart = html.indexOf("<script>");
const scriptEnd = html.indexOf("</script>", scriptStart);
assert.notEqual(scriptStart, -1);
assert.notEqual(scriptEnd, -1);
const script = html.slice(scriptStart + "<script>".length, scriptEnd);

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
const blurHelperStart = script.indexOf("function settleInputOnBlur(");
const blurHelperEnd = script.indexOf("function parseHex(", blurHelperStart);
assert.notEqual(blurHelperStart, -1);
assert.notEqual(blurHelperEnd, -1);
const createSettleInputOnBlur = (settleChromaChange) => new Function(
  "settleChromaChange",
  `${script.slice(blurHelperStart, blurHelperEnd)}; return settleInputOnBlur;`,
)(settleChromaChange); // eslint-disable-line no-new-func
const parserStart = script.indexOf("function parseColorTokens(");
const parserEnd = script.indexOf("function parseBareFormat(", parserStart);
const parseFunctional = new Function(
  "clamp", "hslToRgb", "hsvToRgb", "lchToRgb", "oklchToRgb", "cmykToRgb",
  `${script.slice(parserStart, parserEnd)}; return parseFunctional;`,
)(
  (value, min, max) => Math.min(max, Math.max(min, value)),
  () => [1, 2, 3],
  () => [1, 2, 3],
  () => [1, 2, 3],
  () => [1, 2, 3],
  () => [1, 2, 3],
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

test("rejected alpha HEX input remains available after blur", () => {
  const settledKeys = [];
  const settleOnBlur = createSettleInputOnBlur((key) => settledKeys.push(key));
  const attributes = { "aria-invalid": "false" };
  const input = {
    value: "#FF000000",
    dataset: { key: "hex" },
    getAttribute: (name) => attributes[name],
  };
  if (!parseHex(input.value)) attributes["aria-invalid"] = "true";

  settleOnBlur(input);
  assert.deepEqual(settledKeys, []);
  assert.equal(input.value, "#FF000000");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.match(script, /input\.addEventListener\("blur", \(\) => \{\s*settleInputOnBlur\(input\);/);
});

test("valid input still settles on blur", () => {
  const settledKeys = [];
  createSettleInputOnBlur((key) => settledKeys.push(key))({
    dataset: { key: "hex" },
    getAttribute: () => "false",
  });
  assert.deepEqual(settledKeys, ["hex"]);
});

test("rejected functional alpha paste stays visible and invalid after blur", () => {
  const pasted = "rgba(255, 0, 0, 0)";
  assert.equal(parseFunctional(pasted), null);

  const settledKeys = [];
  const settleOnBlur = createSettleInputOnBlur((key) => settledKeys.push(key));
  const attributes = { "aria-invalid": "true" };
  const input = {
    dataset: { key: "hex" },
    value: pasted,
    getAttribute: (name) => attributes[name],
  };

  settleOnBlur(input);

  assert.equal(input.value, pasted);
  assert.equal(attributes["aria-invalid"], "true");
  assert.deepEqual(settledKeys, []);
});
