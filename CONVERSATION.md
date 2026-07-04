# CONVERSATION.md — Household Stock Module

Design discussion for the new **inventory/stock tracking** feature, added as a module
inside the existing fridge-list-app (the live, voice-driven family shopping list).

Participants:

- **Yael Cohen** — Fullstack Engineer
- **Noa Ben-David** — Product Manager
- **Roi Katz** — QA Engineer
- **Muli** — End User (household admin, the one who set up Siri + the tablet)
- **Dana** — End User (Muli's partner, does most of the physical grocery shopping)
- **Tom** — End User (teenager, home most afternoons, mobile-only)

---

**Noa Ben-David (PM):** Kicking this off. The ask is: "show a list of products needed in
the house." Today the app already does that, sort of — the shopping list. But that list
only exists *after* someone notices something is missing and tells Siri. What we don't
have is visibility into what's actually **on hand**, so nobody can tell "we're almost
out of X" until it's already gone. Muli, Dana, Tom — what's actually annoying you today?

**Dana (End User):** I'm standing in the supermarket and I genuinely don't remember if
we're out of olive oil or if there's a full bottle at home. Right now I either call
Muli or just buy it and we end up with three bottles. I want to glance at my phone and
see quantities, not just a yes/no checklist.

**Tom (End User):** For me it's snacks and milk, ha. I open the fridge, see there's like
one glass of milk left, but by the time anyone thinks to tell Siri it's already gone the
next morning. I want the "almost out" stuff to jump out at me without me having to add
it manually every time.

**Muli (End User):** Agreed, and I don't want two systems that disagree. If the tablet
on the fridge says "milk" is fine but the phone app says we're low, that's worse than
having nothing. Whatever we build needs to update live, same as the shopping list does
now. Also — I don't want to have to log in on my phone every time I just want to bump a
number down after unpacking groceries. That's the whole reason the shopping list itself
lets anyone check things off... wait, no, actually checking things off already requires
login. Hm, so I guess that's already the precedent.

**Noa (PM):** Right, checking off items already requires sign-in today, restricted to
your Google account via `ADMIN_EMAILS`. So there's already a friction tradeoff baked
into this app: viewing is open to everyone, editing is admin-only. I'd say we keep that
consistent rather than inventing a new rule just for stock — familiarity matters more
than optimizing this one flow. If it turns out to be annoying in practice, that's a fast
follow (add Dana's or Tom's email to the admin list), not a reason to redesign auth now.

**Yael Cohen (Engineer):** Agreed, consistency wins — I don't want two different auth
models in one app. Here's what I'm proposing technically:

- New Firebase Realtime Database path, `/stock/{pushId}`, sibling to `/groceries`:
  ```
  {
    name, category, quantity, unit, low_threshold,
    updated_at, updated_by
  }
  ```
- Reuse the existing 17 categories (same triple-duplication debt as today — not solving
  that here, just not making it worse).
- A new tab in the app: "רשימת קניות" (existing shopping list) and "מלאי" (Stock), so we
  don't have to cram two different mental models into one screen.
- Stock items get **+/- stepper buttons** for quantity, not free-text — much faster to
  tap on a phone while literally holding the item you just unpacked.
- When `quantity <= low_threshold`, the item gets a visual "low stock" highlight (same
  chalkboard aesthetic — accent border/badge, not a jarring red popup).
- I'm deliberately **not** auto-adding low-stock items to the shopping list. Reason: the
  n8n workflow already has dedup/reactivation logic keyed on exact item name — if the
  stock module and Siri both write to `/groceries` for the same conceptual item with
  slightly different casing or wording, we get silent duplicates. Safer MVP: a manual
  "add to shopping list" button per low-stock item. One tap, still fast, no ambiguity
  about who added what.
- Same live-sync approach as today: `onValue` listener, no polling.

**Roi Katz (QA):** A few things I want nailed down before I sign off on this scope:

1. **Threshold boundary** — is "low stock" `quantity <= threshold` or `< threshold`?
   Yael said `<=` above — I want that written down so nobody "fixes" it into an
   off-by-one later. Confirmed: `<=`.
2. **Negative quantities** — what happens if someone taps "-" on an item already at 0?
   Needs to clamp at 0, not go negative. Yael, please confirm that in the stepper
   handler, not just visually.
3. **Concurrent edits** — two people (Dana and Tom) tap "-" on milk at the same second
   on two different phones. Given this is Firebase `update()` with a plain numeric
   write (not a transaction), last-write-wins is the realistic outcome, same tradeoff
   the shopping list already accepts for `bought`. I'm fine calling this an accepted
   known gap for a 2-4 person household, not a blocker — but let's write it down so it's
   a decision, not an oversight.
4. **Empty/zero state** — what does the Stock tab look like with no items yet seeded?
   Should not look broken — needs its own empty-state message, same pattern as
   `all-empty` on the shopping list.
5. **Mobile-first** — Tom is mobile-only. The steppers need a large enough tap target
   (this app already bumped checkboxes to 24px on mobile — steppers should follow the
   same breakpoint, not be an afterthought at 640px+ only).
6. **RTL correctness** — quantity number + unit + name, all Hebrew context, need to
   check nothing visually reverses oddly (e.g. "2 ק"ג" vs "ק"ג 2").
7. Not testing today, explicitly out of scope: offline queueing beyond whatever the
   Firebase SDK does by default, and multi-person attribution of *who* changed a
   quantity beyond the existing `modified_by`-style stamp (same known gap already
   documented for Siri-added items in CLAUDE.md).

**Yael (Engineer):** All fair. Threshold is `<=`. I'll clamp quantity at 0 in the
handler itself (not just disable the button — belt and suspenders since two taps could
race). Empty state and mobile breakpoints will mirror the existing shopping-list
patterns exactly, since that's already proven to work on the tablet + phone both. RTL —
I'll keep number and unit in the same flex row the existing item rows already use, that
pattern already handles Hebrew correctly today.

**Noa (PM):** One more scope call: do we let people add *arbitrary* new stock items
in-app, or only track items that already exist? Muli/Dana — thoughts?

**Muli (End User):** We need to add new ones. Half of what we'd want to track (paper
towels, dish soap) never shows up via Siri anyway.

