# Amazon Shipy Order Copier

Amazon Shipy is a Manifest V3 Chrome extension for copying shipment details from an Amazon Seller Central order details page.

## What It Copies

- Reference number or Amazon order ID
- Client name
- Address line 1
- Address line 2
- City
- Province or state
- Country
- Postal code
- Contact number

Each detected field has its own **Copy** button. The popup also includes **Copy All** for a label/value block.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/Users/daniellau/GitHub/amazon-shipy`.
5. Open or refresh an Amazon Seller Central order details page.

## Use

1. Open the Amazon Seller Central order details page.
2. Click the Amazon Shipy extension icon.
3. Click **Copy** beside the field you need.

## Notes

- The extension reads the visible Seller Central page. If Amazon changes labels or hides buyer details, a parser update may be needed.
- The extractor handles common label variants such as `Order ID`, `Reference No.`, `Ship to`, `Buyer`, `Phone`, `Postal Code`, and `ZIP Code`.
- No build step is required.

## Development

```bash
node --check popup.js
node --check content.js
```
