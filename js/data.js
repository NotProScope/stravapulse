/* ------------------------------------------------------------------
   Pulse demo data — Westside Los Angeles, winter season.
   Venue names are real places; schedules, hours, crowds, clubs,
   meets, sessions and people are SAMPLE DATA for the demo.
   Everything runs on the viewer's real clock. Recurring things use real
   weekdays, and one-off posts for tonight roll to tomorrow once they pass.
------------------------------------------------------------------- */

// Real time by default. For a pitch you can pin the time of day with ?time=18:20
const NOW = (() => {
  const d = new Date(); d.setSeconds(0, 0);
  const m = (new URLSearchParams(location.search).get('time') || '').match(/^(\d{1,2}):?(\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) d.setHours(+m[1], +m[2]);
  return d;
})();
const TODAY = (() => { const d = new Date(NOW); d.setHours(0, 0, 0, 0); return d; })();

function at(dayOffset, h, m = 0) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}
// Next date on weekday `dow` (0=Sun) at h:m, at least `minDays` out and not already started
function nextDow(dow, h, m = 0, minDays = 0) {
  for (let off = minDays; off < minDays + 8; off++) {
    const d = at(off, h, m);
    if (d.getDay() === dow && d > new Date(+NOW - 20 * 60e3)) return d;
  }
  return at(minDays + 7, h, m);
}
// Today at h:m, or tomorrow if that time has already passed (for one-off evening posts)
function tonightOr(h, m = 0) {
  const d = at(0, h, m);
  return d > new Date(+NOW - 20 * 60e3) ? d : at(1, h, m);
}
// US Thanksgiving: 4th Thursday of November
function thanksgiving(year) {
  const d = new Date(year, 10, 1);
  const first = (4 - d.getDay() + 7) % 7;
  return new Date(year, 10, 1 + first + 21, 8, 0);
}

const ME = {
  name: 'Ian Son',
  initials: 'IS',
  city: 'Los Angeles, California',
  school: 'UCLA',
  pace: 642,                       // easy pace, 10:42 /mi (last 6 runs)
  best5k: '27:54',                 // 5K best effort
  predict: { '400m': 98, '800m': 215, 'Mile': 492, '1500m': 456, '3000m': 1010, '5K': 1674 },
  home: { lat: 34.0652, lng: -118.4528 }, // UCLA dorms
};

const FRIENDS = {
  kai:  { id: 'kai',  name: 'Kai Nakamura', initials: 'KN', hue: 205, pace: 540, focus: 'Mile / 3000m', bio: 'UCLA ’28 · ran the 1600 in high school', week: '26 mi/wk', usual: 'Track Tue + Thu evenings' },
  lena: { id: 'lena', name: 'Lena Ortiz',   initials: 'LO', hue: 330, pace: 585, focus: '800m', bio: 'Santa Monica · ex-800m runner', week: '19 mi/wk', usual: 'Weekday mornings' },
  ari:  { id: 'ari',  name: 'Ari Cohen',    initials: 'AC', hue: 150, pace: 650, focus: 'Mile', bio: 'UCLA ’29 · ran XC + 1600 in high school', week: '21 mi/wk', usual: 'Evenings after 7' },
};

/* ---------- Tracks ---------- */
function crowdCurve(peakAM, peakPM, base = 0) {
  return Array.from({ length: 24 }, (_, h) => {
    const am = peakAM * Math.exp(-Math.pow(h - 6.5, 2) / 2.2);
    const pm = peakPM * Math.exp(-Math.pow(h - 18.5, 2) / 3);
    return Math.max(0, Math.min(8, Math.round(base + am + pm)));
  });
}

