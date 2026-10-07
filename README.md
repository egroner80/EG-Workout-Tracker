# EG Workout Tracker

A mobile-first, offline-first PWA for running and tracking two alternating strength workouts,
upper body and lower body: guided warm-up timers, every set target visible at a glance,
stepper-only logging, and transparent progressive overload computed from what you actually did.

Open the app and Home suggests today's workout, the opposite of the last one you finished. Tap
**Start upper body** or **Start lower body** (either one, whatever the suggestion) and follow the
warm-up. Each exercise card shows the weight and every set's target together (`18 kg · 5 — 5 — 6`).
Tap a set to log it as prescribed, or use − / + to record what really happened. At the end, the app
tells you what to attempt next time.

## What it does

- **Two workouts, alternating.** Upper body (pull-ups, dips, one-arm DB row, DB bench press,
  standing DB press, hammer curls, weighted reverse crunch, suitcase carry) and lower body
  (Bulgarian split squat, single-leg RDL, single-leg hip thrust, sliding hamstring curl, Copenhagen plank).
  Every workout records which one it was. Home suggests the next one and lists your recent
  workouts with their type and date, so three a week stays upper, lower, upper, lower.
- **Guided warm-up.** Big name, big countdown, a chime, a screen flash, and vibration where the
  device supports it at zero, then a 3-second get-ready and the next step starts by itself. Jump
  rope starts at 2:00 and adds 10 s after every workout where it ran the full time, up to 5:00.
  Double unders then join at 0:30 and add 5 s per workout up to 1:00. The rope progression is
  shared: it picks up from the last workout that had it, upper or lower. Durations, increments,
  and caps are all editable.
- **Three kinds of warm-up step.** Timed steps count down. Rep steps (hip hinges ×10, glute
  bridges ×10) show the count and a **Done** button. Each-side steps (world's greatest stretch,
  30 s each side) run one timer and cue the switch at the midpoint.
- **Squat routine in both warm-ups.** Four 30 s holds in one deep squat (settle, knee push-outs,
  side to side, breathe) run back to back with no get-ready between them, then five slow
  bodyweight squats. Edits to a step both warm-ups share apply to both.
- **The whole prescription on one card.** Weight, today's set targets, what you've logged, and last
  time. Dumbbell weights are per dumbbell. Pull-ups and dips support bodyweight, added weight
  (`BW + 5 kg`), and assistance (`Assisted −10 kg`).
- **Planned vs actual.** Both are stored; the plan is never overwritten. Missed reps, a lighter or
  heavier weight, skipped sets, and extra sets are all recorded as they happened.
- **Transparent progression from actual performance.**
  - Rep ranges are set for strength: heavy sets of about 8 reps or fewer (roughly 80% of your
    max or more), each range wide enough to absorb one weight step, which costs about 3 reps per
    10% added.

    | Exercise | Reps per set |
    | --- | --- |
    | Pull-ups, dips (+2.5 kg is about one rep) | 5–6 |
    | DB row, bench press, overhead press (+2 kg is 11–17% of the dumbbell) | 4–8 |
    | Split squat, single-leg RDL, single-leg hip thrust | 5–8 |
    | Hammer curls (+2 kg is a fifth of a 10 kg dumbbell) | 6–12 |
    | Reverse crunch | 8–12 |
    | Sliding hamstring curl | 8–10 |

  - **Goal met:** the next goal goes up a rep, `4/4/4 → 5/4/4 → 5/5/4 → 5/5/5 → … → 8/8/8`. The
    extra rep goes on the first set, where you're freshest.
  - **Goal beaten:** the next goal is a rep past what you actually did: 7/6/5 against a 5/5/5 goal
    makes the next one 7/6/6.
  - **Goal missed** (a set short, skipped, or done lighter): the same goal again.
  - Sets are compared from most reps to fewest, so it doesn't matter which set came out best:
    6/6/5 meets a 5/5/6 goal.
  - Once every set reaches the top of the range, the weight goes up and the goal restarts at the
    bottom.
  - The suitcase carry is timed per side, 40 s up to 60 s in 5 s steps. The Copenhagen plank is a
    timed hold per side, 20 s up to 40 s in 5 s steps. Holding longer than the target counts the
    same way.
  - A workout finished on an earlier version is judged by these rules too, from what you actually
    did.
  - Changing an exercise's rep range keeps your current target. One below the new minimum says so
    ("Below the 4–8 rep range") until it climbs back in.
  - At the top of the ladder at bodyweight (or the top of a bodyweight hold), you choose the added
    weight, or stay at bodyweight with a harder variation.
  - You can override any next target by hand.
- **Rest timer.** Logging a set (or one tap on Start rest) starts it as a compact countdown in the
  bottom bar, beside Next, so the set you just logged stays in reach. Tap the countdown for the
  large view with +15 s, +30 s, pause, and skip.
- **Suitcase carry timer.** Tap a side. You get 5 s to pick up the weight, then the side counts
  down; the app switches hands and records both sides.
- **Completion summary.** Duration, target vs actual with ✅ where met, what's next per exercise,
  and the full NEXT WORKOUT list.
- **History and progress.** Every workout is kept, with planned and actual values. Each exercise
  has its own history, simple load and volume charts, and a ladder view of completed stages and
  weight increases.
- **Nothing is lost.** Every tap is saved immediately to IndexedDB. Closing the tab, locking the
  phone, or reloading restores the workout exactly, including running timers.
- **Installable and offline.** A service worker precaches the app. After the first visit it opens
  without a network connection.

Demo history is loaded on first launch so History and Progress have something to show; it never
affects your targets. The first start of a real workout offers to clear it, or use
**Settings → Clear demo data**.

## Development

