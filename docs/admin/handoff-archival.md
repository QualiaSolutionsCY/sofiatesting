# Legacy `sophiainvoice` decommission — archival verification

This doc records the verifiable archival status of the legacy standalone
invoicing app. The invoicing feature now lives **embedded** inside this repo at
`/admin/invoices` (see `handoff-walkthrough.md`); the old standalone
`sophiainvoice` deployment and repository have been decommissioned.

## Repo archival status (LIVE evidence)

Captured this phase via:

```bash
gh repo view QualiaSolutionsCY/sophiainvoice --json isArchived,url,name
```

Output:

```json
{"isArchived":true,"name":"sophiainvoice","url":"https://github.com/QualiaSolutionsCY/sophiainvoice"}
```

- **Repo URL:** https://github.com/QualiaSolutionsCY/sophiainvoice
- **`isArchived`:** `true`

## Vercel project

The standalone `sophiainvoice` Vercel project was **deleted** when the app was
embedded into this repo (`.continue-here.md:6` — "The standalone `sophiainvoice`
Vercel project is **deleted** and its GitHub repo is **archived**.").

## Remediation (only if un-archived)

If a future check ever finds the repo un-archived (i.e. `isArchived: false`),
the owner re-archives it with:

```bash
gh repo archive QualiaSolutionsCY/sophiainvoice --yes
```

## Confirmed state

As of this phase, the legacy `sophiainvoice` repo is confirmed
**`isArchived: true`** (verified live via `gh repo view`, output recorded
above) and the standalone Vercel project is **deleted**. This is the recorded
evidence trail for the roadmap archival criterion.

---

ERP / milestone closure is handled by `/qualia-milestone` at milestone close.