const TRACKS = [
  {
    id: 't1', type: 'track', name: 'Drake Stadium', area: 'UCLA',
    lat: 34.0716, lng: -118.4467, slots: [[6, 21]], lights: true,
    access: 'UCLA students and Bruin Rec members daily · public Sat–Sun 7a–12p',
    youHaveAccess: 'You have access with your UCLA ID',
    publicNow: false, surface: '400m rubberized · 8 lanes',
    verifiedBy: 212, liveLanes: 5, atPaceNow: 4, confirmedMin: 9,
    crowd: crowdCurve(4, 6, 1),
    gate: 'Enter through the Westwood Plaza gate by the Acosta Center. Show your ID at the booth.',
    etiquette: 'Lanes 1–2 for reps, run counter-clockwise, jog in lanes 5–8.',
  },
  {
    id: 't2', type: 'track', name: 'SMC Corsair Field', area: 'Santa Monica',
    lat: 34.0165, lng: -118.4720, slots: [[5, 8], [18, 21]], lights: true,
    access: 'Open to the public 5–8a and 6–9p when the field is not booked',
    publicNow: true, surface: '400m rubberized · 8 lanes',
    verifiedBy: 96, liveLanes: 3, atPaceNow: 9, confirmedMin: 22,
    crowd: crowdCurve(5, 5),
    gate: 'Walk in from the Pearl St gate. Parking structure 3 is free after 6 PM.',
    etiquette: 'Lanes 1–2 for reps, counter-clockwise. Football has the infield on Fridays.',
  },
  {
    id: 't3', type: 'track', name: 'Venice High Track', area: 'Mar Vista',
    lat: 34.0045, lng: -118.4344, slots: [[18, 20]], lights: false,
    access: 'Community use after team practice ends, about 6–8p weekdays',
    publicNow: true, surface: '400m rubberized · 6 lanes',
    verifiedBy: 54, liveLanes: 1, atPaceNow: 1, confirmedMin: 41,
    crowd: crowdCurve(1, 3), practiceUntil: 18,
    gate: 'Side gate on Walgrove Ave. It is locked until the team leaves.',
    etiquette: 'No lights. Bring a headlamp after 6:30.',
  },
  {
    id: 't4', type: 'track', name: 'Uni High Track', area: 'West LA',
    lat: 34.0430, lng: -118.4556, slots: [[17, 20]], lights: false,
    access: 'Community hours 5–8p weekdays',
    publicNow: true, surface: '400m rubberized · 8 lanes',
    verifiedBy: 61, liveLanes: 2, atPaceNow: 2, confirmedMin: 35,
    crowd: crowdCurve(1, 4),
    gate: 'Enter on Texas Ave next to the pool.',
    etiquette: 'Inside lanes for reps, counter-clockwise.',
  },
  {
    id: 't5', type: 'track', name: 'Culver City High Track', area: 'Culver City',
    lat: 34.0108, lng: -118.3958, slots: [[6, 8], [18, 21]], lights: true,
    access: 'Public 6–8a and 6–9p',
    publicNow: true, surface: '400m rubberized · 8 lanes',
    verifiedBy: 73, liveLanes: 2, atPaceNow: 1, confirmedMin: 17,
    crowd: crowdCurve(3, 4),
    gate: 'Elenda St gate, next to the stadium lot.',
    etiquette: 'Lanes 1–2 for reps, counter-clockwise.',
  },
  {
    id: 't6', type: 'track', name: 'Rancho Cienega Track', area: 'Baldwin Hills',
    lat: 34.0190, lng: -118.3420, slots: [[6, 22]], lights: true,
    access: 'Fully public, every day 6a–10p',
    publicNow: true, surface: '400m rubberized · 8 lanes',
    verifiedBy: 148, liveLanes: 4, atPaceNow: 3, confirmedMin: 6,
    crowd: crowdCurve(4, 5, 1),
    gate: 'Main entrance off Rodeo Rd, free lot.',
    etiquette: 'Busy with groups 6–8p. Reps in lanes 1–3.',
  },
];
// "Live" numbers come from the typical crowd at this hour, so they match the busy chart
TRACKS.forEach(t => {
  const h = NOW.getHours() + NOW.getMinutes() / 60, open = t.slots.some(([a, b]) => h >= a && h < b);
  const base = t.liveLanes;
  t.liveLanes = open ? Math.max(1, t.crowd[NOW.getHours()]) : 0;
  t.atPaceNow = open ? Math.max(0, Math.round(t.atPaceNow * t.liveLanes / base)) : 0;
});