**Dana (End User):** Agreed — and let me set the "low" threshold myself per item, since
"low" means something different for milk (we drink it fast) versus, like, trash bags
(we buy a huge pack once a season).

**Noa (PM):** Good, that settles it. Scope for this iteration:

- ✅ New `/stock` data + Stock tab, grouped by category like the shopping list
- ✅ Quantity steppers (+/-), clamped at 0
- ✅ Per-item custom low-stock threshold, set at creation, editable later
- ✅ Visual low-stock highlight, `quantity <= threshold`
- ✅ Manual "add to shopping list" action from a low-stock item (not automatic)
- ✅ Same auth model as today: open read, admin-only write via `ADMIN_EMAILS`
- ✅ Add/delete stock items (admin-only)
- ❌ Not in scope: auto-push to shopping list, quantity edit transactions/conflict
  resolution beyond last-write-wins, per-person attribution beyond `modified_by`,
  resolving the 17-category triple-duplication debt, offline-specific handling beyond
  Firebase SDK defaults

**Roi (QA):** Good with that scope — I'll verify all seven points above once it's
built, plus a quick pass on the existing shopping list to make sure the new tab didn't
regress it (nothing here should touch `/groceries` reads/writes except the new
"add to shopping list" action).

**Tom (End User):** Cool, can't wait to see milk turn red before we run out for once.

**Muli (End User):** Let's build it.

---

## Post-build check-in

**Yael (Engineer):** Build's done — `/stock` data layer, the "מלאי" tab, steppers,
per-item thresholds, low-stock highlight, manual "add to shopping list," add/delete,
all admin-gated the same way the shopping list already is. Shared the category list
out to `categories.js` instead of duplicating it a second time.

**Roi (QA):** Ran through what I could headlessly: app loads clean, no console/build
errors, existing shopping list still renders live data untouched, tab switch works,
empty-state on Stock renders correctly, layout holds on a 375px mobile viewport. Two
things I could *not* verify from here and want flagged, not quietly assumed fine:
1. The `/stock` Firebase rule hasn't been added in the Console yet — writes will
   permission-deny until that's done.
2. Steppers / add-item / delete / "add to shopping list" all require Google sign-in,
   which needs a real popup — blocked in this automated browser, so the actual
   admin-write path needs a manual pass on a phone or the tablet.

