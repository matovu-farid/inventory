# Receipt Printer Options for Shop Sales

Comparison of hardware options for printing receipts from the inventory app at the shop counter.

## The two options

### Option A — Plain receipt printer

A dedicated thermal printer that sits on the counter. Cashiers continue to use their existing phone, tablet, or laptop to ring up sales in the web app; the app sends print data to the printer over the local network.

### Option B — Android smart POS terminal

An all-in-one handheld device with a touchscreen, optional NFC/card reader, and a built-in thermal printer (e.g. Sunmi V2 Pro, PAX A920). The terminal *is* the cashier's device — it runs the inventory app inside a small Android wrapper that bridges to the device's printer SDK.

## Side-by-side comparison

|                                 | Option A: Plain receipt printer                          | Option B: Smart POS terminal                                   |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| **What it is**                  | Just a printer — sits on the counter                     | A full Android device with a printer built in                  |
| **Has a screen?**               | No                                                       | Yes — it *is* the cashier's device                             |
| **Cashier rings up sales on**   | Existing phone, tablet, or laptop (any browser)          | The terminal itself                                            |
| **How printing works**          | Web app sends ESC/POS data over WiFi/Ethernet to printer | Terminal runs the app in a wrapper, prints to internal printer |
| **Integration effort**          | Low — point app at printer's IP                          | Higher — need a small Android wrapper app + SDK bridge         |
| **Cost per cashier**            | ~UGX 400k printer + uses existing devices                | ~UGX 1.5M–3M per terminal                                      |
| **Mobility**                    | Fixed to a counter                                       | Cashier can walk around the shop                               |
| **If it breaks**                | Replace just the printer (~400k)                         | Replace the whole unit (~2M)                                   |
| **Multiple cashiers**           | All share the same printer                               | Each cashier needs their own terminal                          |
| **Paper / consumables**         | 80mm thermal rolls (widely available in Kampala)         | 58mm thermal rolls (also widely available, narrower receipts)  |

## What features the hardware must have

### Option A — must-haves

- **ESC/POS protocol** — the de-facto standard; without it integration is painful
- **80mm paper width** — fits more per line; 58mm is workable but cramped for itemised clothing receipts
- **Network connectivity (Ethernet or WiFi)** — so any device in the shop can print. USB-only printers lock you to one machine
- **Auto-cutter** — saves the cashier ripping each receipt by hand
- **Mains-powered** with a reliable adapter

### Option A — nice-to-haves

- Cash-drawer kickout port (RJ11) — if a till is added later
- Bluetooth fallback — useful if WiFi drops
- A brand with paper rolls easy to buy locally (Epson TM-T20/T82, Xprinter XP-T80, Rongta)

### Option B — must-haves

- **Open Android** (not locked-down firmware) so a wrapper app can be sideloaded
- **Documented printer SDK** — Sunmi and PAX both publish theirs; many no-name brands don't
- **Built-in 58mm thermal printer with cutter**
- **WiFi + 4G SIM slot** — shop WiFi will drop; 4G keeps the app reachable
- **Decent battery (≥ 2000 mAh)** if cashiers walk around

### Option B — nice-to-haves

- NFC contactless reader
- Built-in barcode scanner
- MDM support for remote updates

## Recommendation for this shop

**Go with Option A (network thermal printer)** unless cashiers specifically need to take payment away from the counter. Reasons:

1. **5–10× cheaper** per cashier
2. **No native app to build or maintain** — the existing Next.js app stays untouched; a tiny print service handles ESC/POS
3. **Easier to replace** when hardware fails — printers are commodities; smart terminals are not
4. **Existing devices reusable** — staff phones/tablets/laptops become registers immediately

Option B is only worth the premium if mobile checkout on the shop floor is a real requirement.