/* ---------- Open sessions (the track workout board) ---------- */
// Posted by runners for today/tomorrow. effort = target pace per mile for the reps.
const SESSIONS = [
  { id: 's1', type: 'session', track: 't2', who: 'Sam Reyes', initials: 'SR', hue: 30, when: tonightOr(19, 0),
    workout: '6 × 400m @ 2:00', rest: '90s jog', effort: 480, joined: 2, want: 2, forPace: true },
  { id: 's2', type: 'session', track: 't2', who: 'Priya Shah', initials: 'PS', hue: 280, when: tonightOr(19, 15),
    workout: '4 × 800m @ 3:40', rest: '2:00 jog', effort: 440, joined: 1, want: 1, forPace: false },
  { id: 's3', type: 'session', track: 't1', who: 'Kai Nakamura', initials: 'KN', hue: 205, when: tonightOr(19, 30), friend: 'kai',
    workout: '5 × 1K @ 4:45', rest: '2:00 standing', effort: 458, joined: 3, want: 1, forPace: false },
  { id: 's4', type: 'session', track: 't6', who: 'Dev Patel', initials: 'DP', hue: 55, when: at(1, 6, 30),
    workout: 'Tempo 3 mi @ 8:50', rest: 'continuous', effort: 530, joined: 1, want: 2, forPace: true },
  { id: 's5', type: 'session', track: 't1', who: 'Ari Cohen', initials: 'AC', hue: 150, when: at(2, 19, 0), friend: 'ari',
    workout: '8 × 200m @ 0:50', rest: '200m walk', effort: 400, joined: 2, want: 2, forPace: true },
];

/* ---------- Clubs ---------- */
function loop(lat, lng, rLat, rLng, n = 18, wobble = 0.15) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + wobble * Math.sin(a * 3);
    pts.push([lat + rLat * w * Math.sin(a), lng + rLng * w * Math.cos(a)]);
  }
  return pts;
}

