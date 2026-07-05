# Family Grocery List — Siri → n8n → Firebase

A shared, voice-driven shopping list for the family. Anyone can add items by talking to
Siri in Hebrew; an AI step figures out what's actually groceries (vs. small talk),
sorts each item into a category, and the whole household sees a live-updating list on
a fridge tablet.

## How it works

1. **Say it to Siri** — e.g. "תוסיף חלב, ביצים ולחם" ("add milk, eggs and bread").
   An iOS Shortcut dictates your speech and sends it to an n8n webhook.
2. **Gemini extracts and categorizes** — it pulls out only the actual shopping items
   (ignoring reminders, small talk, etc.) and assigns each one a category (vegetables,
   dairy, cleaning supplies, and so on — 17 categories total).
3. **Smart de-duplication** — if an item is already on the list and not yet bought,
   it won't be added twice. If it was already checked off as bought, adding it again
   un-checks it (so "we need milk again" doesn't get lost behind an old checkmark).
4. **Firebase stores the list** in real time.
5. **The web app** (this repo) displays it, grouped by category, on any screen —
   a tablet stuck on the fridge works great. Checking an item off syncs instantly to
   every other device looking at the list.

## Running the web app

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npm run dev
```

Open the URL it prints (typically `http://localhost:5173`).

To deploy it somewhere permanent (e.g. a fridge tablet or a home server):

```bash
npm run build      # builds into dist/
npx serve dist      # or any static file host
```

> **Note:** don't just double-click `index.html` to open it — it needs to be served
> over `http://` or `https://`, not opened directly from disk (`file://`), or the
> Firebase connection won't load.

## Setting up the Siri Shortcut

1. Shortcuts app → new shortcut → add **Dictate Text**.
2. Add **Get Contents of URL**:
   - URL: the n8n webhook (ask whoever set this up for the current one — see the
     "known issue" below about it changing).
   - Method: POST
   - Headers: `Content-Type: application/json`
   - Request Body (JSON): `{"text": "Dictated Text", "person": "Muli"}` — set `person`
     to whoever owns *this* phone (hardcode their name in each person's own copy of the
     Shortcut, don't make it dynamic). This is what lets the web app show "added by
     Muli" instead of just "Siri" for items added by voice. Optional — if you skip it,
     everything still works exactly as before, items just show as added by "Siri" with
     no individual attribution.
3. Add **Get Dictionary from Input** → **Get Dictionary Value** for key `response`.
4. Add **Speak Text** using that value.
5. Name the shortcut something like "תוסיף למכולת" and say "Hey Siri, [name]".
6. **If more than one person uses this**: each family member should have their own
   copy of the Shortcut on their own phone, with their own name hardcoded in step 2 —
   that's the only way n8n can tell who said what, since Siri itself doesn't identify
   the speaker to the Shortcut.

## Known issue: the webhook URL isn't permanent

The n8n instance is currently exposed via a free ngrok tunnel, which means the URL can
change if it restarts. If Siri suddenly stops working, that's the most likely reason —
check with whoever manages the n8n instance for the current URL. A more permanent
solution (Cloudflare Tunnel or Tailscale Funnel) is on the list of future improvements.

## For developers / AI assistants picking this up

See `CLAUDE.md` in this same folder for the full technical architecture, the exact
n8n workflow structure, Firebase configuration, and a list of known gaps / in-progress
work.
