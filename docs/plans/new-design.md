# Fridge workspace redesign

Implemented on `new-design`, version 2.58.0, October 15, 2026.

## Direction

The README describes a shared household tool whose central journey is shopping,
purchased ingredients, recipe suggestions, explicit review, and saving. The chosen
design gives each task a focused workspace. A dashboard would add a tap before
shopping; a single canvas would overload a small phone screen.

The visual system uses forest and charcoal surfaces, pale lime actions, quieter
borders, clear type hierarchy, and short pointer-triggered dialog transitions.
Keyboard actions remain instant. Reduced motion and Hebrew RTL remain supported.

| Before | After |
| --- | --- |
| Top tabs within a framed board | Persistent desktop rail and phone bottom navigation |
| Shopping controls and floating actions compete with items | Focused list, optional search/sort tools, bottom add composer |
| Chef chat and ingredient-selection mode on Shop | Dedicated Cook workspace with ingredients and preferences together |
| Full recipes compete for space | Searchable recipe cards with detailed recipe dialogs |
| Stock board without targeted filtering | Search plus Everything and Running low filters |
| Floating receipt import controls | Labeled link and image import actions |
| Generic public entry | Three-stage Shop / Keep / Cook welcome journey |

Shared dialogs, sheets, buttons, status messages, and empty states follow the same
visual language. New visible text has matching English and Hebrew translations.
Existing data contracts and the explicit recipe-save boundary are preserved.

## Integration repair

Browser validation exposed raw owner emails being passed to the server grocery
command API. The list adapter now uses the same canonical household key as the
realtime database. Purchased-item changes await success before offering a stock
update; failures produce an error dialog instead of a false success path.

## Verification

- TypeScript and the production build pass. The build still reports a large
  client chunk; this redesign does not claim to resolve bundle size.
- Architecture checks pass.
- 112 tests across 24 component, cooking-session, and grocery-client suites pass.
- Six public Playwright tests pass, covering all routes, language switching,
  narrow-screen access, and reduced motion.
- All four signed-in pages checked at 1440, 390, and 320px in English and Hebrew:
  no document overflow or browser page errors.
- Local synthetic household journey passes: purchase ingredients, generate an
  offline suggestion, explicitly save, open details, reload, and see the saved
  recipe again.
- Settings, item and stock dialogs, low-stock filtering, a short 390×400 viewport,
  keyboard-triggered motion suppression, and cooking/detail focus restoration
  checked in Chromium.
- GitNexus impacts were inspected before implementation. The broad shared UI
  changes produce a critical aggregate impact classification. Its index reports
  process truncation and its change CLI abbreviates output even with a larger
  limit; these results are not a complete regression clearance. No commit made.

## Limits

Authenticated browser checks use only local Firebase emulators and synthetic
household data. Recipe generation uses the demo's curated offline generator;
live model quality and optional receipt/webhook services are not verified here.
Physical-device Safari, native keyboards, and production deployment remain outside
this local verification. This note does not replace the wider flagship readiness
checklist.

## Custom-domain preview — October 15, 2026

- URL: https://fridge-app.v2.muli-tu.com
- Vercel Preview: `dpl_AniHwGF7LG2sxbSbLhqTHwMb76iw`
  (`fridge-list-8r34dpnyy-muliteam.vercel.app`), version 2.58.0.
- Cloudflare CNAME points to Vercel's recommended target, DNS-only. Vercel issued
  the hostname's TLS certificate and attached the alias to this preview.
- Added the hostname to Firebase Authentication's authorized domains.
- Source upload is restricted by `.vercelignore` to application/build inputs;
  no local environment files, private working files, or emulator data uploaded.
- Cloud build and Vercel function packaging pass. All four public routes return
  HTTP 200 over verified TLS using the public DNS address. Local negative DNS
  caches may temporarily delay access after initial record creation.
- Original production deployment remains `dpl_Acudvrfj6sSK6R699A1dPX9ZdHND`.
- This is a Preview publication. Protected production-only server variables are
  not available here. Full server integrations require an approved deployment
  using the existing production configuration. Automatic approval review rejected
  the production deployment and a local-secret transfer attempt; neither ran.
- No commit, push, merge, or release created.

## Approved staged Production deployment — October 15, 2026

- The user explicitly approved using the existing Vercel Production configuration
  with only the new custom domain assigned to the new build.
- Deployed with `--prod --skip-domain`; no local secret values were exported or
  passed as command arguments. Demo mode and development auth bypass were disabled
  explicitly for the build.
- Ready deployment: `dpl_3EzeUhU9DYriTo2fu9GRnAcM1Ej5`
  (`fridge-list-f0d997x5y-muliteam.vercel.app`).
- `https://fridge-app.v2.muli-tu.com` now points to that deployment, superseding
  the initial Preview publication and its missing Production settings.
- Verified both existing public domains, `fridge.app.muli-tu.com` and
  `fridge-list-app.vercel.app`, still resolve in Vercel to the original deployment
  `dpl_Acudvrfj6sSK6R699A1dPX9ZdHND`.
- Normal public DNS/HTTPS access succeeds. The redesigned welcome page loads in
  the browser and switches to English. An anonymous recipe request returns HTTP
  401 as expected; authenticated AI, email, and receipt integrations have not been
  exercised against real household data.
- This is a manually assigned deployment alias, not a branch-tracked domain.
  Future production promotion can reassign project domains; preserve this domain
  deliberately when publishing subsequent versions.
- Source remains on `new-design`, without a commit, push, merge, or release.