// groups: honest pace groups computed from the club's recorded group runs (last 4 runs)
const CLUBS = [
  {
    id: 'c1', type: 'club', name: 'Westwood Night Owls', short: 'NO',
    lat: 34.0627, lng: -118.4470, meetSpot: 'Westwood Village fountain',
    schedule: [{ dows: [1, 2, 3, 4], h: 19, m: 0, label: 'Social 5K' }],
    members: 214, beginner: true,
    about: 'Weeknight social 5K on lit streets around Westwood Village. Every group has a pacer and a sweeper.',
    captain: 'Maya R.', firstTimer: 'Captains meet new runners at the fountain at 6:50.',
    groups: [{ pace: 570, usual: 14, actual: '9:24', dropped: 0 }, { pace: 630, usual: 22, actual: '10:18', dropped: 0 }, { pace: 690, usual: 11, actual: '11:36', dropped: 1 }],
    route: ROUTE_GEO.c1.pts, dist: `${ROUTE_GEO.c1.mi} mi`,
    friends: ['ari'], going: 38,
  },
  {
    id: 'c2', type: 'club', name: 'Bruin Sunrise Milers', short: 'SM',
    lat: 34.0721, lng: -118.4482, meetSpot: 'Drake Stadium, home straight',
    schedule: [{ dows: [2, 4], h: 6, m: 30, label: 'Track intervals' }],
    members: 167, beginner: false,
    about: 'Structured track workouts for former high school and college athletes. Coached Thursdays.',
    captain: 'Coach Dana', firstTimer: 'Bring a recent mile or 5K time so the coach can place you.',
    groups: [{ pace: 450, usual: 12, actual: '7:24', dropped: 0, mile: 'sub-5:30' }, { pace: 510, usual: 18, actual: '8:28', dropped: 1, mile: '5:30–6:30' }],
    route: loop(34.0716, -118.4467, 0.0012, 0.0016, 18, 0), dist: '6 × 800m',
    friends: ['kai'], going: 31,
  },
  {
    id: 'c3', type: 'club', name: 'Venice Track Collective', short: 'VT',
    lat: 34.0052, lng: -118.4356, meetSpot: 'Venice High track, home straight',
    schedule: [{ dows: [3], h: 18, m: 30, label: 'Track night, all levels' }, { dows: [6], h: 8, m: 0, label: 'Track + coffee' }],
    members: 98, beginner: true,
    about: 'Open track sessions for every level. Each workout is written for three mile-time groups.',
    captain: 'Jules P.', firstTimer: 'First session is free. Flats are fine.',
    groups: [{ pace: 540, usual: 8, actual: '8:52', dropped: 0, mile: 'sub-7:00' }, { pace: 630, usual: 15, actual: '10:05', dropped: 0, mile: '7:00–8:30' }, { pace: 720, usual: 12, actual: '11:40', dropped: 0, mile: '8:30+' }],
    route: loop(34.0045, -118.4344, 0.0010, 0.0014, 18, 0), dist: '5 × 400m',
    friends: ['lena', 'kai'], going: 27,
  },
  {
    id: 'c4', type: 'club', name: 'Santa Monica Striders', short: 'SS',
    lat: 34.0094, lng: -118.4973, meetSpot: 'Santa Monica Pier, Ocean Ave entrance',
    schedule: [{ dows: [6], h: 7, m: 30, label: 'Beach long run' }, { dows: [2], h: 18, m: 30, label: 'Lit 4 mi on Ocean Ave' }],
    members: 402, beginner: true,
    about: 'The biggest social run on the Westside. Saturday long runs on the beach path.',
    captain: 'Theo W.', firstTimer: 'Look for the orange flags at the pier. Every group has a sweeper.',
    groups: [{ pace: 540, usual: 30, actual: '8:55', dropped: 1 }, { pace: 630, usual: 44, actual: '10:22', dropped: 0 }, { pace: 720, usual: 21, actual: '12:04', dropped: 0 }],
    route: ROUTE_GEO.c4.pts, dist: `${ROUTE_GEO.c4.mi} mi`, friends: [], going: 95,
  },
  {
    id: 'c5', type: 'club', name: 'Culver Sprint Lab', short: 'SL',
    lat: 34.0115, lng: -118.3970, meetSpot: 'Culver City High track',
    schedule: [{ dows: [2, 4], h: 18, m: 0, label: 'Speed + block starts' }],
    members: 61, beginner: false,
    about: '100m–400m athletes. Drills, block starts, flying 30s.',
    captain: 'Marcus B.', firstTimer: 'Sprints only. Bring spikes if you have them.',
    groups: [{ pace: 0, usual: 9, actual: '100/200', dropped: 0, mile: '100–200m' }, { pace: 0, usual: 7, actual: '400', dropped: 0, mile: '400m' }],
    route: loop(34.0108, -118.3958, 0.0010, 0.0014, 18, 0), dist: '8 × 60m',
    friends: [], going: 16, sprint: true,
  },
  {
    id: 'c6', type: 'club', name: 'Palms Easy Miles', short: 'EM',
    lat: 34.0300, lng: -118.4050, meetSpot: 'Palms Park',
    schedule: [{ dows: [0], h: 8, m: 0, label: 'Run-walk 3 mi' }],
    members: 129, beginner: true,
    about: 'Run-walk friendly, built for people who just started.',
    captain: 'Rosa M.', firstTimer: 'Totally new is fine. We start with 1 min run, 1 min walk.',
    groups: [{ pace: 720, usual: 16, actual: '11:48', dropped: 0 }, { pace: 800, usual: 19, actual: '13:10', dropped: 0 }],
    route: ROUTE_GEO.c6.pts, dist: `${ROUTE_GEO.c6.mi} mi`,
    friends: [], going: 34,
  },
  {
    id: 'c7', type: 'club', name: 'Mandeville Hill Repeaters', short: 'HR',
    lat: 34.0722, lng: -118.4932, meetSpot: 'Mandeville Canyon Rd & Sunset',
    schedule: [{ dows: [6], h: 7, m: 0, label: 'Hill repeats' }],
    members: 88, beginner: false,
    about: 'Saturday hill repeats up Mandeville Canyon Rd.',
    captain: 'Elle K.', firstTimer: 'Repeats scale to you. Do as many as feel good.',
    groups: [{ pace: 480, usual: 10, actual: '8:06', dropped: 1 }, { pace: 570, usual: 12, actual: '9:31', dropped: 0 }],
    route: ROUTE_GEO.c7.pts, dist: `${ROUTE_GEO.c7.mi} mi`, friends: [], going: 22,
  },
];

