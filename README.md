# Strava Pulse

**Your running community on one map: meets, open tracks, club runs and track workouts near you, sorted by the day you can show up and filtered by your pace.**

Product Space Fellows Case Comp, Group 3 (Strava).

## Run it

No build step and no install.

```bash
cd strava-pulse
python3 -m http.server 5179
```

Then open http://localhost:5179 in Chrome.

- **Laptop or projector:** you get a phone frame plus a presenter panel with the demo steps and controls.
- **Phone:** the app goes full screen. Put the folder on any static host (Netlify Drop, Vercel or GitHub Pages) and open the link on your phone.
- **Internet:** needed for the map tiles and the Inter font. Everything else runs locally.
- **Saved state:** plans, entries and results are saved in the browser. Press **Shift+R** to reset before presenting.

| Key | What it does |
|---|---|
| `1`–`7` | Pick a day on the map's 7-day strip |
| `F` | Jump ahead to after the meet (posts the official result) |
| `O` | Open the organizer view |
| `Esc` | Back / close |
| `Shift+R` | Reset the demo |

## The 2½-minute demo path

1. **Home.** The Pulse card reads "5 runs & meets near you tonight". Tap **Plan my first week**.
2. **Personalize (two taps).** Pick "I ran track or XC in high school", then "All of it". Your pace is already known: 10:42/mi easy, and Strava predicts an 8:12 mile.
3. **Plan my first week.** Pulse picks three things:
   - Westwood Night Owls tonight at 7, a 4 min jog away. Its 10:30 group ran 10:18 with 0 dropped.
   - A tempo workout on Thursday.
   - Westside Mile Night on Friday, where you're seeded in Heat 3.

   Tap **Add 3 to my week**. The pins turn white with a check, and a dotted line draws your week across the city.
4. **Track.** Tap the SMC pin. It shows:
   - open until 9 PM, 3 of 8 lanes in use, and 9 runners at your pace right now
   - a workout board where you can join Sam's 6 × 400m
   - "confirmed open 22 min ago", plus report buttons
5. **Meet.** Open Westside Mile Night. You'll see:
   - **Prediction:** Strava predicts 8:12, which puts you in Heat 3.
   - **Events:** a schedule with start times; pick Mile + 400m.
   - **Entry:** free to pre-register, pay at check-in.
   - **Heat sheet:** your seed in Heat 3.
6. **Race day.** Press `F`. The official FAT result is stamped onto your activity. Then **What's next** shows:
   - the runners you raced with, so you can follow them
   - the next meet, with you already seeded
   - your pace group's next run
7. **Organizer view (`O`).** This is the supply side: "31 found you on Pulse", fill rate, heat balance and a **Feature · $49** button.

## What's in the app

| Area | What works |
|---|---|
| **Heatmap** | Built from about 18,000 real streets, paths and trails (OpenStreetMap), each weighted by how popular it is for running. Quiet streets stay a faint ember and the beach path, San Vicente and the UCLA loop burn bright. Streets around what's happening on the selected day glow brighter, and the glow animates as you change days. |
| **Run trails** | Tap a club run or a popular route. The heat dims, and the real route draws itself in with a start marker, mile markers and a ghost runner looping at your pace. Five popular routes (UCLA Campus Loop, San Vicente Median, Beach Path, Ballona Creek, Baldwin Hills) each show distance, elevation gain, athletes this month and your time at easy pace, plus **Run it now** (loads the route into Record). |
| **Map** | Pin shape tells you the type: shield = meet, stadium pill with a live lane meter = track, circle = club. Pin color tells you the state: orange = at your pace, graphite = off your pace, dot = not on this day, white with a check = in your week. Glowing lines show where people actually run. Pins at the same venue fan out instead of stacking. |
| **Time & pace** | 7-day strip with an event count per day, AM / PM / All toggle, and a pace lens (Off / ±0:30 / ±1:00 / ±1:30) whose counts update as you change it |
| **Bottom sheet** | Three states. **Peek:** the day strip and your week. **List:** grouped into runs & meets, tracks open, and runners at your pace. **Selected:** a preview with "leave by" times. |
| **Meets** | Strava prediction → heat, multi-event pre-registration, heat sheet, ticket with check-in and leave-by times, organizer view |
| **Tracks** | Live lanes, at-your-pace count, trust reports (Open / Locked / Team practice), workout board with Join and Post, busy-by-hour chart, gate directions and lane etiquette |
| **Clubs** | Honest pace groups measured from recorded runs (actual average, how many dropped), upcoming runs with RSVP per date, route |
| **People** | Never on the map. Shown as a list with proof of recent training. "Propose a run" offers time slots that fit both schedules, and accepting adds the run to your week. |
| **Loop** | Plan → show up → official result → follow the runners you raced with → next meet already seeded |
| **Accounts** | Create your own profile: name, optional photo and email, home base, running background and a recent 5K time, which sets your easy pace and race predictions. Each account keeps its own runs, plans and results. Log out, switch or edit from the You tab. There's no server, so accounts are saved on the device. The demo runner (Ian) is one tap away on the welcome screen. |
| **Photos** | Real, openly licensed photos from Wikimedia Commons on track, meet, club and route pages and in the map preview. Each one is credited on screen (photographer and license, linking to the source). |
| **Rest of the app** | Home feed (tap a venue or club to open it, kudos), inbox, Groups (your week, clubs, a sponsored series challenge), You (predictions, results, settings), Record |

## Code map (for iterating in Cursor)

```
index.html      layout: presenter panel, device frame, map, sheet, tab bar
css/styles.css  design tokens at the top (type scale, colors), then one section per screen
js/streets.js   street + trail geometry with heat weights (generated)
js/routes.js    club runs and popular routes along real paths (generated)
js/data.js      tracks, workout sessions, clubs, meets, people, popular routes
js/photos.js    photo credits (generated); images live in photos/
js/account.js   on-device accounts
js/record.js    GPS recorder
tools/build_heat.py  regenerates streets.js + routes.js from an OpenStreetMap export
tools/photos_*.py    finds and downloads openly licensed photos from Wikimedia Commons
js/app.js       app logic in 10 commented sections
```

- **Real clock:** the app runs on the viewer's own time. Club runs and meets use real weekdays, tonight's one-off posts roll to tomorrow once they pass, and live lane counts follow the typical crowd for the current hour. To pin a time of day for a pitch, add `?time=18:20` to the URL.
- **Thanksgiving:** a Turkey Trot appears only in Thanksgiving week.
- **Adding things:** a meet, club or workout added to `data.js` shows up on the map, the day strip, the list and the plan builder automatically.
- **Sample data:** venue names are real places. Schedules, crowds, clubs, meets and people are invented, and the app says so.

Map tiles © Esri, HERE, Garmin, © OpenStreetMap contributors. Street and trail geometry © OpenStreetMap contributors (ODbL), routed with OSRM. Photos from Wikimedia Commons under CC BY, CC BY-SA and CC0 licenses; credits are shown on each photo and listed in js/photos.js. Leaflet 1.9.4.
