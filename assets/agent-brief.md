# Render audit brief: flow `<FLOW>` (give one copy per agent; fill every <...>)

You are one of several agents auditing `<APP NAME>`. You own ONE flow: `<FLOW>`. You render the REAL frontend code
(commit `<COMMIT>`) in headless Chrome with backend data, click through the flow on every device profile, and review
every screenshot like a senior product designer and PM, then verify each finding in the code.

## Paths
- WORK = `<WORK>` (runner/, scenarios/, shots/, sheets/, findings/)
- APP = `<APP CHECKOUT OR EXPORT>` (read code here; never edit it)
- BE = `<BACKEND REPO>` (serves the endpoints the screens call; read models and tests here)
- Harness URL = `<http://localhost:PORT>` (already running; do not restart it. If it is down, message the lead)
- Devices = `<e.g. phones,duo>`; languages = `<en, ar>`; clock = `<--now=2026-10-01T10:00:00+04:00>`

## What you write (and nothing else)
- `WORK/scenarios/<FLOW>/*.json`, `WORK/scenarios/<FLOW>/data/*.json`
- `WORK/shots/<device>/<FLOW>__*` (via shoot.mjs), `WORK/sheets/<FLOW>/`
- `WORK/findings/<FLOW>/FINDINGS.md`, `WORK/findings/<FLOW>/evidence/*.png`
- Backend dump helpers only in `<BE dump folder>` (delete or list them at the end)

## Steps
1. Enumerate the flow's states from the code: read the screens, sections and selectors; list every branch on status
   fields, flags, empty and error responses, and edge data (long text, long names, Arabic, big amounts, 0 / 1 / 10+ items,
   missing images, partial data). Note which states the backend can actually produce today.
2. Get data per `references/backend-data.md`: real backend responses first, never invented shapes. Mark hand-built data.
3. Write scenarios (format in SKILL.md). One scenario per state; steps for the click-through (entry, each step,
   success, failure responses such as 400, 500 and offline).
4. Shoot: `cd WORK && node runner/shoot.mjs <FLOW>/* --base=<URL> --devices=<DEVICES> --out=shots <--now=...>`
   then the same with `--lang=<ar>`. Fix every `api-miss` you care about and every `errors>0` before reviewing: open
   the `.log.json` next to the PNG; a blank or broken screen is almost always a missing route or prop.
5. Contact sheets: `uv run --quiet --with pillow python <SKILL>/scripts/contact_sheet.py --shots WORK/shots --devices <DEVICES> --out WORK/sheets/<FLOW> --only <FLOW>__`
6. Review every sheet. Class A = real UI defect (clipping, overlap, truncation, controls under system UI or the fold,
   dead taps, broken RTL, layout that breaks with edge data, missing states). Class B = unclear to the customer (copy or
   numbers a normal customer would misread, conflicting statements, CTAs that do not say what happens).
7. Verify each finding before writing it (`references/review-and-report.md`, verification ladder). Harness artifacts are
   not app bugs.
8. Evidence: an annotated copy per finding via `scripts/annotate.py` (red box + short label), raw PNGs kept.
9. Write `FINDINGS.md` (format below) and finish with a message under 300 words: counts by class and severity, the top
   findings one line each with evidence path, what you could not test and why.

## FINDINGS.md format (terse, written for an AI reader)
Header: flow, commit, devices, languages, scenario list (name, state, data source: backend dump / recording / hand-built), how to re-run.
One block per finding:
```
### <PREFIX>-<n> <short title>
- class: A | B
- severity: high | medium | low   (high = common path or misleads about money, delivery or safety; medium = noticeable or common edge case; low = polish)
- devices: <which profiles show it, and which do NOT>
- screens: <png paths>  evidence: <annotated png>
- repro: <scenario + data>
- code: <file:line>
- what is wrong / why it matters to the customer / fix (one line each)
- confidence: CONFIRMED (render + code) | PLAUSIBLE (code only) | NEEDS DEVICE (could be a harness artifact)
```

## Rules
- Never edit app code or the shared harness; if the harness blocks you (missing shim, crash at import, a device you
  need), message the lead with the exact error and the change you need, then continue with other scenarios.
- One shoot.mjs at a time from your agent. Never kill node or Chrome by pattern; other agents share the machine.
- Fixture and test data only; never real customer data in scenarios, screenshots or findings.
- No em or en dashes in anything you write. Do not ask the user questions; make sensible choices and note them.