/* ---------- Meets ---------- */
// heats: seeded by mile (or event) time. forPace: there is a heat or event for a runner like you.
const MEETS = [
  {
    id: 'm1', type: 'meet', name: 'Westside Mile Night', series: 'Winter Twilight Series · Meet 2',
    venue: 't2', lat: 34.0171, lng: -118.4729, when: nextDow(5, 18, 30),
    organizer: 'Westside Track Club', fees: '$5 per event · $10 unlimited', registered: 46, cap: 120,
    viaPulse: 31, firstTimers: 22, under22: 18,
    firstTimer: true, unattached: true, seeded: true, forPace: true, lights: true,
    checkIn: 'Check-in opens 6:00 PM at the home straight table',
    events: [
      { name: '3000m', off: 0, n: 12 },
      { name: 'Mile', off: 25, n: 38, heats: [['Heat 1', 'sub-6:00', 0, 360], ['Heat 2', '6:00–7:15', 360, 435], ['Heat 3', '7:15–8:30', 435, 510], ['Heat 4', '8:30+', 510, 9999]] },
      { name: '800m', off: 65, n: 21 },
      { name: '400m', off: 85, n: 24 },
      { name: '4×400m relay', off: 105, n: 6, relay: true },
    ],
    friends: ['kai', 'lena'],
    blurb: 'Low-key evening meet under the lights. Heats are seeded by your time, so you race people at your level.',
  },
  {
    id: 'm2', type: 'meet', name: 'Westside All-Comers', series: 'Presented by Northline Running',
    venue: 't6', lat: 34.0196, lng: -118.3432, when: nextDow(6, 9, 0), sponsored: 'Northline Running',
    organizer: 'SoCal Open Series', fees: '$5 per event · $10 unlimited', registered: 168, cap: 300,
    viaPulse: 74, firstTimers: 51, under22: 63,
    firstTimer: true, unattached: true, seeded: true, forPace: true,
    checkIn: 'Check-in opens 8:15 AM at the north gate',
    events: [
      { name: '100m', off: 0, n: 52 }, { name: '1500m', off: 30, n: 46 },
      { name: '400m', off: 60, n: 37 }, { name: '800m', off: 85, n: 29 }, { name: '3000m', off: 110, n: 22 },
    ],
    friends: [],
    blurb: 'The big monthly all-comers meet with fully automatic timing. Good for chasing a real PR.',
  },
  {
    id: 'm3', type: 'meet', name: 'Bruin Club Time Trial', series: 'Bruin Running Club',
    venue: 't1', lat: 34.0723, lng: -118.4456, when: nextDow(0, 8, 0),
    organizer: 'Bruin Running Club', fees: 'Free for students', registered: 38, cap: 80,
    viaPulse: 12, firstTimers: 6, under22: 30,
    firstTimer: false, unattached: false, seeded: true, forPace: false, fitNote: 'Fast heats only', fitDetail: 'Heats stop at 6:00 mile pace. Not a fit yet.',
    checkIn: 'Check-in 7:30 AM at the Drake gate',
    events: [{ name: '1600m', off: 0, n: 24, heats: [['Heat 1', 'sub-5:00', 0, 300], ['Heat 2', '5:00–6:00', 300, 360]] }, { name: '5000m', off: 30, n: 14 }],
    friends: ['kai'],
    blurb: 'Fast, fully timed time trial for UCLA students and alumni. Heats stop at 6:00 mile pace.',
  },
  {
    id: 'm5', type: 'meet', name: 'Westside Mile Night', series: 'Winter Twilight Series · Meet 3',
    venue: 't2', lat: 34.0171, lng: -118.4729, when: nextDow(5, 18, 30, 8),
    organizer: 'Westside Track Club', fees: '$5 per event · $10 unlimited', registered: 19, cap: 120,
    viaPulse: 14, firstTimers: 9, under22: 7,
    firstTimer: true, unattached: true, seeded: true, forPace: true, lights: true,
    checkIn: 'Check-in opens 6:00 PM at the home straight table',
    events: [
      { name: '3000m', off: 0, n: 4 },
      { name: 'Mile', off: 25, n: 11, heats: [['Heat 1', 'sub-6:00', 0, 360], ['Heat 2', '6:00–7:15', 360, 435], ['Heat 3', '7:15–8:30', 435, 510], ['Heat 4', '8:30+', 510, 9999]] },
      { name: '800m', off: 65, n: 6 }, { name: '400m', off: 85, n: 8 },
    ],
    friends: [],
    blurb: 'Next stop in the winter series. Pre-register to keep your seed.',
  },
  {
    id: 'm12', type: 'meet', name: 'Corsair Twilight Time Trial', series: 'Weekly time trial',
    venue: 't2', lat: 34.0159, lng: -118.4711, when: tonightOr(19, 30), lights: true,
    organizer: 'Westside Track Club', fees: '$5 · pay at the table', registered: 23, cap: 60,
    viaPulse: 12, firstTimers: 8, under22: 10,
    firstTimer: true, unattached: true, seeded: true, forPace: true,
    checkIn: 'Sign in at the home straight table from 7:00 PM',
    events: [{ name: '1600m', off: 0, n: 15 }, { name: '3200m', off: 20, n: 8 }],
    friends: [],
    blurb: 'A quick, timed 1600 or 3200 under the lights. Show up, sign in, run, done by 8:15.',
  },
  {
    id: 'm6', type: 'meet', name: 'Culver Distance Night', series: 'Culver City Running Co. · Winter Series',
    venue: 't5', lat: 34.0102, lng: -118.3948, when: nextDow(4, 18, 30), lights: true,
    organizer: 'Culver City Running Co.', fees: '$5 per event · $10 unlimited', registered: 34, cap: 90,
    viaPulse: 19, firstTimers: 11, under22: 9,
    firstTimer: true, unattached: true, seeded: true, forPace: true,
    checkIn: 'Check-in opens 6:00 PM by the scoreboard',
    events: [{ name: '800m', off: 0, n: 14 }, { name: '1500m', off: 20, n: 17 }, { name: '3000m', off: 45, n: 12 }, { name: '5000m', off: 70, n: 9 }],
    friends: [],
    blurb: 'Distance-only night under the lights. Pacers in every heat of the 3000 and 5000.',
  },
  {
    id: 'm7', type: 'meet', name: 'Venice Beach Mile', series: 'Road mile · Ocean Front Walk',
    venue: null, place: 'Ocean Front Walk, Venice', lat: 33.9908, lng: -118.4775, when: nextDow(6, 7, 30), road: true,
    organizer: 'Venice Run Club', fees: '$20 · includes coffee', registered: 212, cap: 400,
    viaPulse: 63, firstTimers: 80, under22: 41,
    firstTimer: true, unattached: true, seeded: true, forPace: true,
    checkIn: 'Bib pickup 6:45 AM at the Windward Ave circle',
    events: [{ name: 'Mile · open', off: 0, n: 120 }, { name: 'Mile · sub-6 elite', off: 25, n: 28 }, { name: 'Kids half mile', off: 45, n: 64 }],
    friends: ['lena'],
    blurb: 'Flat, fast, straight down the boardwalk. Waves are seeded by your predicted mile.',
  },
  {
    id: 'm8', type: 'meet', name: 'Rancho Sprint Series', series: 'SoCal Sprint League · Meet 4',
    venue: 't6', lat: 34.0184, lng: -118.3409, when: nextDow(0, 10, 0), lights: true,
    organizer: 'SoCal Sprint League', fees: '$5 per event', registered: 88, cap: 160,
    viaPulse: 22, firstTimers: 14, under22: 52,
    firstTimer: false, unattached: true, seeded: true, forPace: false, fitNote: 'Sprints only', fitDetail: 'Sprints only, 60m to 400m. Not a fit for your mile pace yet.',
    checkIn: 'Check-in 9:15 AM at the north gate',
    events: [{ name: '60m', off: 0, n: 30 }, { name: '100m', off: 20, n: 41 }, { name: '200m', off: 50, n: 33 }, { name: '400m', off: 80, n: 22 }],
    friends: [],
    blurb: 'Sprints only, fully automatic timing and block starts. Ex-sprinters, this one is for you.',
  },
  {
    id: 'm9', type: 'meet', name: 'Uni High Relay Carnival', series: 'Community relays · teams of 4',
    venue: 't4', lat: 34.0424, lng: -118.4566, when: nextDow(2, 18, 0),
    organizer: 'Uni High Boosters', fees: '$20 per team', registered: 64, cap: 160,
    viaPulse: 27, firstTimers: 30, under22: 21,
    firstTimer: true, unattached: true, seeded: false, forPace: true,
    checkIn: 'Team check-in 5:30 PM by the pool gate',
    events: [{ name: '4×100m', off: 0, n: 12, relay: true }, { name: '4×400m', off: 30, n: 9, relay: true }, { name: 'Distance medley', off: 60, n: 6, relay: true }],
    friends: ['ari'],
    blurb: 'No team? Enter solo and Pulse matches you with three runners at your pace.',
  },
  {
    id: 'm10', type: 'meet', name: 'Drake Night of 1500s', series: 'Bruin Running Club · open to the public',
    venue: 't1', lat: 34.0709, lng: -118.4475, when: nextDow(1, 19, 0), lights: true,
    organizer: 'Bruin Running Club', fees: '$5 · free with UCLA ID', registered: 57, cap: 100,
    viaPulse: 21, firstTimers: 18, under22: 40,
    firstTimer: true, unattached: true, seeded: true, forPace: true,
    checkIn: 'Check-in 6:30 PM at Drake gate B',
    events: [{ name: '1500m', off: 0, n: 57 }],
    friends: ['kai', 'ari'],
    blurb: 'Six heats of 1500 meters, slowest to fastest, and the crowd stays for all of them.',
  },
  {
    id: 'm11', type: 'meet', name: 'Ballona Creek 10K', series: 'Road race · car-free creek path',
    venue: null, place: 'Ballona Creek Path, Culver City', lat: 34.0150, lng: -118.3985, when: nextDow(0, 8, 0, 8), road: true,
    organizer: 'Westside Road Runners', fees: '$40 10K · $25 5K', registered: 341, cap: 600,
    viaPulse: 70, firstTimers: 96, under22: 58,
    firstTimer: true, unattached: true, seeded: false, forPace: true,
    checkIn: 'Bib pickup 7:00 AM at Syd Kronenthal Park',
    events: [{ name: '10K', off: 0, n: 210 }, { name: '5K', off: 15, n: 131 }],
    friends: [],
    blurb: 'Flat and fast to the ocean and back. Pacers every 30 seconds from 7:00 to 11:00 per mile.',
  },
];

