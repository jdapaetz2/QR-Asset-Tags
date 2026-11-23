# E2C review gallery

The four printed routes and the two marketing pages after the release, at phone width, on 2026-11-23 at 19:15 UTC.

| EXCAVATOR-017 | EXCAVATOR-3015 | TRAILER-014 | TRAILER-2041 |
|---|---|---|---|
| <img src="../../qa-artifacts/e2c-review/01-excavator-017.png" width="190" alt="EXCAVATOR-017 scan page"> | <img src="../../qa-artifacts/e2c-review/02-excavator-3015.png" width="190" alt="EXCAVATOR-3015 scan page"> | <img src="../../qa-artifacts/e2c-review/03-trailer-014.png" width="190" alt="TRAILER-014 scan page"> | <img src="../../qa-artifacts/e2c-review/04-trailer-2041.png" width="190" alt="TRAILER-2041 scan page"> |
| `demo-ex017` | `ezzs9ueg` | `demo-tr014` | `67uqc3q7` |

| getmulemark.com/demo | getmulemark.com/equipment-tags |
|---|---|
| <img src="../../qa-artifacts/e2c-review/05-marketing-demo.png" width="190" alt="Marketing demo page"> | <img src="../../qa-artifacts/e2c-review/06-marketing-equipment-tags.png" width="190" alt="Marketing equipment tags page"> |

- **How they were taken:**
  - 390 px wide, from the scan-free `/nojs/t/` copy with JavaScript off;
  - every plain `/t/` request was blocked, so no scan was recorded;
  - each scan page showed its asset code and the demo notice.
- **Capture artifact:** full-page captures show the sticky action bar mid-page; on a phone it stays at the bottom.
- **Not committed:** the images are in the gitignored `qa-artifacts/e2c-review/`. SHA-256 prefixes: `62cdf3d0` · `172b2ad4` · `f49005fd` · `c9e7eff2` · `9386c757` · `1ef8ad6e`.
- **The phone review:** the four cards and a support request are in [WORK_LOG.md](WORK_LOG.md), "Live review".
