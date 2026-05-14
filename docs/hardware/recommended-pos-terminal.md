# Recommended Smart POS Terminal — Sunmi V2s

Hardware recommendation for the cashier-facing offline POS phase. One terminal per salesperson, bound to a single shop at pairing.

## Why Sunmi V2s

| Criterion                  | Why it matters                                       | V2s status                                                      |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| **Open Android**           | Need to sideload our WebView wrapper APK             | Yes — Android with optional GMS                                 |
| **Documented printer SDK** | Required to drive the built-in thermal printer       | Yes — `com.sunmi:printerlibrary:1.0.18` Gradle library + AIDL   |
| **Built-in thermal printer + cutter** | Receipt prints without external hardware  | 58mm thermal printer, auto-cut (label-position detection)       |
| **4G + WiFi**              | Shop WiFi drops; 4G keeps Electric sync going        | 4G LTE + WiFi 2.4G & 5G                                         |
| **Battery for full shift** | Cashier shouldn't have to dock mid-day               | Detachable 3500mAh (~7000mAh equivalent at 3.85V), all-day      |
| **Rugged**                 | Retail counter abuse                                 | 1.2m drop-rated, sealed paper bin / charging port               |
| **2D barcode scanner**     | Future barcode workflow for stock-in/stock-take      | Professional 2D scan engine (1D/2D, scratched/folded codes)     |
| **NFC**                    | Optional contactless future (not needed for offline cash) | Yes, on Label & NFC variant                                 |
| **East-Africa availability** | We need to source units to Kampala                 | No local Uganda distributor found; order via Microless (UAE, ships globally) or contact Sunmi directly for an East Africa partner |

## Sunmi product lineup (avoid confusion)

There is **no product called "V2s Pro"**. The current lineup:

| Model           | Display     | Printer | OS         | Notes                                                          |
| --------------- | ----------- | ------- | ---------- | -------------------------------------------------------------- |
| **V2 Pro**      | 5.99" HD+   | 58mm    | Android 7.1| Original. Still sold; older CPU, smaller battery (2580mAh).    |
| **V2s**         | 5.5"–5.99"  | 58mm    | Android    | **Our pick.** Upgrade to V2 Pro: 2.0GHz quad-core, 3500mAh detachable battery, 2D scanner, ruggedised. |
| **V2s PLUS**    | 6.22" HD+   | 80mm    | Android 11 | Bigger screen, wider receipts, octa-core. Overkill for clothing receipts. |
| **V3**          | TBD         | TBD     | Android 13 | 2026 successor to V2s. Worth considering once available regionally. |

If V3 is in stock at a reasonable price by purchase time, prefer it. Otherwise V2s.

## Variants of the V2s to specify when ordering

V2s ships in several SKUs:
- **Standard**
- **Label & NFC** ← recommended (NFC future-proofs contactless payments)
- **Label & Scanner**
- **GMS** (includes Google Mobile Services)
- **Industry Tailored**

Recommended SKU: **V2s Label & NFC, GMS variant** — NFC included, Google services available for any future Play-Store-delivered tooling.

## Key product & documentation links

### Product pages

- [Sunmi V2s — official product page](https://www.sunmi.com/en/v2s/)
- [Sunmi V2 Pro — official product page](https://www.sunmi.com/en/v2-pro/) (older model, for reference)
- [Sunmi V2s PLUS — official product page](https://www.sunmi.com/en/v2s-plus/) (larger/80mm variant)

### Retail listings (no Uganda-local stock found; international order required)

- [Microless V2s SKU P06040076 — ships globally including East Africa](https://global.microless.com/product/sunmi-v2s-handheld-4g-pos-with-built-in-printer-5-5-hd-ips-display-cortex-a53-quad-core-cpu-1gb-ram-8gb-rom-5m-af-camera-support-1d-2d-wi-fi-bt-4g-lte-type-c-black-orange-p06040076/?currency=usd)
- [The Barcode Warehouse (UK) — Sunmi V2s P06060002](https://www.thebarcodewarehouse.co.uk/shop/sunmi/mobile-products/sunmi-p06060002/)
- [Logiscenter (EU) — V2 Pro listing](https://www.logiscenter.eu/sunmi-v2-pro-weareables)

### Developer documentation (what we'll need to build the printer adapter)

- [Sunmi Developer Docs — root](https://docs.sunmi.com/en/)
- [V2 Pro developer page](https://docs.sunmi.com/en/documentation/mobile-products/v2-pro/) (V2s shares most APIs)
- [Printing Service docs (Bluetooth / AIDL / JS bridge modes)](https://docs.sunmi.com/en/general-function-modules/printing-service/)
- [Official `SunmiPrinterDemo` reference app (GitHub)](https://github.com/shangmisunmi/SunmiPrinterDemo)
- [Community wrapper SDK — AhmedElsayed94/SunmiPrinterSdk](https://github.com/AhmedElsayed94/SunmiPrinterSdk)
- [Community library — FelOrtiz/SunmiV2-Android-Library](https://github.com/FelOrtiz/SunmiV2-Android-Library)
- [Tutorial — "Android App Development with Sunmi V2(POS) Device" (Medium)](https://medium.com/@shakibaenur/android-app-development-with-sunmi-v2-pos-device-9b129c09577d)

### Gradle dependency for the wrapper APK

```gradle
implementation 'com.sunmi:printerlibrary:1.0.18'
```

Connection modes available: **AIDL** (lowest-level, most control), **Bluetooth (`InnerPrinter`)**, and **JS bridge** (also exposed natively to WebViews). Recommend AIDL/library mode in the Kotlin wrapper — gives us full control over the print pipeline. The web app talks to Kotlin via our own JS interface, not Sunmi's JS bridge directly.

### Sunmi printer protocol notes

- Compatible with **ESC/POS** instructions, with minor Sunmi-specific extensions
- 58mm paper width, max printable width 384px for images
- Built-in buffer (apps don't need to throttle)
- Same SDK works across V1, V1s, V2 Pro, V2s — useful if the client later mixes models

## Procurement checklist

When the client is ready to buy:

- [ ] Confirm SKU: **V2s, Label & NFC, GMS variant**
- [ ] Confirm quantity (one per salesperson, plus 1 spare per shop)
- [ ] Confirm region/charger plug (Uganda uses Type-G; ship with EU-to-G adapter if needed)
- [ ] Get a 4G SIM per device (MTN or Airtel data-only plan)
- [ ] Order spare 58mm paper rolls (locally sourceable in Kampala once units land)
- [ ] Order spare batteries (detachable; one spare per shop is cheap insurance)

## Open question

Sunmi has no listed distributor in Uganda. Before ordering:
1. Contact `business@sunmi.com` to ask if there's a Nairobi / Kampala authorised partner — warranty service is much easier with a regional reseller.
2. If none, default to Microless (UAE) shipping to Entebbe.