// Thanksgiving-morning road mile, only when it is actually this week
(() => {
  const tg = thanksgiving(NOW.getFullYear());
  const days = Math.round((new Date(tg).setHours(0, 0, 0, 0) - TODAY) / 864e5);
  if (days >= 0 && days <= 7) {
    MEETS.push({
      id: 'm4', type: 'meet', name: 'Westwood Turkey Trot', series: 'Thanksgiving morning · road race',
      venue: null, place: 'Westwood Village', lat: 34.0598, lng: -118.4440, when: tg, road: true,
      organizer: 'Westwood Village BID', fees: '$35 5K · $20 1 mile', registered: 620, cap: 900,
      viaPulse: 88, firstTimers: 210, under22: 140,
      firstTimer: true, unattached: true, seeded: false, forPace: true,
      checkIn: 'Bib pickup 7:00 AM on Broxton Ave',
      events: [{ name: '5K', off: 0, n: 470 }, { name: '1 mile', off: 45, n: 150 }],
      friends: ['lena', 'ari'],
      blurb: 'Closed-road loop through Westwood Village before the holiday.',
    });
  }
})();

/* ---------- People (list only; never pinned on the map) ---------- */
const PARTNERS = [
  { id: 'p1', type: 'partner', name: 'Jordan Lee', initials: 'JL', hue: 30, pace: 615, focus: '5K',
    bio: 'UCLA ’29 · new to LA · ran JV cross country', week: '18 mi/wk', usual: 'Mornings around 7',
    proof: 'Ran the Westwood loop 3× this month at 10:08', area: 'Westwood', lat: 34.0560, lng: -118.4330,
    slots: [{ d: 1, h: 7, m: 0, what: '5 mi easy · Westwood loop' }, { d: 3, h: 7, m: 30, what: '6 mi easy · San Vicente' }], level: 'casual' },
  { id: 'p2', type: 'partner', name: 'Sofia Ramirez', initials: 'SR', hue: 190, pace: 690, focus: 'First 5K',
    bio: 'New to running · first 5K in January', week: '9 mi/wk', usual: 'Weekday evenings',
    proof: 'Ran 4 times in the last 2 weeks · longest 3.2 mi', area: 'Palms', lat: 34.0350, lng: -118.4300,
    slots: [{ d: 1, h: 18, m: 30, what: '3 mi run-walk · Palms Park' }, { d: 4, h: 9, m: 0, what: '3 mi easy · Ballona Creek' }], level: 'new' },
  { id: 'p3', type: 'partner', name: 'Dev Patel', initials: 'DP', hue: 55, pace: 585, focus: 'LA Half',
    bio: 'Training for the LA half · early mornings', week: '28 mi/wk', usual: '6–7 AM',
    proof: 'Long run 11 mi last Sunday at 9:52', area: 'Santa Monica', lat: 34.0150, lng: -118.4650,
    slots: [{ d: 1, h: 6, m: 30, what: 'Tempo 3 mi · Rancho Cienega' }, { d: 4, h: 7, m: 0, what: '10 mi long · beach path' }], level: 'casual' },
  { id: 'p4', type: 'partner', name: 'Priya Shah', initials: 'PS', hue: 280, pace: 480, focus: '800m / Mile',
    bio: 'Former high school miler (5:12) · getting back into racing', week: '24 mi/wk', usual: 'Track evenings',
    proof: 'Mile best effort 5:41 this fall', area: 'West LA', lat: 34.0480, lng: -118.4600,
    slots: [{ d: 2, h: 18, m: 30, what: '4 × 800m · SMC' }], level: 'hs' },
];