**Noa (PM):** Good enough to call this iteration done, pending that manual pass. Before
we close it out — checking with the actual person we're building this for, since none
of us here get final say over scope.

**Noa (PM), to Muli (the real user):** Everything from our agreed scope is in. Is there
anything else you'd like changed or added before we call this iteration closed —
different fields, a different flow, something we missed, or is this good as-is?

**Muli (the real user):** Surprise me — what am I missing that I haven't thought of?

**Noa (PM):** Fair, let's actually look for the gap instead of just declaring victory.

**Dana (End User):** Here's one that bugs me rereading our own transcript: I said I
want to glance at my phone and know if we're out of olive oil. But nothing in this
design ever *restocks* the number. If I buy milk, unpack it, and check "milk" off the
shopping list — the stock quantity for milk doesn't move. I still have to separately
remember to go to the Stock tab and tap "+". Two actions for one real-world event.
Within a week the stock numbers will just be wrong and nobody will trust them, which
defeats the entire point.

**Yael (Engineer):** That's a real gap, not a nice-to-have. Technically cheap to close,
too: `setBought(key, true)` already fires on checkout — that's the exact moment we know
an item was bought. We could match the shopping-list item's name against a stock item
by name and offer to bump its quantity right there (a small inline prompt in
`ItemDetailModal`/the checkbox flow — "add 1 to מלאי?" — not silent/automatic, since
name-matching is fuzzy and quantities vary per purchase; same "manual confirm" instinct
we used for the reverse direction).

**Roi (QA):** Agreed that's the one worth flagging over the smaller stuff (e.g. a
low-stock badge on the tab button itself, which is also missing but cosmetic by
comparison). Matching by exact name has the same known limitation as the shopping
list's own dedup — "עגבניות" vs "עגבניה" won't match — but that's already an accepted,
documented gap elsewhere, not new debt.

**Noa (PM):** Agreed, that's the gap worth naming: **buying something never restocks
it — the two lists don't talk to each other in the direction that matters most for
trusting the numbers.** Bringing it back to Muli before anyone touches code.

**Muli (the real user):** Yes, build it.

**Yael (Engineer):** Implementing: checking an item off the shopping list (bought:
false → true only, not the un-check/reactivate direction) does a one-off lookup against
`/stock` for a name match (same trim/lowercase normalization as the existing exact-match
dedup — still won't catch "עגבניות" vs "עגבניה", that's the same pre-existing known
gap, not new debt). If found, a small confirm prompt appears — "add N to stock?",
defaulting to 1, editable — and only updates `/stock` on explicit confirm. Skipping just
dismisses it; nothing changes silently in either direction.

---

## Session 2 — PM + end-user feedback round

No engineer or QA this round — Noa checking in with the actual household after the
restock-on-checkout link shipped, before deciding if there's another build cycle.

**Noa (PM):** Round two. The restock prompt is live — checking something off the
shopping list now offers to add it back to the stock count. Muli, Dana, Tom — anything
feel off, missing, or annoying now that it's real instead of a plan on paper?

**Muli (End User):** Mostly good. One thing I hit immediately though: I added "חלב"
(milk) to the stock list with a threshold of 1 liter. Turns out we actually go through
it fast enough that I want the threshold at 2, not 1 — but there's no way to change it.
I'd have to delete the item and re-add it from scratch, which also resets the current
quantity to whatever I re-enter. That's clunky for something I'll want to tune more
than once.

**Noa (PM):** Hold on — that's actually a documented miss on our side, not a new ask.
Back in session one I wrote down "per-item custom low-stock threshold, set at creation,
**editable later**" as agreed scope. Editing was never actually built — only create and
delete exist today. That's on us, not a new feature request.

**Dana (End User):** Same complaint from a different angle — I misjudged the unit for
paper towels (typed "יח'" when I meant "גליל," rolls). Small typo, but again: no fix
without delete-and-redo, and delete-and-redo loses whatever quantity was tracked.

**Tom (End User):** No complaints from me, haven't touched the add flow — I just look at
what's red. Though ngl a little counter badge on the "מלאי" tab itself, so I know
something's low before I even tap into it, would be nice. Roi mentioned that one already
I think?

