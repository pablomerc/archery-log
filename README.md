# Archery Log

A small website for tracking archery practice: how many arrows you shot, when,
and whether you are on track for your next competition.

No accounts, no build step, no framework. It is plain HTML, CSS and JavaScript —
open `index.html` and it works. Your data stays in your browser unless you switch
on sync, which stores it in your own GitHub repository so every device you own
shares one log.

---

## What it does

**Log a practice by typing it.** The quick box understands ordinary English:

| You type | It records |
|---|---|
| `65 arrows in sets of 4 today` | 65 arrows, sets of 4, today |
| `12 ends of 6 at 18m` | 72 arrows, sets of 6, 18m |
| `80 arrows 2h scoring 545/600` | 80 arrows, 120 min, score 545/600 |
| `yesterday 50 arrows felt flat` | 50 arrows, yesterday, note "felt flat" |
| `sep 15 70 arrows rpe 4` | 70 arrows on 15 September, RPE 4 |

Dates (`today`, `yesterday`, `thu`, `sep 15`, `3 days ago`), set sizes,
distance, duration, RPE and scores are all picked up automatically. Anything it
does not recognise becomes the session note. There is a full form underneath if
you would rather fill in fields.

**See the trend.** Arrows per day against the plan, weekly volume, cumulative
total, and an acute-vs-chronic training-load gauge that warns you when you are
ramping up fast enough to risk your shoulder.

**Plan toward a competition.** Tell it your competition date and which days you
can shoot; it builds a session-by-session plan that ramps volume, then tapers so
you arrive rested. Every session has a time-blocked structure and a focus. Any
target can be overridden by hand.

**Calendar.** Month view with what you shot, what is planned, and competitions.

**Gear.** String life counted in arrows (not weeks), sight marks, personal bests.

**Sync.** Optional. Your repo becomes the database, so your phone and laptop stay
in step and anyone with the link sees the live log. See below.

---

## Running it

Just open `index.html` in a browser. That is genuinely all.

To run a local server instead (needed if you want the offline/installable
behaviour to work):

```bash
python3 -m http.server 8777
```

Then visit <http://localhost:8777>.

---

## Putting it on the web with GitHub Pages

GitHub Pages hosts static sites for free and gives you a URL you can open on
your phone and send to people.

### 1. Make a repository

Go to <https://github.com/new>.

- **Repository name**: `archery-log`
- **Public** — the site works either way, but public keeps it simple, and it is
  what lets anyone you send the link to read your log once sync is on. If you
  would rather your log were not public, GitHub Pro can publish a site from a
  private repo; the page stays publicly reachable but the data file does not,
  and then only your own devices can see the log.
- Do **not** tick "Add a README" — this folder already has one.
- Click **Create repository**.

### 2. Push this folder

Copy the commands GitHub shows you, or run these, replacing `YOUR-USERNAME`:

```bash
git remote add origin https://github.com/YOUR-USERNAME/archery-log.git
git branch -M main
git push -u origin main
```

### 3. Turn Pages on

In the repository: **Settings** → **Pages** (left sidebar) → under
"Build and deployment", set **Source** to `Deploy from a branch`, **Branch** to
`main` and folder to `/ (root)`. Click **Save**.

Wait a minute or two, then your site is live at:

```
https://YOUR-USERNAME.github.io/archery-log/
```

### 4. Put it on your phone

Open that URL on your phone, then:

- **iPhone (Safari)**: Share button → *Add to Home Screen*
- **Android (Chrome)**: menu (⋮) → *Install app* / *Add to Home screen*

It then behaves like a normal app, opens full screen, and works without signal —
useful, because outdoor ranges rarely have any.

### Updating it later

Edit the files, then:

```bash
git add -A && git commit -m "Describe the change" && git push
```

Pages redeploys in a minute or so.

---

## Syncing between your phone and your laptop

By default the log lives only in the browser you typed it into. Turn on sync and
your repository becomes the storage instead, so every device you own reads and
writes the same file — and anyone you send the link to sees your live log
without needing anything at all.

### How it works

