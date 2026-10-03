# Review, verify, dedupe, report

## Contents
1. Contact sheets
2. What to look for, by device class
3. Verification ladder (harness artifact or app bug?)
4. Many agents on one audit
5. Dedupe into root causes
6. issues.json and the report
7. Confirm the top issues on a device
8. Sharing

## 1. Contact sheets
`uv run --quiet --with pillow python <SKILL>/scripts/contact_sheet.py --shots WORK/shots --devices <ids or sets> --out WORK/sheets/<flow> --only <flow>__`
One PNG per scenario and step, one column per device, grey cells where a device has no shot. Add
`--baseline <other shots folder>:Before` to compare against an earlier run or branch. `--sequence` lays out each
scenario's first screen and every step shot left to right, one row per start device, including shots after a fold or
unfold (they live in `shots/<from>__to__<to>/`). Review sheets first (patterns
across devices jump out), then open single PNGs at full size for detail; crop with PIL when text is small.

## 2. What to look for, by device class
- All: clipped or overlapping text, truncation that hides meaning, controls under system UI, sticky footers covering
  content, sheets taller than the screen with the main button cut off, inconsistent spacing between sibling cards,
  wrong money or dates, copy that contradicts itself, empty and error states that dead-end.
- Small phones (SE, 360x800 Android, any short pane): sheets with percentage height caps, CTAs inside a scroll that the
  first view does not show, calendars and pickers with tiny viewports, keyboards covering inputs.
- Large and wide (Pro Max, tablets, foldables open, landscape): phone layouts stretched edge to edge, 900pt buttons,
  timelines and grids with uneven spacing, images scaled from module-level screen sizes, content that should become two
  columns.
- Foldables: content under the cover screen's status area; controls on the crease when half open; state lost or sizes
  stale after a fold or unfold step (`{"device": ...}` steps); Split View panes (narrow side by side, very short
  stacked).
- RTL: back buttons and chevrons that do not flip, icons or chips pushed under system UI on the other side, numbers and
  Latin text inside Arabic runs, alignment of mixed columns.
- Dark mode and large text: hard-coded colors, low contrast, text that no longer fits.
Evidence boxes: list the elements in the scenario's `"boxes"` and pass `{"selector": "..."}` boxes to annotate.py
instead of measuring coordinates by eye.
Severity: high = common path for many users, or misleads about money, delivery, safety or privacy, or blocks a task;
medium = noticeable defect or common edge case; low = polish.

## 3. Verification ladder (harness artifact or app bug?)
Every finding climbs this ladder before it is reported:
1. Log check: no `api-miss` the screen depends on, no `pageErrors`/`appErrors`, no missing prop. Fix the scenario first.
   Then read the layout flags: `layout[].overflowX` and its `outermost`/`leaves` elements (page wider than the device),
   `reach` (clicks on controls users cannot reach; shots listed in `harnessOnly` show states only the harness reaches),
   `zoomCarried` (fold steps). Report an unreachable control as the finding; do not review its harness-only shots as if
   a user could see them.
2. Code check: find the code that produces it (file:line). Explain why it happens. No code path, no finding.
3. Engine check (layout claims): React Native layout is Yoga, not CSS. Confirm wrap, overflow and truncation with
   `bin/yoga_check.mjs` using the real style values. Web apps: CSS is the real engine, no check needed.
4. Native check: anything that depends on native views, OS UI, real touch, keyboard, safe-area values reported by the
   OS, or animations is NEEDS DEVICE until seen on a simulator or device.
Confidence labels: CONFIRMED (render + code), PLAUSIBLE (code only, not rendered), NEEDS DEVICE.

## 4. Many agents on one audit
- One agent per flow, each with `assets/agent-brief.md` filled in. Each writes only its own `scenarios/<flow>/`,
  `shots` names, `findings/<flow>/`. The lead owns the harness, the dev server and shared files; agents message the lead
  for harness changes instead of editing them.
- One shoot.mjs per agent at a time; keep total Chrome workers around 3 to 4 on a laptop (more makes simulators and
  dev servers crawl). Never kill node or Chrome by pattern.
- A second model's review (another agent or a different model in read-only mode) is a good filter for false positives:
  give it the findings plus the repos and ask for CONFIRMED / PARTLY / WRONG per finding with corrected file:line.

## 5. Dedupe into root causes
Readers act on fixes, not on screenshots. Group findings that share one root cause and one fix into ONE issue with a
list of affected screens (instances), even if they look different (a back button, a close icon and a chip hidden by the
same status bar are one issue: "the app ignores the right safe-area inset"). Keep separate issues when the fix differs.
Issue severity = the worst instance. Also keep:
- Not specific: real bugs found along the way that are not about the devices under test (separate list).
- Not tested: what you could not reach and why (no data, native-only, needs hardware).
- Coverage (optional): each element of an existing inventory mapped to how it was tested and the issue ids.

## 6. issues.json and the report
Schema (see `assets/issues.example.json`; optional `effect_label` for the effect column, default "User effect", and
`devices` with the profile ids used so approximate profiles are listed automatically):
```json
{ "title": "...", "subtitle": "...",
  "issues": [ { "id": "P1", "severity": "High", "title": "...", "why": "...", "fix": "...", "code": "file:line; ...",
                "instances": [ { "flow": "...", "page": "...", "element": "...", "devices": "duo-cover, duo-open-l", "lang": "EN",
                                 "severity": "High", "effect": "what the user gets", "evidence": ["findings/evidence/X.png", "https://..."], "ref": "LST-1" } ] } ],
  "not_specific": [ { "id": "X1", "severity": "Medium", "title": "...", "flow": "...", "effect": "...", "fix": "...", "evidence": [] } ],
  "not_tested": ["..."], "coverage": [ { "area": "...", "element": "...", "how": "Renders", "result": "P1" } ], "method": ["..."] }
```
`python <SKILL>/scripts/report.py WORK/findings/issues.json --out WORK/report` writes `report.html` (index, priority and
flow views, severity and language filters, thumbnails) and `issues.csv` (one row per affected screen, ready to import
into a spreadsheet). Evidence paths are made relative to the report folder, so keep the report next to the shots or
copy both together.

## 7. Confirm the top issues on a device
Renders find most layout issues; the OS adds behaviour no browser shows (touch blocked by system UI, real safe-area
values, keyboard, sheets, posture). If a simulator or emulator is available, open the app at each high issue's screen
(deep links are fastest), capture it, and update the confidence label. Note what the device showed that the render did
not (and vice versa) in the report's method notes.

## 8. Sharing
The report and screenshots may show unreleased screens: keep them local or in the user's own folders until the user
decides. Ask before uploading to shared drives, writing into shared sheets or docs, or publishing pages. When uploading
many images to Google Drive without an upload API, Chrome automation works: patch `HTMLInputElement.prototype.click` in
the Drive tab to capture the hidden file input, trigger New > File upload, then set files on the captured input in
batches under 5 MB.
