(() => {
  if (window.__AMAZON_SHIPY_CONTENT_LOADED__) return;
  window.__AMAZON_SHIPY_CONTENT_LOADED__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "AMAZON_SHIPY_GET_ORDER_DETAILS") {
      sendResponse({ ok: true, details: extractOrderDetails() });
      return false;
    }
    return false;
  });

  function extractOrderDetails() {
    const pageText = normalizeText(document.body?.innerText || "");
    const shippingText = findShippingBlockText();
    const address = parseAddress(shippingText || pageText);

    return {
      referenceNo: firstValue([
        findLabelValue(/(?:Amazon\s*)?Order\s*(?:ID|#|Number|No\.?)/i),
        findLabelValue(/Reference\s*(?:ID|#|Number|No\.?)/i),
        matchText(pageText, /\b(?:Amazon\s*)?Order\s*(?:ID|#|Number|No\.?)\s*[:#]?\s*([0-9]{3}-[0-9]{7}-[0-9]{7}|[A-Z0-9-]{8,})/i),
        matchText(location.href, /(?:orderID|orderId|order-id|orderNumber|order-number)=([A-Z0-9-]+)/i),
        matchText(location.pathname, /\/orders?(?:-v\d+)?\/(?:order\/)?([A-Z0-9-]{8,})/i)
      ]),
      clientName: firstValue([
        findLabelValue(/(?:Buyer|Customer|Client|Recipient|Ship\s*to)\s*Name/i),
        findLabelValue(/(?:Buyer|Customer|Client|Recipient|Ship\s*to)/i),
        parseNameFromShippingBlock(shippingText)
      ]),
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      province: address.province,
      country: address.country,
      postalCode: address.postalCode,
      contactNumber: firstValue([
        findLabelValue(/(?:Contact|Phone|Telephone|Mobile)\s*(?:Number|No\.?)?/i),
        matchText(pageText, /(?:Contact|Phone|Telephone|Mobile)\s*(?:Number|No\.?)?\s*[:#]?\s*(\+?\d[\d\s().-]{6,}\d)/i)
      ])
    };
  }

  function findShippingBlockText() {
    const labelPattern = /(shipping address|ship to|recipient address|delivery address|buyer address)/i;
    const candidates = visibleElements()
      .filter((node) => labelPattern.test(normalizeText(node.innerText || node.textContent || "")))
      .map((node) => bestReadableContainer(node))
      .filter(Boolean);

    const scored = uniqueNodes(candidates)
      .map((node) => ({ node, text: normalizeLines(node.innerText || node.textContent || "") }))
      .filter((item) => item.text.length > 12)
      .sort((a, b) => scoreShippingBlock(b.text) - scoreShippingBlock(a.text));

    return scored[0]?.text || "";
  }

  function visibleElements() {
    return [...document.querySelectorAll("body *")].filter((node) => {
      const text = node.innerText || node.textContent || "";
      if (!text.trim()) return false;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function bestReadableContainer(node) {
    let current = node;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const text = normalizeLines(current.innerText || current.textContent || "");
      const lineCount = text.split("\n").filter(Boolean).length;
      if (lineCount >= 3 && text.length < 900) return current;
      current = current.parentElement;
    }
    return node.closest("section, table, .a-box, .a-section, [class*='address' i], [class*='shipping' i]") || node.parentElement || node;
  }

  function scoreShippingBlock(text) {
    let score = 0;
    if (/shipping address|ship to|recipient address|delivery address/i.test(text)) score += 12;
    if (/city|province|state|postal|zip|country/i.test(text)) score += 8;
    if (/\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/i.test(text) || /\b\d{5}(?:-\d{4})?\b/.test(text)) score += 6;
    if (/\+?\d[\d\s().-]{6,}\d/.test(text)) score += 3;
    return score - Math.max(0, text.length - 500) / 100;
  }

  function parseNameFromShippingBlock(text) {
    const lines = relevantAddressLines(text);
    const first = lines.find((line) => !isAddressLabel(line) && !looksLikeAddressData(line));
    return clean(first);
  }

  function parseAddress(text) {
    const explicit = {
      addressLine1: firstValue([findLabelValue(/Address\s*Line\s*1/i), findLabelValue(/Address\s*1/i)]),
      addressLine2: firstValue([findLabelValue(/Address\s*Line\s*2/i), findLabelValue(/Address\s*2/i)]),
      city: findLabelValue(/City/i),
      province: firstValue([findLabelValue(/Province/i), findLabelValue(/State/i), findLabelValue(/Region/i)]),
      country: findLabelValue(/Country/i),
      postalCode: firstValue([findLabelValue(/Postal\s*Code/i), findLabelValue(/ZIP\s*Code/i), findLabelValue(/Postcode/i)])
    };

    const lines = relevantAddressLines(text);
    const parsed = parseLooseAddressLines(lines);
    return {
      addressLine1: firstValue([explicit.addressLine1, parsed.addressLine1]),
      addressLine2: firstValue([explicit.addressLine2, parsed.addressLine2]),
      city: firstValue([explicit.city, parsed.city]),
      province: firstValue([explicit.province, parsed.province]),
      country: firstValue([explicit.country, parsed.country]),
      postalCode: firstValue([explicit.postalCode, parsed.postalCode])
    };
  }

  function relevantAddressLines(text) {
    return normalizeLines(text)
      .split("\n")
      .map(clean)
      .filter(Boolean)
      .filter((line) => !/^(shipping address|ship to|recipient address|delivery address|buyer address)$/i.test(line))
      .filter((line) => !/^(copy|edit|print|refund|buy shipping|contact buyer)$/i.test(line))
      .filter((line) => !/(order date|order total|sales channel|fulfillment|payment|status)/i.test(line));
  }

  function parseLooseAddressLines(lines) {
    const result = {};
    const addressLines = lines.filter((line) => !isAddressLabel(line));
    const postalLine = addressLines.find((line) => /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/i.test(line) || /\b\d{5}(?:-\d{4})?\b/.test(line));
    const countryLine = [...addressLines].reverse().find((line) => looksLikeCountry(line));
    const streetLines = addressLines.filter((line) => {
      if (line === postalLine || line === countryLine) return false;
      if (/\+?\d[\d\s().-]{6,}\d/.test(line)) return false;
      if (looksLikeNameOnly(line)) return false;
      return true;
    });

    if (postalLine) {
      const cityParts = parseCityProvincePostal(postalLine);
      Object.assign(result, cityParts);
    }
    if (countryLine) result.country = countryLine;
    result.addressLine1 = streetLines[0] || "";
    result.addressLine2 = streetLines[1] || "";
    return result;
  }

  function parseCityProvincePostal(line) {
    const canadian = line.match(/^(.+?)[,\s]+([A-Z]{2})\s+([A-Z]\d[A-Z][ -]?\d[A-Z]\d)$/i);
    if (canadian) {
      return { city: clean(canadian[1]), province: canadian[2].toUpperCase(), postalCode: canadian[3].toUpperCase() };
    }

    const us = line.match(/^(.+?)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (us) {
      return { city: clean(us[1]), province: us[2].toUpperCase(), postalCode: us[3] };
    }

    const postal = line.match(/\b([A-Z]\d[A-Z][ -]?\d[A-Z]\d|\d{5}(?:-\d{4})?)\b/i);
    return {
      city: clean(line.replace(postal?.[0] || "", "").replace(/[,]+$/g, "")),
      province: "",
      postalCode: postal?.[1] || ""
    };
  }

  function looksLikeCountry(line) {
    return /^(canada|united states|usa|us|mexico|united kingdom|uk|australia|japan|india|singapore|france|germany|italy|spain)$/i.test(clean(line));
  }

  function looksLikeNameOnly(line) {
    return /^[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,4}$/.test(line) && !/\d/.test(line);
  }

  function looksLikeAddressData(line) {
    return /\d|street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|unit|apt|suite|city|province|state|postal|zip/i.test(line);
  }

  function isAddressLabel(line) {
    return /^(name|address|address line 1|address line 2|city|province|state|region|country|postal code|zip code|postcode|phone|contact)$/i.test(clean(line).replace(/:$/, ""));
  }

  function findLabelValue(labelPattern) {
    const fromInputs = findFormValue(labelPattern);
    if (fromInputs) return fromInputs;

    const nodes = visibleElements();
    for (const node of nodes) {
      const ownText = clean(node.childNodes.length ? [...node.childNodes].map((child) => child.nodeType === Node.TEXT_NODE ? child.textContent : "").join(" ") : node.textContent);
      if (!labelPattern.test(ownText)) continue;

      const inline = clean(ownText.replace(labelPattern, "").replace(/^[:#-]+/, ""));
      if (inline && inline.length < 120) return inline;

      const sibling = nextReadableSibling(node);
      if (sibling) return sibling;

      const parentText = normalizeLines(node.parentElement?.innerText || "");
      const value = valueAfterLabel(parentText, labelPattern);
      if (value) return value;
    }

    return valueAfterLabel(normalizeLines(document.body?.innerText || ""), labelPattern);
  }

  function findFormValue(labelPattern) {
    const labels = [...document.querySelectorAll("label")].filter((label) => labelPattern.test(clean(label.innerText || label.textContent || "")));
    for (const label of labels) {
      const control = label.control || document.getElementById(label.getAttribute("for"));
      const value = clean(control?.value || control?.getAttribute?.("value") || "");
      if (value) return value;
    }
    return "";
  }

  function nextReadableSibling(node) {
    let sibling = node.nextElementSibling;
    for (let index = 0; sibling && index < 4; index += 1) {
      const text = clean(sibling.innerText || sibling.textContent || "");
      if (text && text.length < 160) return text;
      sibling = sibling.nextElementSibling;
    }
    return "";
  }

  function valueAfterLabel(text, labelPattern) {
    const lines = text.split("\n").map(clean).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!labelPattern.test(line)) continue;
      const inline = clean(line.replace(labelPattern, "").replace(/^[:#-]+/, ""));
      if (inline) return inline;
      const next = lines[index + 1];
      if (next && next.length < 160) return next;
    }
    return "";
  }

  function matchText(text, pattern) {
    return clean(String(text || "").match(pattern)?.[1] || "");
  }

  function firstValue(values) {
    return values.map(clean).find(Boolean) || "";
  }

  function uniqueNodes(nodes) {
    return [...new Set(nodes)];
  }

  function normalizeLines(value) {
    return String(value || "")
      .replace(/\r/g, "\n")
      .split("\n")
      .map(clean)
      .filter(Boolean)
      .join("\n");
  }

  function normalizeText(value) {
    return clean(String(value || "").replace(/\r?\n/g, " "));
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
})();
