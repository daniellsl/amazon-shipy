const $ = (selector) => document.querySelector(selector);

const FIELDS = [
  ["referenceNo", "Reference No."],
  ["clientName", "Client Name"],
  ["addressLine1", "Address Line 1"],
  ["addressLine2", "Address Line 2"],
  ["city", "City"],
  ["province", "Province"],
  ["country", "Country"],
  ["postalCode", "Postal Code"],
  ["contactNumber", "Contact Number"]
];

const ADDRESS_FIELD_KEYS = ["addressLine1", "addressLine2", "city", "province", "postalCode", "country"];

const AMAZON_SELLER_CENTRAL_HOSTS = new Set([
  "sellercentral.amazon.com",
  "sellercentral.amazon.ca",
  "sellercentral.amazon.co.uk",
  "sellercentral.amazon.de",
  "sellercentral.amazon.fr",
  "sellercentral.amazon.it",
  "sellercentral.amazon.es",
  "sellercentral.amazon.com.mx",
  "sellercentral.amazon.com.au",
  "sellercentral.amazon.co.jp",
  "sellercentral.amazon.in",
  "sellercentral.amazon.sg"
]);

const els = {
  connectionStatus: $("#connectionStatus"),
  refreshDetails: $("#refreshDetails"),
  summaryText: $("#summaryText"),
  fieldList: $("#fieldList"),
  checkAddress: $("#checkAddress"),
  copyAll: $("#copyAll")
};

let latestDetails = null;

document.addEventListener("DOMContentLoaded", init);
els.refreshDetails.addEventListener("click", hydrateDetails);
els.checkAddress.addEventListener("click", checkAddress);
els.copyAll.addEventListener("click", copyAllDetails);

async function init() {
  renderFields({});
  await hydrateDetails();
}

async function hydrateDetails() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !isSellerCentralUrl(tab.url)) {
    latestDetails = null;
    els.connectionStatus.textContent = "Open an Amazon Seller Central order page.";
    els.summaryText.textContent = "Seller Central tab not detected";
    setActionState(null);
    renderFields({});
    return;
  }

  els.connectionStatus.textContent = "Connected to Seller Central.";
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "AMAZON_SHIPY_GET_ORDER_DETAILS" }).catch(async () => {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return chrome.tabs.sendMessage(tab.id, { type: "AMAZON_SHIPY_GET_ORDER_DETAILS" });
    });

    latestDetails = response?.details || null;
    renderSummary(latestDetails);
    renderFields(latestDetails || {});
    setActionState(latestDetails);
  } catch (error) {
    latestDetails = null;
    els.summaryText.textContent = error?.message || "Could not read this page";
    setActionState(null);
    renderFields({});
  }
}

function isSellerCentralUrl(url) {
  try {
    return AMAZON_SELLER_CENTRAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function renderSummary(details) {
  if (!details) {
    els.summaryText.textContent = "No order loaded";
    return;
  }
  const found = FIELDS.filter(([key]) => clean(details[key])).length;
  const reference = clean(details.referenceNo) || "order";
  els.summaryText.textContent = `Found ${found} of ${FIELDS.length} fields for ${reference}.`;
}

function renderFields(details) {
  els.fieldList.innerHTML = FIELDS.map(([key, label]) => {
    const value = clean(details[key]);
    const statusClass = value ? "field-status has-value" : "field-status";
    const status = value ? "Detected" : "Missing";
    return `
      <article class="field-card">
        <div class="field-head">
          <span class="field-label">${escapeHtml(label)}</span>
          <span class="${statusClass}">${status}</span>
        </div>
        <div class="copy-row">
          <div class="field-value">${escapeHtml(value || "Not found on page")}</div>
          <button class="copy-button" type="button" data-copy-key="${escapeAttr(key)}" ${value ? "" : "disabled"}>Copy</button>
        </div>
      </article>
    `;
  }).join("");

  els.fieldList.querySelectorAll("[data-copy-key]").forEach((button) => {
    button.addEventListener("click", () => copyField(button.dataset.copyKey, button));
  });
}

async function copyField(key, button) {
  const value = clean(latestDetails?.[key]);
  if (!value) return;
  await navigator.clipboard.writeText(value);
  markCopied(button);
}

async function copyAllDetails() {
  if (!latestDetails) return;
  const text = FIELDS.map(([key, label]) => `${label}: ${clean(latestDetails[key])}`).join("\n");
  await navigator.clipboard.writeText(text);
  markCopied(els.copyAll);
}

async function checkAddress() {
  const address = buildMapAddress(latestDetails);
  if (!address) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  await chrome.tabs.create({ url });
}

function markCopied(button) {
  const original = button.textContent;
  button.textContent = "Copied";
  button.classList.add("copied");
  window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove("copied");
  }, 900);
}

function hasAnyValue(details) {
  return Boolean(details && FIELDS.some(([key]) => clean(details[key])));
}

function hasAddressValue(details) {
  return Boolean(buildMapAddress(details));
}

function setActionState(details) {
  els.checkAddress.disabled = !hasAddressValue(details);
  els.copyAll.disabled = !hasAnyValue(details);
}

function buildMapAddress(details) {
  if (!details) return "";
  return ADDRESS_FIELD_KEYS.map((key) => clean(details[key])).filter(Boolean).join(", ");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
