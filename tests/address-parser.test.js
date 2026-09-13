const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const examplePath = path.join(rootDir, "html template", "shipping-info-example.md");

const parser = loadParser();
const examples = parseExamples(fs.readFileSync(examplePath, "utf8"));

assert.ok(examples.length > 0, "Expected at least one shipping info example.");

examples.forEach((example) => {
  const actual = parser.mapAddressSpanValues(extractAddressSpanValues(example.html));
  assert.deepEqual(plainObject(actual), example.expected, example.name);
});

assert.equal(parser.stripTrailingComma("La Prairie,"), "La Prairie");
assert.equal(parser.normalizePostalCode("j5r1h4"), "J5R 1H4");

console.log(`Address parser examples passed: ${examples.length}`);

function loadParser() {
  const context = {
    chrome: { runtime: { onMessage: { addListener() {} } } },
    document: { querySelector() { return null; } },
    globalThis: null,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    window: { __AMAZON_SHIPY_ENABLE_TEST_API__: true }
  };
  context.globalThis = context.window;

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(rootDir, "content.js"), "utf8"), context, {
    filename: "content.js"
  });

  return context.window.__AMAZON_SHIPY_TEST_API__;
}

function parseExamples(markdown) {
  const blocks = [...markdown.matchAll(/Example\s+(\d+):\s*```html\s*([\s\S]*?)```\s*Expected output:\s*([\s\S]*?)(?=\nExample\s+\d+:|$)/g)];
  return blocks.map(([, number, html, expectedText]) => ({
    name: `Example ${number}`,
    html,
    expected: parseExpectedOutput(expectedText)
  }));
}

function parseExpectedOutput(text) {
  const labelToKey = {
    "Name": "clientName",
    "Address 1": "addressLine1",
    "Address 2": "addressLine2",
    "City": "city",
    "Province": "province",
    "Postal Code": "postalCode",
    "Country": "country"
  };
  const expected = {
    clientName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    province: "",
    country: "",
    postalCode: ""
  };

  text.trim().split("\n").forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) return;
    const key = labelToKey[match[1].trim()];
    if (key) expected[key] = match[2].trim();
  });

  return expected;
}

function extractAddressSpanValues(html) {
  const addressMatch = html.match(/<div\s+data-test-id="shipping-section-buyer-address"[^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(addressMatch, "Expected shipping-section-buyer-address element.");

  return [...addressMatch[1].matchAll(/<span\s+class="">([\s\S]*?)<\/span>/g)]
    .map(([, value]) => htmlToText(value))
    .filter(Boolean);
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function plainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
