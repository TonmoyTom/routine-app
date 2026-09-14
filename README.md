# Routine

A private daily-routine PWA. Nuxt 3 + Pinia, installable, works offline, no
backend and no hosting account required.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

To get a real installable build:

```bash
npm run generate     # static output in .output/public
npx serve .output/public
```

`npm run generate` produces plain static files. Open them over **https** or
`localhost` — service workers and the install prompt will not run over plain
http on a LAN address. To install on your phone, either run the dev server and
tunnel it, or drop `.output/public` onto any static host.

## What's here

**Four day types.** Today's weekday decides which tasks exist; a task that does
not apply today is absent from the screen rather than greyed out.

| Weekday | Type | |
|---|---|---|
| Sun, Wed | Gym | Run 30 min, leg work |
| Mon, Tue, Thu | Home | Aerobic 30 min at night |
| Fri | Rest | nothing |
| Sat | Easy | optional walk |

Every day: three sessions, one tablet, stand-up breaks. Editable in Settings by
tapping a weekday to cycle its type — the running count underneath shows when an
edit has drifted away from five cardio days.

**Time.** Everything resolves in `Asia/Dhaka` (`settings.timezone`), not the
device zone, so the day boundary does not move if the phone travels. Clocks are
12-hour.

**The day ends at 4:00 AM, not midnight** (`settings.dayResetHour`). The last
session is scheduled for 12:00 AM, and on a plain calendar day that session
would land on tomorrow — today would sit at 2 of 3 forever while tomorrow
started at 1. Every date lookup goes through `logicalDate()`, and every
time-of-day comparison goes through `logical()`, which pushes anything before
the reset hour past 1440 so 12:00 AM sorts after 11:00 PM rather than before
9:00 AM.

Default day, matching a 10:30 PM dinner: aerobic 9:00 PM, tablet 11:00 PM,
sessions 9:00 AM / 2:00 PM / 12:00 AM. The header shows a greeting, the weekday and the current time; the
large subhead is when *today's activity* is scheduled — `7:00 AM` on a gym day,
`9:00 PM` on a home day — rather than a fixed word.

**Completion is warm.** A finished card turns amber, lifts, and takes a filled
check. Missed days render neutral, never red. Rest and easy days never break
anything.

**Each day type has its own tint** on the header panel — sage for gym, apricot
for home, lilac for rest, butter for easy — so the four days differ before you
read a word.

**Session player** — ten 5s holds with 5s releases, then ten quick pulses. The
breathing form is a soft field of green light with no hard edge rather than a shape,
so it swells and settles instead of scaling. Vibrates on each transition, holds
a wake lock where supported, and keeps the relax-and-breathe cue permanently on
screen.

**Three sessions a day is a hard cap**, enforced in the store rather than the UI.
A fourth is refused with an explanation. This is deliberate: an over-worked
pelvic floor becomes hypertonic, which works against the point of the routine.

**Home aerobic circuit** (`/aerobic`) — a 30-minute guided session that runs
itself, with the current move animated in 3D above the timer so there is no
guessing what "side step touch" means: 5 min warm-up, four 5-minute rounds, 5 min cool-down, all no-equipment
and low-impact enough for a flat at night. The timer auto-advances, vibrates on
each change, holds a wake lock, and logs the day when it finishes. Tapping
Aerobic on a home day opens it; on a gym day the row just logs, since the
running already happened.

**Exercise viewer** — movements rendered in three.js from one parametric
figure. Four gym movements run bottom-to-top on a scrub (leg press, leg curl,
leg extension, bodyweight squat); six circuit movements loop continuously
(jog, high knees, march, side step, low-impact jacks, shadow boxing). Orbit by dragging,
three snap views, and a scrub slider so you can stop at the bottom of the
movement, which is where form goes wrong. The working muscle is tinted. Every
exercise carries the same fixed line about not holding your breath under load,
since straining against a closed airway drives pressure onto the pelvic floor.

## Motion

Page transitions are direction-aware, set in `app.vue` by comparing route
depth. Opening a screen from a tab rises into place (`push`); backing out
settles down (`pop`); moving between the three tabs travels sideways in the
direction of the tab bar. Everything runs `mode: 'out-in'`, so two screens are
never painted on top of each other.

The bottom bar's highlight is one pill that slides under the active tab rather
than three that toggle, and deeper screens keep their parent tab lit — the
session player, the circuit and the exercise viewer all belong to Today.

Today's rows arrive in a short stagger via the `.stagger` class. All of it
collapses under `prefers-reduced-motion`.

## Structure

```
stores/routine.ts           all state, all rules, localStorage persistence
components/TaskRow.vue      the row, its three weight tiers, the bloom
components/ExerciseScene.vue three.js rig, poses, machines
pages/index.vue             Today
pages/session.vue           session player
pages/exercise/[slug].vue   exercise viewer
pages/history.vue           90-day grid
pages/settings.vue          schedule, privacy, export
```

