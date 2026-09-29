# PRDF - la-pizza-cubana
Inspected: 2026-09-28. Real code, README ignored. Benchmark: Collins + gauntlet.
## VERDICT: TIER 2 - SMALL BUT REAL, LIVE CLIENT SITE
LIVE 200. Static site for a real Puerto Vallarta restaurant: index (menu content, 31 menu/pizza markers), la-historia page (brand story), ray.html (owner dashboard), api/ directory + vercel.json. "Autentica" positioning.
## EVIDENCE
- Real authored pages incl. a history page and an owner dashboard surface; deployed config present.
## FINDINGS
1. MED - ray.html "Rays Dashboard" - verify it is not publicly reachable with sensitive data (no auth visible in static HTML). Fix: gate or remove from public deploy. 2. LOW - No tests/CI (static site - low risk). 3. LOW - 17 files total: thin but complete for its job. 4. INFO - Collins: mobile/a11y pass not run.
## FIX LIST
1 (30m) audit dashboard exposure; 2 (1h) mobile/a11y pass. Estimated: a morning.
## PORTFOLIO ROLE
Real client, real cuisine vertical, live now - include as proof of restaurant work after the dashboard check.
