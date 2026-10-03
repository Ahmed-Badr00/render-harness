# Backend data for scenarios

A screenshot is only as true as its data. Invented JSON produces invented bugs (and hides real ones), so data comes
from the real backend whenever possible, and every hand-made field is traceable to a model or type.

## Contents
1. The source ladder
2. Dump from the backend's own tests (best)
3. Record from a test environment
4. Edit a real response (when no source can produce the state)
5. Designing the state matrix
6. Rules

## 1. The source ladder
Use the highest rung that can produce the state, and record which rung each scenario used (findings header):
1. **Backend dump**: call the real endpoint code against the backend's test fixtures (section 2). Exact shapes, real
   business logic, any state the fixtures can reach (and you can mutate rows inside your own helper test).
2. **Recording**: capture responses from a dev or staging environment with a test account (section 3).
3. **Edited dump**: start from a rung 1 or 2 response and change fields, guided by the backend response models and the
   frontend types (section 4). Mark these scenarios hand-built.
4. **Built from types and the repo's own fixtures**: when no backend is reachable and nothing can be recorded, build
   each response from the frontend's types (TypeScript interfaces, Dart or Swift models, Kotlin data classes, OpenAPI)
   and the repo's own sample payloads (`mocks/`, `__fixtures__`, Storybook stories, MSW handlers, test JSON). List the
   type and sample each file came from in its header, and mark the scenarios hand-built.
5. Never: JSON typed from imagination. If you catch yourself guessing a field name, go back to the types.

Rungs apply per endpoint, not per app. A frontend often talks to several services; map each API prefix (proxy
rewrites, gateway config, `/_svc/<service>/`) to its repo and dump from every one that is on this machine, even when the
main backend is not. A real response from one service often surfaces bugs hand-built data never would (odd glyphs,
empty titles, null sections).

## 2. Dump from the backend's own tests (best)
Find the repo that serves the endpoints (API base URL, path prefixes, OpenAPI files, gateway config, ask the user if
unclear). Then write a throwaway test next to the existing ones that uses the suite's own client and fixtures:
- Python FastAPI / Starlette: `TestClient(app)` or the suite's client fixture; Django: `self.client` / `APIClient`;
  Flask: `app.test_client()`.
- Node: `supertest(app)`; NestJS: `Test.createTestingModule` + supertest. Rails: request specs. Go: `httptest`.
Pattern:
```python
# tests/<area>/_render_dump/test_dump_orders.py   (throwaway helper, never committed)
import json, os
OUT = os.path.join(os.path.dirname(__file__), 'out')
HEADERS = {'<auth header the suite uses>': '<test customer>', 'accept-language': 'en'}   # 'ar' for Arabic data
def test_dump_out_for_delivery(client, db):              # use the suite's fixtures
    # optional: update rows to reach the state you need (fixtures reset between tests)
    r = client.get('/orders/ORDER-123', headers=HEADERS)
    assert r.status_code == 200, r.text
    os.makedirs(OUT, exist_ok=True)
    json.dump(r.json(), open(f'{OUT}/order-ofd.json', 'w'), indent=1)
```
- Find customers, orders and states in existing tests and fixtures; reuse them.
- Run it the way the repo runs tests (its docker container, test command, or CI script); read the repo's CLAUDE.md or
  README for rules such as "tests only inside the container". Several agents sharing one test database must run dumps
  one at a time.
- Error states: dump real 4xx bodies too (validation errors, "already shipped", "not allowed"). Use one test per case
  so one failing request does not lose the rest, and for frameworks that re-raise server errors in tests turn that off
  for error dumps (FastAPI/Starlette `TestClient(app, raise_server_exceptions=False)`), so a 500 is captured as a
  response instead of failing the dump.
- Copy the JSON into `scenarios/<flow>/data/` and reference it with `"file"` in the route. Delete the helper tests when
  done (or list them for the user); they are tools, not product tests. Never edit existing tests or fixtures.

## 3. Record from a test environment
When the backend is not available locally, record real traffic from a dev or staging environment with a TEST account:
- The user signs in themselves (never type real credentials). Then record with the browser's DevTools (Network, export
  HAR) or Playwright `recordHar`, and convert entries to routes (method, path, status, body).
- Scrub before saving: names, phones, emails, addresses, tokens, payment data. Replace with obvious fakes.
- Production data is off limits unless the user explicitly provides an anonymised export.
- Config-driven copy and flags (CMS, remote config, feature flag services) are data too: snapshot the current values
  the same way so the render shows today's production wording.

## 4. Edit a real response (when no source can produce the state)
Start from the closest real response, change only what the state needs, and check every field against the backend
response model (pydantic, serializers, DTOs, OpenAPI) and the frontend type the screen reads. Typical edits: a status
code value, a date, an amount, list length (1, 2, 10+ items), a missing optional field, very long text, Arabic text.
Write in the findings header which scenarios are hand-built and from which dump.

## 5. Designing the state matrix
Enumerate states from the code, not from memory:
- Frontend branches: every conditional on a status, type, flag, permission, count or optional field in the screen,
  its sections and selectors; empty, loading, error and partial-data states; feature-flag variants.
- Backend enums and status codes the endpoint can return; actions that are enabled or disabled per state.
- Edge data per screen: long titles and names, long Arabic text, big numbers (12,345.67), zero, negative, missing images,
  1 vs 2 vs 10+ items, mixed marketplaces or sellers, different countries and currencies.
- Network: slow (`delayMs` 3000 to 5000 to catch double taps and spinners), failure (`status` 400, 500), offline
  (`networkError`), and the second answer after an action (`times`).
- Locale: the main states again with Arabic (or the app's RTL language) data and `--lang`.
- Devices: every sheet, sticky footer and keyboard flow on the smallest profile and on any foldable in the matrix.
Name scenarios after the state (`ofd-with-code`, `cancel-400-already-shipped`, `list-10-items-ar`).

## 6. Rules
- Fixture and test data only. No real customer data in scenarios, screenshots, findings or uploads.
- A repo's own mocks are not automatically safe: sample files sometimes hold a real customer record or a live key.
  Scan any mock you reuse for real-looking names, phones, emails, addresses and secrets; reuse its shape, never those
  values, and tell the user about it.
- Keep product image URLs that load (real CDN URLs from fixtures); placeholder URLs that 404 can cause retry loops.
- One source of truth per state: when the backend changes, re-dump instead of patching JSON by hand.
