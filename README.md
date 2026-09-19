# Archery Log

A small website for tracking archery practice: how many arrows you shot, when,
and whether you are on track for your next competition.

No accounts, no server, no build step. It is plain HTML, CSS and JavaScript —
open `index.html` and it works. Your data is stored in your own browser and is
never uploaded anywhere.

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
- **Public** — this publishes the *code*, not your practice data. Your sessions
  live in your browser only. (Private repos can also use Pages on a paid plan,
  but then only people you invite can open the site, which defeats sharing it.)
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

## Your data, and moving it between devices

Everything is stored in your browser's `localStorage`, under the key
`archery-tracker:v1`. It never leaves your device on its own.

This has one consequence worth understanding: **your phone and your computer
keep separate logs.** Nothing syncs automatically, because there is no server.
Three ways to deal with that:

- **Share a snapshot** (*You* → *Share a snapshot*). This makes a link with your
  data packed inside the link itself, after the `#`. The part after `#` is never
  sent to any web server — the link *is* the data. Open it on your other device
  and press *Keep this on this device*. This is the easiest phone ↔ computer
  transfer, and also how you show your log to someone else.
- **Download backup** gives you a `.json` file; *Restore from file* reads it
  back, either merging or replacing.
- **Export CSV** if you want to poke at it in a spreadsheet.

Do take a backup occasionally. Clearing your browser's site data will erase the
log, and nobody else has a copy.

If you shared a snapshot and then keep shooting, the old link keeps showing the
old data. Share a fresh one when you want them to see the latest.

---

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
js/store.js              data model, storage, import/export, share links
js/parse.js              natural-language entry parser
js/plan.js               periodisation and session templates
js/charts.js             hand-rolled SVG charts (no chart library)
js/views.js              dashboard, log and plan screens
js/views2.js             calendar, gear and settings screens
js/app.js                routing, dialogs, wiring
sw.js                    service worker, for offline use
manifest.webmanifest     makes it installable on a phone
icons/                   app icons
```

No dependencies, no build step, nothing to install. Change a file, reload.
