# Workspace navigation

The organization workspace uses two separate navigation layers. At desktop widths, the persistent
left sidebar contains the product label, organization identity, authorized global sections and the
session actions. Its active entry is identified through `aria-current="page"` and a restrained
left accent.

At widths up to 980 px, the sidebar is replaced by the `Menü öffnen` control. It opens a modal
side drawer with the same authorized links and account actions. The drawer provides an explicit
close button, restores focus to its trigger, closes on Escape, closes on its backdrop, keeps Tab
focus within the drawer and closes before following a navigation link. It does not use a global
overflow suppression rule.

Event tabs remain a separate, local `Veranstaltungsbereiche` navigation directly below the event
header in the main content column. They are no longer sticky, retain their existing URLs and use a
labelled local horizontal scroll area when space is narrow.

## Verification

Playwright covers the visible desktop sidebar, active global entry, mobile drawer opening, focus,
Escape, backdrop closing, link navigation, event-tab stability, separation from the sidebar and
390-px document-width checks.

Captured on 2026-08-27:

- `pnpm.cmd test:e2e`: passed, 19/19 scenarios;
- `pnpm.cmd verify`: passed, including formatting, zero-warning lint, type checks, unit tests and
  the production build;
- the embedded Web production build: passed.