Requires Node 22.22 or newer (CI uses Node 24).

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm test` | Run unit and component tests (Vitest, jsdom, fake IndexedDB) |
| `npm run test:e2e` | Build, then run the end-to-end tests with Playwright against the production build |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check all projects |
| `npm run build` | Type-check and build the production PWA into `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run icons` | Regenerate icons and iOS launch screens from `public/icon.svg` |

### End-to-end tests

The e2e suite runs the real workout with a fake clock:

- **Acceptance:** start, guided warm-up, a failed set, a lighter weight, finish, check next
  targets, then close and reopen and check History.
- **Lower body:** the squat routine flowing hold to hold, rep and each-side steps, the Copenhagen
  plank timer, the next-workout suggestion, and the jump rope carrying over between workouts.
- **Restore:** reload mid-timer and mid-exercise.
- **Offline:** the service worker and the manifest.

```bash
npx playwright install chromium
npm run test:e2e
```

A `mobile-webkit` (iPhone 14) project is also configured. To run it, install WebKit with
`npx playwright install webkit`, then run `npx playwright test --project=mobile-webkit` after a
build.

### Code layout

| Path | Contents |
| --- | --- |
| `src/domain` | Pure logic: types, progression rules, session and timer state, formatting |
| `src/data` | Dexie (IndexedDB) database, repositories, seed data, backup format |
| `src/services` | Commands and queries that combine the domain and data layers |
| `src/state` | The workout store (write-through saves, localStorage mirror, lifecycle, ticker) |
| `src/platform` | Device feedback: Web Audio cues, vibration, wake lock, persistent storage |
| `src/features` | Screens: home, warm-up, workout, rest, summary, history, progress, settings |

Progression logic lives in `src/domain/progression` and never touches the UI.

## Deploying

The build is a static site with hash routing and a relative base, so `dist/` works from any static
HTTPS host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, or your own server).

On Vercel, publish the prebuilt output so nothing but the built files leaves your machine:

```bash
vercel link
vercel build --prod
vercel deploy --prebuilt --prod
```

`vercel.json` pins the Vite build and the no-cache headers below; `.vercel/` is gitignored.

- **HTTPS is required.** Service workers, installation, the screen wake lock, and the share sheet
  only work in a secure context. `localhost` counts as secure for development.
- **Cache headers.** Serve `sw.js` and `index.html` with `Cache-Control: no-cache` so updates are
  picked up. Hashed files under `assets/` can be cached for a long time.
- **Updates.** When a new version is deployed, Home shows an update banner. It only appears when
  no workout is running, because applying the update reloads the app.

To try the app on a phone before deploying, run `npm run build && npm run preview -- --host` and
open it through an HTTPS tunnel. A plain LAN `http://` address won't install or work offline.

## Installing on your phone

- **iPhone (Safari):** open the app's URL, tap **Share → Add to Home Screen**, then launch it from
  the icon. Install before you start logging: on iOS, Home Screen apps and Safari tabs keep separate
  storage. Home Screen apps are also exempt from Safari's 7-day storage cleanup.
- **Android (Chrome):** open the URL and tap **Install app** in the menu, or accept the install
  prompt.

## Backing up your data

Your history lives only on the phone. Deleting the Home Screen icon deletes its data, and so does
losing the phone.

- **Settings → Back up now** saves a JSON file through the share sheet (Files, iCloud Drive, AirDrop,
  email). Where sharing files isn't supported (Android Chrome), it downloads instead. The completion
  screen reminds you after five workouts without a backup.
- **Settings → Restore from a backup** first shows what the file contains. Restoring only adds or
  updates workouts: nothing on the phone is deleted, and newer local changes win.
- Backups hold both workouts. A backup from before the lower-body workout existed still restores:
  its workouts come back as upper body and its workout template as the upper-body workout, with the
  squat routine added.
- Each web address keeps its own data. Moving from a local or test address to the published one
  means backing up there and restoring on the new address.
- A workout still in progress isn't included in a backup. Finish it first.
- Settings also shows whether the browser granted persistent storage, which protects your data from
  automatic clearing when space runs low.

## Platform limitations

- **No vibration on iPhone.** iOS has no Vibration API, so cues are a sound plus a full-screen flash.
  Android vibrates as well.
- **The silent switch mutes cues.** By default, cues mix with your music, and the iPhone silent
  switch mutes them. **Settings → Always audible** plays cues in silent mode too, but pauses music
  while the app is open. The first START plays a test chime and offers this setting if you didn't
  hear it.
- **Keeping the screen on.** On iPhone this needs iOS 18.4 or later in a Home Screen app. The first
  request after every launch also needs a tap. After a relaunch, a **Tap to keep screen on** bar
  appears.
- **No cues while the phone is locked.** A locked phone suspends web apps. Timers are
  timestamp-based, so reopening the app shows the correct remaining time and records what happened.
  Chimes can't play while the phone is locked.
- **Storage can be lost.** See the backup section above.

## Real-device checklist

Automated tests run in desktop Chromium with mocked device APIs. Check these on a real phone over
HTTPS:

- [ ] Installs to the Home Screen and opens standalone with the dark launch screen and correct
      safe-area padding, including on iOS 26.
- [ ] Opens in airplane mode after the first launch.
- [ ] Keep-screen-on holds through a full warm-up; after a relaunch, the "Tap to keep screen on" bar
      appears and a tap re-acquires it.
- [ ] Cues with music playing: they mix with music by default, and **Always audible** plays them in
      silent mode and pauses the music.
- [ ] Audio still plays after switching apps and after locking and unlocking mid-timer.
- [ ] A timer that ends while the phone is locked shows the right state on return.
- [ ] Settings shows the persistent-storage result.
- [ ] **Back up now** opens the share sheet and saves the file; restoring it shows the preview.
