# Phase 1: SOPHIA Response Fixes - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix SOPHIA's response formatting and behavior for WhatsApp agents:
- Remove template number mentions (TMPL-01)
- Auto-send emails to the speaking agent's email (TMPL-03)
- Fix asterisk/formatting display issues (TMPL-04)

</domain>

<decisions>
## Implementation Decisions

### Email Auto-Detection
- Agent is always identifiable from WhatsApp sender phone number — no fallback needed
- Just send immediately, no confirmation before sending
- **Always send to the agent's own email** — ignore any other email the agent might specify
- Simple confirmation after: "✅ Sent to your email" (don't show email address)

### WhatsApp Formatting
- Convert `**bold**` (markdown double asterisks) to `*bold*` (WhatsApp native bold)
- Convert all formatting to WhatsApp-native equivalents so it renders correctly on iPhone and Samsung
- **Use formatting for clarity** — bold for emphasis, bullets for lists
- Strip code blocks (``` markers) — show content as plain text only

### Template Language
- Claude's discretion on wording when generating documents
- Key requirement: never mention template numbers like "Template 11" or "Template 12"

</decisions>

<specifics>
## Specific Ideas

- Formatting must render correctly on both iPhone and Samsung without showing raw asterisks
- No special characters that don't render as intended formatting

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-sophia-response-fixes*
*Context gathered: 2026-01-23*