**Noa (PM):** Right, Roi flagged the tab badge as cosmetic-but-missing last time — noted,
lower priority. The threshold/unit edit gap is the real one: we promised it, didn't
build it, and two of three end users hit it in the first real use. Proposing we close
that gap next: let admins edit an existing stock item's name/category/quantity/unit/
threshold in place, not just delete-and-recreate.

**Noa (PM), to Muli (the real user):** Want me to bring this back to Yael to scope and
build — an edit action on each stock item, reusing the same add-item form fields
pre-filled with current values? Or is this good to sit as a known gap for now?

**Muli (the real user):** Build it. And separately — I noticed we stamp `updated_by`
on every stock write already, but nothing in the UI ever shows it. I want to actually
see who added or last changed each item, visible under the item itself, not buried.

**Noa (PM):** Two related asks, bundling them since Muli wants both done together:
1. Edit an existing stock item in place (name/category/quantity/unit/threshold) instead
   of delete-and-recreate.
2. Surface `updated_by`/`updated_at` as a small caption under each stock item's name —
   always visible, not hidden behind a tap.

**Yael (Engineer):** Makes sense to do these together — the edit modal is the natural
place to also show that metadata (mirrors how `ItemDetailModal` already shows
created/modified info for groceries). Plan:
- Generalize `AddStockItemModal` into `StockItemModal`, taking an optional `item` prop:
  present → edit mode (pre-filled fields, "שמירה"), absent → add mode (unchanged).
- New `updateStockItem(key, fields, user)` in `firebase.js`, reusing the existing
  internal `touchStock` helper (already stamps `updated_at`/`updated_by` on every
  write — same one `adjustStockQuantity` uses).
- Add a small dimmed caption line under each stock item's name in `StockView.jsx`:
  "עודכן: `<date>` · `<email>`" — same phrasing `ItemDetailModal` already uses for
  groceries, for consistency. Extracting the existing `formatDateTime` helper out of
  `ItemDetailModal.jsx` into a shared util so both places use one implementation
  instead of duplicating it.
- Add a small ✎ edit button per stock item, admin-gated same as delete.

---

## Session 3 — custom/temporary lists + collapsible sections

Full team back for this one — unlike the last two rounds, this touches the core data
model and a site-wide UI change, not a small fix.

**Noa (PM):** Two asks from Muli this round:
1. A way to spin up a custom, temporary list — e.g. "מסיבה" (party) — separate from the
   permanent household list, for one-off events.
2. Collapsible category sections, everywhere — both the shopping list and stock tabs,
   not just the new custom-list view.

**Yael (Engineer):** For the custom list, there are two real shapes this could take:
- **Tag-based (recommended):** add an optional `list_name` field to `/groceries` items,
  `null`/absent meaning the permanent list. A small picker lets you switch which list
  you're viewing/adding to, plus a "מחיקת רשימה" action that bulk-clears everything
  tagged with that name once the party's over. Everything else — categories, checkboxes,
  live sync, n8n — stays untouched. Siri-added items have no concept of "current list,"
  so they always land on the permanent one; that's a real limitation, not a bug, since
  the Shortcut only ever sends `{ text }`.
- **Fully separate lists:** each list gets its own items/categories/checkout state,
  more general (independent concurrent lists long-term) but a much bigger structural
  change — new collection shape, a list-switcher instead of a tab, n8n would need to know
  which list Siri writes to. Bigger bet for a "maybe, for a party" ask.

**Roi (QA):** Voting tag-based too — smaller blast radius, and if it turns out nobody
actually uses custom lists after the first party, we haven't built a second parallel
data model for nothing. Concerns either way: deleting a list is destructive (bulk
removes every item tagged with it) — needs a confirm dialog same as single-item delete,
maybe stronger since it's multiple items at once, not one.

**Muli (End User):** Tag-based is fine, I don't need multiple lists running forever in
parallel — just something for the occasional event that's easy to clean up after.

**Noa (PM):** Agreed, tag-based it is. Now the collapsible sections ask.

**Yael (Engineer):** Technically simple: click a category header to toggle
collapsed/expanded, store the collapsed set in `localStorage` (client-only UI
preference, not household data — doesn't belong in Firebase, doesn't need to sync
across devices). Default: everything expanded, so the tablet's glanceable "walk by and
see the whole list" use case doesn't regress on day one.

