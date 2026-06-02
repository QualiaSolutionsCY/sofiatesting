# Sophia Invoice Access Policy

## Current MVP Boundary

The invoice dashboard currently uses access codes for Marios, Charalambous, and one
operations colleague. This is an MVP control, not final production auth.

## Roles

- Marios: `owner`
- Charalambous: `finance`
- Colleague: `operations`

## Supabase Boundary

All public invoice tables must have RLS enabled. During this MVP milestone,
database writes should run through server-side code using the Supabase service role.
The browser must not write directly to invoice tables with the anonymous key.

The migration creates `invoice_access_users` with role labels and seed-safe code
labels. Real code hashes must be generated server-side before production.

## Before Production

- Replace access-code-only entry with production auth or a hardened server session.
- Hash access codes outside source control.
- Keep the service role key server-only.
- Revisit RLS policies once Supabase Auth identities are available.
- Add audit logging for access-code attempts if the MVP access path remains active.