/* ---------- Popular routes (geometry from ROUTE_GEO, routed along real paths) ---------- */
const ROUTES = [
  { id: 'r1', name: 'UCLA Campus Loop', area: 'Westwood', athletes: 1840, gain: 180, surface: 'Paved, rolling', best: 'Before 8 AM or after 7 PM', note: 'The loop most UCLA runners start with. Lit on the north side.' },
  { id: 'r2', name: 'San Vicente Median', area: 'Brentwood', athletes: 3120, gain: 240, surface: 'Grass median, out and back', best: 'Weekend mornings', note: 'Soft grass under coral trees, the Westside long-run classic.' },
  { id: 'r3', name: 'Beach Path: Pier to Marina', area: 'Santa Monica · Venice', athletes: 4410, gain: 20, surface: 'Flat bike path', best: 'Sunrise, before the crowds', note: 'Shared with bikes. Stay right and run on the walking side.' },
  { id: 'r4', name: 'Ballona Creek Path', area: 'Culver City · Marina', athletes: 1270, gain: 30, surface: 'Flat, car-free', best: 'Any time in daylight', note: 'Car-free creek path to the ocean. Few water stops.' },
  { id: 'r5', name: 'Baldwin Hills Overlook', area: 'Culver City', athletes: 960, gain: 520, surface: 'Stairs + trail', best: 'Early, it gets hot', note: '282 stairs to the top, then the loop around the overlook.' },
].map(r => ({ ...r, type: 'route', route: ROUTE_GEO[r.id].pts, mi: ROUTE_GEO[r.id].mi, lat: ROUTE_GEO[r.id].pts[0][0], lng: ROUTE_GEO[r.id].pts[0][1] }));