**Dana (End User):** Please don't collapse-by-default on my phone either — I'd rather
manually collapse the two or three categories I never buy (pet food, we don't have a
pet) than have everything start hidden and tap through six sections to find milk.

**Tom (End User):** Yeah default-expanded is right, collapsing is just for decluttering
categories I don't care about, not a "clean slate every load" thing.

**Roi (QA):** Two things to verify once built: collapsed state shouldn't reset on every
Firebase snapshot update (the whole `grouped` state re-renders on every change — collapse
state needs to live outside that, keyed by category, not wiped alongside it). And the
"new item arrived" toast/highlight animation must still fire even if that category is
currently collapsed — otherwise an item could get silently added to a hidden section.

**Noa (PM):** Locking scope:
- ✅ `list_name` tag on `/groceries` items (`null` = permanent list)
- ✅ List picker to switch/create/view a custom list, add items to whichever is active
- ✅ Bulk "delete this list" action with confirmation
- ❌ Siri/n8n stays pointed at the permanent list only — known limitation, not solved here
- ✅ Collapsible category headers, both tabs, `localStorage`-backed, default expanded
- ✅ Toast/fresh-item highlight still fires regardless of collapsed state

**Noa (PM), to Muli (the real user):** Confirming before Yael starts: tag-based custom
lists (not fully separate lists), and collapse state stored locally per-device (not
synced via Firebase, so collapsing a category on the tablet won't affect your phone).
Good to proceed on that basis?

**Muli (the real user):** Deferred to Yael's call on the list model — go with
tag-based. Confirmed on local per-device collapse state too.

**Yael (Engineer):** Building both:
- `list_name` on `/groceries` items (`null`/absent = permanent list). A pill-style list
  picker appears only on the shopping-list tab (stock is untouched): "הרשימה הקבועה"
  plus one pill per distinct `list_name` in use, plus "+ רשימה חדשה" to create one
  (prompts for a name, no Firebase write until the first item is added to it). Switching
  lists filters which items are visible/grouped by category, same as today just scoped
  to the active list. A small "+" add-item button appears only while viewing a *custom*
  list (the permanent list stays Siri/voice-only, unchanged) — since nothing else can
  populate a custom list. Deleting a custom list bulk-removes every item tagged with it
  in one atomic multi-path Firebase update, behind a confirm dialog that states the
  item count, since it's destructive across multiple items at once.
- Collapsible category headers: one shared hook (`useCollapsedSections`), one
  `localStorage` key, used by both the shopping-list and stock panels — collapsing a
  category collapses it by name on both tabs on that device, nothing synced to Firebase.
  Default expanded. Lives entirely outside the live-data state, so it can't get wiped by
  a Firebase snapshot update, and the new-item toast/highlight logic is unaffected by
  collapse state since it never depended on what's rendered.

---

## Session 4 — receipt scanning & cost tracking

Two new faces this round:

- **Roni Adler** — Senior PM, joining Noa
- **Idan** — End user, previously worked on a commercial grocery app (AnyList-style);
  came in with a large knowledge dump of features from popular grocery apps and a
  3-phase "AI-first" roadmap pitch centered on AI product-matching + automated
  supermarket-cart-filling.

**Roni (Senior PM):** Ran a brainstorm on Idan's list against this app's actual shape —
a real 1-2 person household, not a commercial product. Conclusion: most of the AI-heavy
differentiators (product-matching against a retailer catalog, auto-filling a real
supermarket's cart, predictive "you'll need milk tomorrow" suggestions, price
comparison across stores) don't fit here — there's no retailer integration, no catalog,
and no team to maintain one. Muli agreed to drop that whole branch. What's left on the
table, scoped down: **receipt scanning for cost tracking, plus seeing how prices
change from one shopping trip to the next.**

**Muli (the real user):** Right — I don't need the app to shop for me. I do want to
know what we're actually spending, and whether olive oil quietly went from ₪18 to ₪24
without me noticing.

**Idan (End User):** From building this before: receipt OCR is never clean. Real
receipts have abbreviated product names, store-specific formatting, sometimes bad
photos. Whatever parses it *will* get some lines wrong — the apps that handled this
well always had a quick human review/edit step right after the scan, before anything
was saved as truth. Skipping that step is the single most common mistake I saw.

**Yael (Engineer):** Good to know going in. Technical shape, keeping this bounded and
reusing what already exists rather than opening the "AI" door back up:
- New n8n workflow (sibling to the existing Siri one), reusing the already-configured
  Gemini credential server-side — same reasoning as the Siri flow: never put an API key
  in client-side code. Web app uploads the receipt photo, n8n calls Gemini (vision) to
  extract `{ items: [{ name, price, quantity }], total, store_name }`, returns it to the
  web app as one JSON response.
- This is a single, bounded, one-shot extraction call — not the open-ended "AI learns
  your patterns" system Idan's Phase 2/3 pitch described. Scope stays: point camera at
  a receipt, get structured data back, review it, save it. Nothing autonomous.
- Per Idan's warning: the extracted result opens in a review/edit screen before it's
  written to Firebase — every line editable, nothing saved silently. New
  `/receipts/{pushId}` = `{ image_url, store_name, items: [{name, price, quantity}],
  total, scanned_at, scanned_by }`.
- "Diff from one to another": for a given item name, look across past receipts and show
  its price history — same exact-name matching limitation already accepted for stock
  (`findStockItemByName`) and Siri dedup, not solved differently here. If "עגבניות"
  is spelled two ways across two receipts, they won't link up — known, not new debt.

**Roi (QA):** Concerns:
1. Camera/photo quality varies a lot in real use (lighting, receipt fold, faded thermal
   paper) — the review step Idan flagged isn't optional, it's the main defense against
   garbage data silently entering `/receipts`.
2. Gemini vision calls cost money and have latency — need a clear loading/error state,
   and a retry-or-manual-entry fallback if extraction fails outright (empty/garbled
   response), not a silent dead end.
3. Price-diff view needs to handle an item appearing on a receipt for the first time
   (no prior price to diff against) without treating that as an error.

**Dana (End User):** This is the one I actually want. I'm the one standing at checkout
— being able to snap the receipt on the way out and not think about it again, then see
spending later, is the win for me.

**Tom (End User):** Not my problem, I don't pay for groceries, ha — but the "olive oil
got more expensive" alert sounds like something Dana and Muli would actually use
weekly, more than most of what's in this app already.

**Roni (Senior PM):** Agreed that's the highest-leverage single addition from Idan's
whole list — bounded scope, reuses the existing Gemini/n8n pattern instead of adding a
new AI surface, and solves a problem Muli and Dana both named unprompted. Proposing
this as the actual v1, explicitly *not* the rest of Idan's roadmap:
- ✅ Photo → n8n → Gemini vision extraction → review/edit screen → save to `/receipts`
- ✅ Per-item price history / diff view (exact-name matching, same known limitation as
  elsewhere)
- ✅ Running spend total, viewable per receipt and/or over time
- ❌ Not in this round: AI product matching, auto-cart-fill, store price comparison,
  predictive suggestions, meal planning, pantry-aware recipe suggestions — Idan's
  Phase 2/3, parked, not rejected forever, just not this app's shape today

**Roni (Senior PM), to Muli (the real user):** Before this goes to Yael to actually
scope the n8n side and the new Firebase model — good to build receipt scanning + price
tracking as described, with everything else from Idan's list parked?

**Muli (the real user):** Yes — and separately, a batch of smaller asks: icons
everywhere (it's just nicer to look at), a way to invite another editor without me
hand-editing `firebase.js`, real category management (add/edit/delete, keep an "אחר"
catch-all), and a way to text/email someone "here's what's missing." Also want more
ideas, then a security pass, then get this live on GitHub + Vercel with a real domain.

**Roni (Senior PM):** Bundling the small stuff into one round since none of it changes
the data model in a risky way — except categories, which actually *closes* a
long-standing gap (`CLAUDE.md`'s Known Gap #1: categories were always hardcoded three
places, `/categories` in Firebase was seeded once and never actually read).

**Yael (Engineer):** Scoping each:
- **Categories**: move the source of truth to `/categories` in Firebase — each entry
  now `{ name, color, icon, protected }`. Defensive one-time seed (`seedCategoriesIfEmpty`)
  only writes if the path is empty, so it can't clobber real edits later. `"אחר"` gets
  `protected: true` — its name can't be changed and it can't be deleted, since the
  fallback logic across the app (`categoryMap.has(entry.category) ? ... : 'אחר'`)
  hardcodes that exact string. Deleting any *other* category doesn't need a migration
  step — items still tagged with a since-deleted category name already fall back to
  "אחר" automatically, that fallback already existed. **Not solved by this**: n8n's
  Siri workflow still hardcodes its own copy of the 17 categories (in the Gemini prompt
  and the `VALID_CATEGORIES` array) — rewiring n8n to read `/categories` dynamically is
  a real, separate, riskier change to the live Siri flow and wasn't asked for this
  round. Known Gap #1 narrows to just that piece now.
- **Editor invites**: new `/admins` path, open write like everything else in this app
  — same conscious tradeoff already made for `/groceries`/`/stock`/`/categories`. Flagging
  for the security pass: unlike those paths, this one controls *who can edit*, so an
  open-write list of admin emails is a real privilege-escalation surface once the repo
  and the Firebase config are both public — anyone who finds the `/admins` path could
  add an email they control and sign in as an editor. Proposing `".write": "auth != null"`
  on that path specifically (any signed-in Google account can propose themselves, but at
  least it's not fully anonymous) as a middle ground, not a full fix.
- **Icons**: emoji `icon` field per category (rendered instead of the old color dot),
  plus icons on the three tab labels.
- **Share what's missing**: no new backend — `navigator.share()` (real share sheet:
  Messages, WhatsApp, Mail, whatever's installed) with a `mailto:` fallback on desktop.
  Compiles the unbought items in the currently active list into plain text. No SMS/email
  sending service, no cost, no new secrets to manage.

**Roi (QA):** One correctness note from implementation, not scope: the stock and
shopping-list views used to group items by category inside the Firebase `onValue`
callback itself. Once categories become live data too, that callback would've captured
a stale, possibly-still-empty category list from the very first render and never
updated — grouping logic needed to move to render-time (computed fresh from current
state on every render) instead of being computed once inside the data-listener
closure. Fixed before it shipped, not after.

**Roni (Senior PM):** Locking scope for this round — categories CRUD (with the n8n
side explicitly still a known gap), editor invites (with the security tradeoff flagged
above for the review pass), icons, and share-what's-missing. Ideas for later, not this
round, from a quick brainstorm: expiration-date reminders per stock item, a weekly
digest of what's low, PWA install prompt (already a known gap), a printable view of the
current list, "favorite items" for one-tap re-add, and a monthly spend total pulled
from `/receipts`. None of these are scoped or agreed — just flagged for a future round.

**Muli (the real user):** Good, ship it — then straight into the security check before
anything goes public.

**Roi (QA), security pass:** Three findings, ranked:
1. Both n8n webhooks are unauthenticated and their URLs are committed in
   `CLAUDE.md`/`firebase.js`. Once public, anyone can spam the real shopping list or
   run up Gemini API usage on this credential.
2. Firebase rules are wide open on every path (`/groceries`, `/categories`, soon
   `/stock`/`/receipts`/`/admins`) — already a known, conscious tradeoff, but a public
   repo removes the "nobody would think to look" layer that's been doing some of the
   work until now.
3. `ADMIN_EMAILS` has a real personal Gmail address that would become publicly visible.

**Muli (the real user):** Keep the GitHub repo private for now — solves #1's doc
exposure and #3. Tighten `/admins` to `auth != null` regardless.

**Yael (Engineer):** One catch worth surfacing before anyone assumes this is fully
solved: a private repo protects the **Siri webhook URL** (only ever referenced in
docs, never shipped to a browser) but *not* the **receipt-scan webhook URL** — that one
is called directly from client code (`RECEIPT_SCAN_URL` in `firebase.js`), so it ships
inside the JS bundle to every visitor of the live site once deployed. Repo visibility
doesn't touch that; only a server-side proxy (hiding the n8n call behind, say, a small
Vercel serverless function) would.

**Muli (the real user):** Don't deploy publicly yet, then — hold off on Vercel until
that has a real fix.

**Roni (Senior PM):** Noted as the next real next-step, not done this round: a thin
serverless proxy for the receipt-scan call, so the n8n URL never reaches the client.
GitHub push (private) still goes ahead — no new exposure from that on its own.