- The log is a single file in your repo, `data/log.json`.
- **Reading needs nothing.** Any visitor's browser fetches that file directly.
  Open the link on a friend's phone and they see your current log.
- **Writing needs a token**, which lives only in the browser you paste it into
  and is never written into the repository.
- Every save is an ordinary git commit, so you get the full history of your
  training for free, and it is very hard to lose anything.

### Setting it up

1. Open the app, go to **You**, and find **Sync across devices**. The username
   and repository are filled in from the page address already.
2. Follow the five steps shown there to create a fine-grained token. In short:
   [create a token](https://github.com/settings/personal-access-tokens/new),
   restrict it to **only this repository**, and give it one permission —
   **Contents: Read and write**.
3. Paste it in and press **Save and test**. It tells you whether it worked.
4. Repeat on your other device. That is it.

### What happens day to day

- Changes upload a couple of seconds after you make them.
- Coming back to the page pulls down whatever your other device did.
- Log while offline at the range and it uploads as soon as you have signal.
- The dot next to the theme button shows the state: green synced, blue syncing,
  amber offline, red failed. Tap it to sync immediately.

### Honest caveats

- **The token is a password.** Anyone who has it can change that one repository.
  Do not paste it anywhere else. If it leaks, delete it on GitHub and make a new
  one — nothing else is affected.
- **Tokens expire.** When yours does, sync starts failing and you make a new one.
- **Your log is public** if the repo is public. That was a deliberate choice;
  make the repo private if you change your mind, though then only you can read it.
- **Simultaneous edits are merged, not lost.** Each session carries an edit time;
  the newer edit wins, deletions are remembered so they do not come back, and if
  two devices write at the same moment one retries. Settings move as a block, so
  the last device to change a setting wins for all of them.

### Without sync

Everything still works — the log just stays in one browser, under the key
`archery-tracker:v1`. To move it around:

- **Share a snapshot** packs your data into the link itself, after the `#`. That
  part is never sent to any server. Open it elsewhere and press *Keep this on
  this device*.
- **Download backup** writes a `.json`; *Restore from file* reads it back,
  merging or replacing.
- **Export CSV** for spreadsheets.

Take a backup occasionally either way. Clearing your browser's site data erases
a local-only log, and nobody else has a copy.

## How the training plan works

The plan is deliberately conservative, and it is a suggestion rather than a
prescription.

- **Ramp.** Weekly volume grows by a set percentage (default 8%) from whatever
  you say you currently shoot per session. Sessions inside a week undulate —
  moderate, heavy, lighter — rather than sitting flat.
- **Ceiling.** No session exceeds roughly 1.7× your current volume, or what
  actually fits in your session length (about one deliberate arrow every 45
  seconds after a 15 minute warm-up), whichever is lower.
- **Taper.** The last stretch before a competition drops to roughly 75%, then
  55%, then 35% of your peak session. The final session before the event is a
  short confirmation of sight marks and equipment, not training.
- **Session types rotate** through form work, volume with SPT holds, and scoring
  rounds, becoming almost entirely scoring and rehearsal during the taper.

The **training load** gauge on the dashboard is the acute:chronic workload
ratio — this week's arrows divided by your rolling four-week average. Much above
1.3 and you are adding volume faster than your shoulder is adapting. It is a
rough indicator borrowed from other sports, not a medical instrument.

None of this is a substitute for a coach, and your body outranks the plan.

---

## Files

```
index.html               the whole app shell
css/app.css              styling, light and dark
js/store.js              data model, storage, merging, import/export, share links
js/sync.js               GitHub-as-database sync
js/parse.js              natural-language entry parser
js/plan.js               periodisation and session templates
js/charts.js             hand-rolled SVG charts (no chart library)
js/views.js              dashboard, log and plan screens
js/views2.js             calendar, gear and settings screens
js/app.js                routing, dialogs, wiring
tests/                   plain-node tests, see tests/README.md
sw.js                    service worker, for offline use
manifest.webmanifest     makes it installable on a phone
icons/                   app icons
```

No dependencies, no build step, nothing to install. Change a file, reload.
