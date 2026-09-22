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

**Calendar.** Month view with what you shot, what is planned, and competitions,
plus a competition schedule listing every event with its date, venue, round, and
whether the date is confirmed or still a guess.

**Scorecards.** Enter a round arrow by arrow on a keypad, laid out exactly like
the paper card: ends down the side, arrows across, X's, end total and running
total. Ring colours match the target face, so a card reads at a glance. Scores
over time are plotted as a percentage of the maximum, so a 300 round and a 660
Lancaster round sit on the same axis. Everything exports to CSV, one row per end.

**Season plan.** Across a whole season and several competitions, planned in
*weekly* arrow totals rather than fixed sessions — because real weeks move
around, and 3×80 is the same week as 2×100+1×40 as far as your shoulder is
concerned. Volume ramps, holds every fourth week, tapers before each target
event and drops again the week after. Each week suggests a split; the number is
what matters.

**Gear.** String life counted in arrows (not weeks), sight marks, personal bests.

**Sync.** Optional. Your repo becomes the database, so your phone and laptop stay
in step and anyone with the link sees the live log. See below.

---

## Running it

Just open `index.html` in a browser. That is genuinely all.

To run a local server instead (needed if you want the offline/installable
behaviour to work):

```bash
python3 serve.py
```

Then visit <http://localhost:8777>.

Use `serve.py` rather than `python3 -m http.server`. The built-in server sends
no cache headers, so browsers hang on to your old JavaScript and you end up
editing a file while the page keeps running the previous version. `serve.py`
sends `no-store`, so a reload is always a real reload.

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

## Season plan: how the numbers are chosen

Two planners work together. The **season plan** sets a weekly arrow target for
every week between now and the last competition. The **competition plan** breaks
the next event's remaining weeks into individual sessions with time blocks.

The season plan:

- **Ramps** weekly volume by a percentage chosen so it reaches your ceiling over
  the training weeks actually available — never faster than 8% a week.
- **Holds** every fourth build week flat instead of climbing.
- **Tapers** to roughly 60% the week before an A-priority event and 70% the week
  after, and treats the event week itself as the event's schedule, not yours.
- **Peaks in the gaps** between competitions, because a stacked competition
  calendar leaves no room to build — only to stay sharp.
- **Winds down** after the last event rather than finishing on the biggest weeks
  you have ever shot with nothing to use them for.
- **Never exceeds** your stated ceiling for arrows per session or days per week.

Mark an event **A** to get a taper and a recovery week around it, or **B** to
shoot through it without reshaping the block. Events whose dates are not yet
published can be marked **estimated**, and they show that way everywhere.

If the plan cannot reach your weekly ceiling in the time available, it says so
rather than pretending. That is the honest answer: between easy weeks, tapers
and the competitions themselves, there are usually fewer clear building weeks
than you would think.

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
js/plan.js               session-by-session plan for one competition
js/season.js             weekly plan across a whole season of competitions
js/scores.js             scorecards: grid, keypad editor, Scores tab
js/charts.js             hand-rolled SVG charts (no chart library)
js/views.js              dashboard, log and plan screens
js/views2.js             calendar, gear and settings screens
js/app.js                routing, dialogs, wiring
data/log.json            the log itself once sync is on (also the starting data)
serve.py                 local dev server that does not cache
tests/                   plain-node tests, see tests/README.md
sw.js                    service worker, for offline use
manifest.webmanifest     makes it installable on a phone
icons/                   app icons
```

No dependencies, no build step, nothing to install. Change a file, reload.