## Supabase and notifications

Both are optional. With no `.env` the app runs entirely on localStorage and
Settings shows `local only`.

### 1. Project and schema

Create a project. Open the SQL editor, then **open
`supabase/migrations/0001_init.sql`, copy its contents, and paste them in** —
the editor runs SQL, it cannot read a path. Press Run.

That creates the tables, turns on row level security with an
`auth.uid() = user_id` policy on every one, and adds the two tables to the
realtime publication. It is safe to run again.

`0002_cron.sql` is separate and comes last, after the Edge Function is
deployed and the vault secrets exist. Enable `pg_cron` and `pg_net` under
Database > Extensions before running it.

### 2. Keys

```bash
npx web-push generate-vapid-keys
cp .env.example .env    # fill in the URL, anon key, and VAPID *public* key
```

The private key never goes in `.env` — it belongs to the Edge Function. Only
the three VAPID values need setting; `SUPABASE_URL` and the service key are
injected automatically, so do not add them to Secrets.

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:you@example.com
supabase functions deploy dispatch
```

### 3. Let the cron reach the function

`pg_cron` needs the project URL and the service role key, held in Vault so
neither is ever in the client bundle:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

Test it without waiting five minutes: `select public.dispatch_notifications();`

### Why there is no push library

`npm:web-push` does not survive Deno Edge. It reaches for Node's `crypto` and
`https`, and its AES-GCM path fails there — the function dies at import and
`pg_cron` only ever sees an opaque `WORKER_ERROR` with nothing to debug.

`supabase/functions/dispatch/webpush.ts` implements the protocol directly
against Web Crypto instead: RFC 8292 for the VAPID `ES256` JWT, RFC 8291 for
`aes128gcm` payload encryption. Zero dependencies, so there is nothing left to
break on a runtime upgrade.

Nothing at module scope in the function is allowed to throw either. A missing
secret comes back as `{"ok":false,"problems":[...]}` with HTTP 200, because a
crash tells you nothing about which key is absent. `?check=1` signs a throwaway
JWT and reports whether the VAPID pair works, without contacting a push service.

### How the dispatch works

A service worker cannot reliably wake itself on a schedule, and `setTimeout` in
a page does not survive a locked phone, so the server has to decide.

`pg_cron` fires every five minutes and calls the Edge Function over `pg_net`.
The function reads each profile, works out the local wall clock in that
profile's IANA zone, applies the same 4 AM rollover the client uses, and
collects what falls inside the five-minute window. It claims each slot by
inserting into `notification_log` first — the unique key on
`(user_id, kind, scheduled_for)` means an overlapping tick cannot double-send —
then pushes. A `404` or `410` back from the push service means the browser
discarded that subscription, so the row is deleted.

Notifications respect the day type: no aerobic reminder on a gym day, no cardio
reminder at all on a rest day. Lock-screen copy is discreet by default —
`Routine · Session 1 of 3` — and Settings can make it explicit.

Permission is requested after the first completed session, not on first load.
A cold prompt gets denied, and a denied prompt is hard to recover from.

### Realtime

`day_logs` and `profiles` are in the `supabase_realtime` publication, so a
change on the phone appears on the laptop without a refresh. RLS applies to
realtime as well, so a client only ever receives rows it could already read.

There is no echo-loop guard, and none is needed: an incoming row goes through
the same merge as `pull()`, which takes the maximum of each field. Our own
change coming back is a no-op. Settings shows a pulsing dot and reads `live`
while the channel is subscribed.

Firebase is not used. Supabase already carries realtime over the same client,
the same auth and the same policies — a second backend would mean two auth
systems and two copies of the data for no gain here.

### Sync

localStorage stays the source of truth while offline. Writes mark the day
dirty and flush to `day_logs` after a short debounce, retrying on `online`.
Signing in pulls the server copy and merges per day rather than overwriting —
whichever side recorded more, wins — so logging on a plane does not lose to an
older cloud row.

## Adjusting the 3D

Poses live in one function, `pose()` in `ExerciseScene.vue`, returning a full
skeleton per frame: root translation and Y rotation, torso, and independent left
and right limbs. Angles are degrees — `hip`, `knee`, `ankle`, `shoulder` and
`elbow` swing about X (negative goes forward), `hipZ` and `shoulderZ` abduct
about Z.

Gym movements read `t` as bottom (0) to top (1). Circuit movements read it as a
looping phase and drive both sides from `sin(p)` and `sin(p + π)`, which is what
makes the legs alternate. Segment lengths are in `L`. Machine geometry tracks
the limb it resists, so changing an angle moves the platform with it.
