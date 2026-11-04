# Spec: Invitee development preview

Ticket: [FR-12 / MYW-52](https://kanban.muli-tu.com/cards/rp8iqj4iqtua)

## Objective

Provide a production-parity invitee view for reviewing shared-list UX without
authenticating against or writing to live Firebase data.

## Requirements

- The preview uses synthetic browser-local data and a dedicated Vite entrypoint.
  It is not part of the normal application production build or route tree.
- Desktop uses the available workspace width with a readable two-column
  category layout. Mobile collapses to one column without horizontal scrolling.
- Active products are grouped into collapsible category sections with icons,
  colors, and counts. Purchased products are separated into a collapsed
  completed section.
- Adding an item, marking purchased, and restoring a purchased item work locally
  without Firebase or shopping-sharing API calls.
- Hebrew/English, RTL/LTR, keyboard controls, and accessible labels remain usable.

## Security and privacy

The preview must not weaken or bypass list-scoped authorization. Its deployable
artifact must not contain Firebase initialization, Firebase project URLs, or the
shopping-sharing endpoint. Any remote publication is a protected preview, not a
production route.

## Verification

- Run the focused shared-list and item-row test suites.
- Run `npx tsc --noEmit` and `npm run build`.
- Build the isolated artifact with
  `npx vite build --config vite.invitee-preview.config.ts` and assemble it with
  `node scripts/vercel-invitee-preview-build.mjs`.
- Search the built artifact for Firebase initialization/project URLs and
  `/api/shopping-sharing`; no matches are allowed.
- Exercise category creation, completed-item expansion, and console state in a
  real browser at desktop and mobile widths.

## Non-goals

- Changing production invitee authorization, persistence, or API behavior.
- Publishing the development route on the stable production application.
- Using real household or account data in the preview.
