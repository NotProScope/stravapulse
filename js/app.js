'use strict';
/* =====================================================================
   Strava Pulse
   One map for meets, public tracks, club runs and track workouts,
   sorted by the DAY you can show up and filtered by YOUR PACE.
   Plain JS + Leaflet, no build step. Sections:
     1. Utilities & state        6. Bottom sheet
     2. Icons                    7. Detail pages
     3. Time, pace & plans       8. Flows (plan week, register, propose, results)
     4. Shared render helpers    9. Home / Groups / You / Workout
     5. Map                     10. Actions & boot
===================================================================== */

/* ============ 1. Utilities & state ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOUR = 36e5, MIN = 6e4;
const pad2 = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = name => name.split(' ')[0];

const STORE_KEY = 'strava-pulse-v3';
const freshState = () => ({
  personalized: false, background: null, want: null,
  band: 60, layer: 'all', day: 0, part: 'all',
  plans: [], regs: {}, reports: {}, follows: {}, kudos: {}, results: [], activities: [],
  mySessions: [], discoverable: false, challenges: {}, chats: {}, saved: {}, target: null,
});
function loadState() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return Object.assign(freshState(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  return freshState();
}
let S = loadState();
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
const U = { tab: 'home', sel: null, stack: [], selEvents: {}, rec: null, groupsTab: 'clubs', lastPace: null };

/* formatting */
const fmtPace = s => { const t = Math.round(s); return `${Math.floor(t / 60)}:${pad2(t % 60)}`; }; // round first so 10:59.6 shows 11:00, not 10:60
function fmtClock(d) { let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad2(m)} ${ap}`; }
function fmtShort(d) { let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}${m ? ':' + pad2(m) : ''} ${ap}`; }
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayDiff = d => Math.round((startOfDay(d) - TODAY) / 864e5);
function fmtDay(d) {
  const dd = dayDiff(d);
  if (dd === 0) return d.getHours() >= 17 ? 'Tonight' : 'Today';
  if (dd === 1) return 'Tomorrow';
  if (dd > 1 && dd < 7) return DAY_FULL[d.getDay()];
  return `${DAY[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
}
const fmtWhen = d => `${fmtDay(d)} · ${fmtClock(d)}`;
const fmtDate = d => `${DAY[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
function fmtHour(h) { const ap = h >= 12 && h < 24 ? 'p' : 'a'; return `${h % 12 || 12}${ap}`; }
function fmtDur(sec) { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`; }
function miles(a, b) {
  const R = 3958.8, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distTxt = it => `${miles(ME.home, it).toFixed(1)} mi`;
// How you'd get there: jog if it's a warm-up distance, otherwise drive (LA evening traffic)
function travel(it, when) {
  const mi = miles(ME.home, it);
  const jog = mi <= 1.6;
  const mins = jog ? Math.round(mi * ME.pace / 60) : Math.round(6 + mi * 3.1);
  const buffer = it.type === 'meet' ? 25 : 5;
  const leave = when ? new Date(+when - (mins + buffer) * MIN) : null;
  return { mi, mins, mode: jog ? 'jog' : 'drive', leave };
}
function travelText(it, when) {
  const t = travel(it, when);
  const how = `${t.mins} min ${t.mode}`;
  if (!t.leave) return how;
  return t.leave < NOW ? `${how} · leave now` : `Leave by ${fmtClock(t.leave)} · ${how}`;
}

let toastTimer;
function toast(msg, icon = 'check', ms = 2800) {
  const t = $('#toast');
  t.innerHTML = `${ic(icon, 18, 2.2)}<span>${msg}</span>`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ============ 2. Icons — one outline set, 24 grid ============ */
const IC = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z"/>',
  maps: '<path d="M3 20l5-9 4 5 3-4 6 8z"/><circle cx="16" cy="6" r="2.6"/>',
  record: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
  groups: '<path d="M8 4l5 7-5 7-5-7zM16 4l5 7-5 7-5-7z"/>',
  you: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 16v-3M12 16v-6M15 16v-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chat: '<path d="M4 5h11a2 2 0 012 2v6a2 2 0 01-2 2H9l-4 3v-3H4a2 2 0 01-2-2V7a2 2 0 012-2z"/><path d="M19 9h1a2 2 0 012 2v5a2 2 0 01-2 2h-1v2l-3-2h-4"/>',
  bell: '<path d="M6 17V11a6 6 0 0112 0v6l1.5 2h-15zM10 21h4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  flag: '<path d="M5.5 21V3.5"/><rect x="5.5" y="4" width="13" height="9" rx="1"/><path fill="currentColor" stroke="none" d="M5.5 4h4.33v3H5.5zM14.17 4h4.33v3h-4.33zM9.83 7h4.34v3H9.83zM5.5 10h4.33v3H5.5zM14.17 10h4.33v3h-4.33z"/>',
  track: '<rect x="2.5" y="6" width="19" height="12" rx="6"/><rect x="7" y="9.6" width="10" height="4.8" rx="2.4"/>',
  club: '<circle cx="9" cy="8.3" r="3"/><circle cx="16.9" cy="9.4" r="2.4"/><path d="M3.4 19.6c.5-3.3 2.7-5.3 5.6-5.3s5.1 2 5.6 5.3"/><path d="M15.3 14.5c2.7-.4 4.8 1.5 5.4 4.5"/>',
  person: '<circle cx="12" cy="7.6" r="3.6"/><path d="M4.8 20.2c.9-4 3.6-6.4 7.2-6.4s6.3 2.4 7.2 6.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.2a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.5"/>',
  car: '<path d="M4 16.5V12l2-5.2A2 2 0 017.9 5.5h8.2a2 2 0 011.9 1.3L20 12v4.5"/><path d="M3 16.5h18M6.5 19.5v-3M17.5 19.5v-3M4 12h16"/>',
  run: '<circle cx="14.5" cy="4.5" r="1.8"/><path d="M8.5 21l2.7-5.6 3 2.6v4"/><path d="M6 12.6l2.8-3.4h4.5l2.6 3.1 3 .9"/><path d="M11.2 9.3l-.9 6.2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 017.7-1.5"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.7 10.7c.7.6 1.2 1.4 1.2 2.3h5c0-.9.5-1.7 1.2-2.3A6 6 0 0012 3z"/>',
  gate: '<path d="M4 21V5a2 2 0 012-2h8v18"/><path d="M14 12h7M18 9l3 3-3 3"/>',
  lanes: '<path d="M3.5 20c0-8.5 3.8-16 8.5-16s8.5 7.5 8.5 16"/><path d="M8 20c0-6 1.8-11.5 4-11.5S16 14 16 20"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4.6-3.2 8.2-7 9.5-3.8-1.3-7-4.9-7-9.5V6z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  chart: '<path d="M5 20V11M12 20V4M19 20v-7"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20h7"/>',
  route: '<circle cx="6" cy="17.5" r="2"/><circle cx="18" cy="6.5" r="2"/><path d="M6 15.5V9.5a3 3 0 013-3h3M18 8.5v6a3 3 0 01-3 3h-3"/>',
  thumb: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.2 7A2 2 0 0117.3 20H7"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M10 3h4"/>',
  nav: '<path d="M12 3l7 18-7-4-7 4z" transform="rotate(45 12 12)"/>',
  seedling: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 15c0-3-2.3-5-5.5-5 0 3 2.3 5 5.5 5z"/>',
};
const ic = (n, s = 20, w = 1.8) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const glyphAt = (n, x, y, s) => `<svg class="glyph" x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
const TYPE_IC = { meet: 'flag', track: 'track', club: 'club', session: 'bolt', partner: 'person', route: 'route' };
const TYPE_LABEL = { meet: 'Meet', track: 'Public track', club: 'Club run', session: 'Track workout', partner: 'Runner', route: 'Popular route' };

/* ============ 3. Time, pace & plans ============ */
function windowFor(day, part) {
  let start = day === 0 ? NOW : at(day, 0), end = at(day, 23, 59);
  if (part === 'am') end = at(day, 12);
  if (part === 'pm' && start < at(day, 12)) start = at(day, 12);
  return { start, end, empty: start >= end };
}
const curWin = () => windowFor(S.day, S.part);
function dayTitle(day = S.day, part = S.part) {
  const d = at(day, 12);
  if (day === 0) return part === 'am' ? 'This morning' : NOW.getHours() >= 17 ? 'Tonight' : 'Today';
  const name = day === 1 ? 'Tomorrow' : DAY_FULL[d.getDay()];
  return part === 'am' ? `${name} AM` : part === 'pm' ? `${name} PM` : name;
}

const allSessions = () => [...SESSIONS, ...S.mySessions.map(s => ({ ...s, when: new Date(s.when), mine: true }))];
const allEvents = () => [...MEETS, ...CLUBS, ...allSessions()];
const mapItems = () => [...MEETS, ...TRACKS, ...CLUBS, ...ROUTES];
const trackOf = id => TRACKS.find(t => t.id === id);
const byId = id => [...MEETS, ...TRACKS, ...CLUBS, ...ROUTES, ...allSessions(), ...PARTNERS].find(x => x.id === id) || FRIENDS[id];

function occurrences(it, start, end) {
  const out = [];
  if (it.type === 'meet' || it.type === 'session') { if (it.when >= start && it.when <= end) out.push(it.when); }
  else if (it.type === 'club') {
    const a = Math.max(0, dayDiff(start)), b = Math.min(45, dayDiff(end));
    for (let off = a; off <= b; off++) for (const s of it.schedule) {
      const d = at(off, s.h, s.m || 0);
      if (s.dows.includes(d.getDay()) && d >= start && d <= end && d > new Date(+NOW - 20 * MIN)) out.push(d);
    }
  } else if (it.type === 'track') {
    const a = Math.max(0, dayDiff(start)), b = Math.min(45, dayDiff(end));
    for (let off = a; off <= b; off++) for (const [h1, h2] of it.slots) {
      const s = at(off, h1), e = at(off, h2);
      if (e > start && s < end) out.push(s < start ? start : s);
    }
  }
  return out.sort((x, y) => x - y);
}
const nextOcc = it => occurrences(it, new Date(+NOW - 20 * MIN), at(45, 23, 59))[0] || null;
const schedFor = (c, d) => c.schedule.find(s => s.dows.includes(d.getDay()) && s.h === d.getHours()) || c.schedule[0];

function trackOpenAt(t, d) { const h = d.getHours() + d.getMinutes() / 60; return t.slots.some(([a, b]) => h >= a && h < b); }
function trackStatus(t) {
  const h = NOW.getHours() + NOW.getMinutes() / 60;
  const slot = t.slots.find(([a, b]) => h >= a && h < b);
  if (slot) return { open: true, text: `Open until ${fmtHour(slot[1])}`, until: slot[1] };
  const n = nextOcc(t);
  return { open: false, text: n ? `Opens ${dayDiff(n) === 0 ? fmtShort(n) : fmtWhen(n)}` : 'Closed' };
}
function lanesAt(t, d) {
  if (!trackOpenAt(t, d)) return 0;
  return Math.abs(d - NOW) < 2.5 * HOUR ? t.liveLanes : t.crowd[d.getHours()];
}
const crowdWord = l => (l <= 1 ? 'Quiet' : l <= 3 ? 'Light' : l <= 5 ? 'Busy' : 'Packed');
const sessionsAt = (tid, start, end) => allSessions().filter(s => s.track === tid && s.when >= start && s.when <= end).sort((a, b) => a.when - b.when);

// The pace the lens matches against: one you typed in, or your easy pace from recent runs
const tgt = () => S.target || ME.pace;
function paceOK(it) {
  if (!S.band) return true;
  if (it.type === 'club') return !it.sprint && it.groups.some(g => g.pace && Math.abs(g.pace - tgt()) <= S.band);
  if (it.type === 'meet' || it.type === 'session') return !!it.forPace || !!it.mine;
  if (it.type === 'track') {
    const w = curWin();
    return (trackOpenAt(it, NOW) && S.day === 0 && it.atPaceNow >= 3) || sessionsAt(it.id, w.start, w.end).some(s => s.forPace);
  }
  if (it.type === 'partner') return Math.abs(it.pace - tgt()) <= S.band + 30;
  return true;
}
const friendsOf = it => (it.friends || []).map(k => FRIENDS[k]).filter(Boolean);

/* plans: everything you've said yes to */
const planOf = ref => S.plans.find(p => p.ref === ref || p.track === ref);
function addPlan(p) { S.plans = S.plans.filter(x => x.id !== p.id); S.plans.push(p); save(); }
function removePlan(id) { S.plans = S.plans.filter(x => x.id !== id); save(); }
const plansSorted = () => S.plans.map(p => ({ ...p, date: new Date(p.when) })).filter(p => p.date > new Date(+NOW - 3 * HOUR)).sort((a, b) => a.date - b.date);

function status(it) {
  if (it.type === 'route') return { occ: [], inWin: true, pace: true, plan: false, state: 'route', soon: false };
  const w = curWin();
  const occ = w.empty ? [] : occurrences(it, w.start, w.end);
  const inWin = occ.length > 0;
  const pace = paceOK(it);
  const plan = it.type === 'track' ? S.plans.some(p => p.track === it.id && occ.length && sameDay(new Date(p.when), occ[0])) : S.plans.some(p => p.ref === it.id && occ.some(o => +o === +new Date(p.when)));
  const state = !inWin ? 'out' : plan ? 'plan' : pace ? 'on' : 'off';
  const soon = inWin && occ[0] - NOW < HOUR && occ[0] >= new Date(+NOW - 10 * MIN) && it.type !== 'track';
  return { occ, inWin, pace, plan, state, soon };
}
const sameDay = (a, b) => dayDiff(a) === dayDiff(b);

function eventsIn(w, opts = {}) {
  if (w.empty) return [];
  return allEvents().filter(e => {
    if (opts.layer && opts.layer !== 'all') {
      const t = e.type === 'session' ? 'track' : e.type;
      if (t !== opts.layer) return false;
    }
    return occurrences(e, w.start, w.end).length;
  });
}
const tracksOpenIn = w => (w.empty ? [] : TRACKS.filter(t => occurrences(t, w.start, w.end).length));

/* ============ 4. Shared render helpers ============ */
const av = (p, cls = 'sm', tap = true) => {
  const inner = esc(p.initials);
  const id = p.id && (FRIENDS[p.id] || PARTNERS.some(x => x.id === p.id)) ? p.id : null;
  return tap && id ? `<button class="avatar ${cls}" style="--h:${p.hue}" data-action="person" data-id="${id}" aria-label="${esc(p.name)}">${inner}</button>`
    : `<span class="avatar ${cls}" style="--h:${p.hue}">${inner}</span>`;
};
const avStack = (list, cls = 'xs', tap = false) => (list.length ? `<span class="avatars">${list.map(f => av(f, cls, tap)).join('')}</span>` : '');
const tagHtml = (t, c = '') => `<span class="tag ${c}">${t}</span>`;
function tile(it, state) {
  if (it.type === 'partner') return av(it, '', false);
  const cls = state === 'on' ? 'on' : state === 'plan' ? 'plan' : '';
  const shape = it.type === 'session' ? 'track' : it.type;
  return `<span class="tile ${shape} ${cls}">${ic(TYPE_IC[it.type], 20, 2)}</span>`;
}
function going(it) {
  const f = friendsOf(it);
  const n = it.type === 'meet' ? it.registered : it.going || 0;
  if (!f.length) return `${n} going`;
  return `${f.map(x => first(x.name)).join(' & ')} + ${n - f.length} going`;
}
function heatFor(m, ev = 'Mile') {
  const e = m.events.find(x => x.name === ev || (ev === 'Mile' && x.name === '1600m'));
  if (!e || !e.heats) return null;
  const t = ME.predict.Mile;
  const h = e.heats.find(([, , lo, hi]) => t >= lo && t < hi);
  return h ? { name: h[0], range: h[1], ev: e.name } : null;
}
function eventTime(m, e) { return new Date(+m.when + e.off * MIN); }
function defaultEvents(m) {
  if (m.road) return [m.events[0].name];
  const names = m.events.map(e => e.name);
  const pick = [];
  const mid = names.find(n => ['Mile', '1600m', '1500m'].includes(n));
  if (mid) pick.push(mid);
  if (S.background === 'hs' && names.includes('400m')) pick.push('400m');
  if (!pick.length) pick.push(names[0]);
  return pick;
}

function routeSvg(coords, w = 358, h = 180, opts = {}) {
  const lats = coords.map(c => c[0]), lngs = coords.map(c => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const k = Math.cos(minLat * Math.PI / 180), p = opts.pad || 26;
  const sx = (maxLng - minLng) * k || 1e-4, sy = (maxLat - minLat) || 1e-4;
  const sc = Math.min((w - 2 * p) / sx, (h - 2 * p) / sy);
  const ox = (w - sx * sc) / 2, oy = (h - sy * sc) / 2;
  const P = ([la, ln]) => [ox + (ln - minLng) * k * sc, h - (oy + (la - minLat) * sc)];
  const d = coords.map((c, i) => `${i ? 'L' : 'M'}${P(c)[0].toFixed(1)} ${P(c)[1].toFixed(1)}`).join(' ');
  const [x0, y0] = P(coords[0]);
  let streets = '';
  for (let i = -2; i < 12; i++) streets += `<path d="M-10 ${i * 26} L${w + 10} ${i * 26 + 44}" stroke="#161c29" stroke-width="${i % 3 ? 1 : 3}"/>`;
  for (let i = 0; i < 14; i++) streets += `<path d="M${i * 34} -10 L${i * 34 - 30} ${h + 10}" stroke="#161c29" stroke-width="${i % 4 ? 1 : 3}"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="${w}" height="${h}" fill="#0b0e16"/>${streets}<path d="${d}" fill="none" stroke="#fc5200" stroke-opacity=".25" stroke-width="12" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fc5200" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x0}" cy="${y0}" r="7" fill="#fff" stroke="#fc5200" stroke-width="3"/></svg>`;
}
function ovalSvg(lit, w = 220, h = 130, color = '#fc5200') {
  let s = `<svg viewBox="0 0 220 130" width="${w}" height="${h}" aria-hidden="true"><rect x="2" y="2" width="216" height="126" rx="63" fill="#0d0d10" stroke="#222"/>`;
  for (let i = 0; i < 8; i++) {
    const inset = 8 + i * 5.2, lane = 7 - i, on = lane < lit;
    s += `<rect x="${inset}" y="${inset}" width="${220 - 2 * inset}" height="${130 - 2 * inset}" rx="${65 - inset}" fill="none" stroke="${on ? color : '#26262b'}" stroke-width="3.4"/>`;
  }
  return s + `<rect x="58" y="58" width="104" height="14" rx="7" fill="#17171b"/></svg>`;
}
function laneArt() {
  let s = '<svg viewBox="0 0 390 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">';
  for (let i = 0; i < 8; i++) {
    const r = 210 + i * 18;
    s += `<path d="M ${-40} ${260 - i * 2} A ${r} ${r} 0 0 1 ${440} ${30 + i * 20}" fill="none" stroke="${i === 3 ? 'rgba(252,82,0,.85)' : 'rgba(255,255,255,.07)'}" stroke-width="${i === 3 ? 3 : 2}"/>`;
  }
  s += '<path d="M300 0 L300 260" stroke="rgba(255,255,255,.5)" stroke-width="3" stroke-dasharray="8 8"/></svg>';
  return s;
}

/* ============ 5. Map ============ */
let map = null, heat = null, markers = {}, overlay = null, weekLayer = null;

/* ---- Heatmap: every real street and trail (OpenStreetMap), weighted by how much people run it ---- */
const merc = (lat, lng) => [lng / 360 + 0.5, 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI)];
const HEAT_WAYS = (() => {
  if (typeof STREETS === 'undefined') return [];
  const [lat0, lng0] = STREETS.o, q = STREETS.q;
  return STREETS.w.map(row => {
    const n = (row.length - 1) / 2, xy = new Float64Array(n * 2);
    let la = row[1], ln = row[2], x0 = 1, y0 = 1, x1 = 0, y1 = 0, sLat = 0, sLng = 0;
    for (let i = 0; i < n; i++) {
      if (i) { la += row[1 + i * 2]; ln += row[2 + i * 2]; }
      const lat = lat0 + la / q, lng = lng0 + ln / q, [x, y] = merc(lat, lng);
      xy[i * 2] = x; xy[i * 2 + 1] = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      sLat += lat; sLng += lng;
    }
    return { w: row[0] / 100, xy, bb: [x0, y0, x1, y1], lat: sLat / n, lng: sLng / n };
  });
})();
const HEAT_LEVELS = 9;
function heatColor(t, a) { // deep red → Strava orange → amber
  const r = Math.round(140 + 115 * Math.min(1, t * 1.5)), g = Math.round(24 + 150 * Math.max(0, t - 0.22)), b = Math.round(6 + 70 * Math.max(0, t - 0.65));
  return `rgba(${r},${g},${b},${a})`;
}
const HeatLayer = window.L ? L.Layer.extend({
  onAdd(map) {
    this._map = map;
    this._c = L.DomUtil.create('canvas', 'heat-canvas leaflet-zoom-animated');
    map.getPane('heat').appendChild(this._c);
    this._boost = new Float32Array(HEAT_WAYS.length);
    this._key = '';
    map.on('moveend zoomend resize viewreset', this._reset, this);
    map.on('zoomanim', this._anim, this);
    this._reset();
  },
  onRemove(map) {
    L.DomUtil.remove(this._c);
    map.off('moveend zoomend resize viewreset', this._reset, this);
    map.off('zoomanim', this._anim, this);
  },
  _anim(e) {
    const m = this._map;
    L.DomUtil.setTransform(this._c, m._latLngBoundsToNewLayerBounds(m.getBounds(), e.zoom, e.center).min, m.getZoomScale(e.zoom));
  },
  _reset() {
    const m = this._map, size = m.getSize(), dpr = Math.min(2, window.devicePixelRatio || 1);
    L.DomUtil.setPosition(this._c, m.containerPointToLayerPoint([0, 0]));
    this._c.width = size.x * dpr; this._c.height = size.y * dpr;
    this._c.style.width = size.x + 'px'; this._c.style.height = size.y + 'px';
    this._dpr = dpr;
    this.draw();
  },
  // Streets around what's happening in the chosen window glow brighter, and animate when it changes
  setHot(points) {
    const key = points.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)},${p.a}`).join('|');
    if (key === this._key) return;
    this._key = key;
    const to = new Float32Array(HEAT_WAYS.length);
    for (const p of points) {
      const kx = 111320 * Math.cos(p.lat * Math.PI / 180), lim = 9 * p.r * p.r;
      for (let i = 0; i < HEAT_WAYS.length; i++) {
        const w = HEAT_WAYS[i], dx = (w.lng - p.lng) * kx, dy = (w.lat - p.lat) * 111320, d2 = dx * dx + dy * dy;
        if (d2 < lim) to[i] += p.a * Math.exp(-d2 / (2 * p.r * p.r));
      }
    }
    const from = this._boost.slice(), t0 = performance.now();
    cancelAnimationFrame(this._raf);
    const step = t => {
      const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      for (let i = 0; i < to.length; i++) this._boost[i] = from[i] + (to[i] - from[i]) * e;
      this.draw();
      if (k < 1) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  },
  draw() {
    const m = this._map, c = this._c;
    if (!m || !c || !c.width) return;
    const ctx = c.getContext('2d'), dpr = this._dpr, W = c.width / dpr, H = c.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    const z = m.getZoom(), ws = 256 * Math.pow(2, z), nw = m.project(m.containerPointToLatLng([0, 0]), z);
    const pad = 30 / ws, vx0 = nw.x / ws - pad, vy0 = nw.y / ws - pad, vx1 = (nw.x + W) / ws + pad, vy1 = (nw.y + H) / ws + pad;
    const buckets = Array.from({ length: HEAT_LEVELS }, () => []);
    for (let i = 0; i < HEAT_WAYS.length; i++) {
      const w = HEAT_WAYS[i], b = w.bb;
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
      const v = Math.min(0.999, w.w + this._boost[i]);
      buckets[Math.floor(v * HEAT_LEVELS)].push(w);
    }
    const core = Math.max(0.75, Math.min(2.8, 0.75 + (z - 12) * 0.5));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    const trace = list => {
      ctx.beginPath();
      for (const w of list) {
        const xy = w.xy;
        ctx.moveTo(xy[0] * ws - nw.x, xy[1] * ws - nw.y);
        for (let j = 2; j < xy.length; j += 2) ctx.lineTo(xy[j] * ws - nw.x, xy[j + 1] * ws - nw.y);
      }
    };
    for (let lv = 0; lv < HEAT_LEVELS; lv++) {
      const list = buckets[lv];
      if (!list.length) continue;
      const t = (lv + 0.5) / HEAT_LEVELS;
      trace(list);
      // quiet streets stay a faint ember; popular corridors burn hot with a glow and a white core
      if (t > 0.42) { ctx.strokeStyle = `rgba(252,82,0,${0.03 + (t - 0.4) * 0.22})`; ctx.lineWidth = core * (3 + t * 6); ctx.stroke(); }
      ctx.strokeStyle = heatColor(t, t < 0.35 ? 0.07 + t * 0.32 : 0.16 + t * 0.66); ctx.lineWidth = core * (0.65 + t * 1.6); ctx.stroke();
      if (t > 0.6) { ctx.strokeStyle = `rgba(255,240,220,${Math.min(0.9, (t - 0.55) * 1.7)})`; ctx.lineWidth = core * 0.6; ctx.stroke(); }
    }
  },
}) : null;

function initMap() {
  if (map) return;
  if (!window.L) { $('#map').innerHTML = '<div class="empty" style="padding-top:220px">Map tiles need an internet connection.</div>'; return; }
  map = L.map('map', { zoomControl: false, attributionControl: true, zoomSnap: 0.25, minZoom: 10, maxZoom: 17 });
  map.attributionControl.setPosition('bottomleft').setPrefix(false);
  const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
  L.tileLayer(esri + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 17, maxNativeZoom: 16, attribution: 'Tiles © Esri, HERE, Garmin, © OpenStreetMap contributors' }).addTo(map);
  L.tileLayer(esri + 'World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 17, maxNativeZoom: 16, opacity: 0.4 }).addTo(map);

  // Strava-style global heatmap over every real street and trail
  map.createPane('heat').style.zIndex = 350;
  map.getPane('heat').classList.add('leaflet-heat-pane');
  homeView(false);
  heat = new HeatLayer().addTo(map);

  overlay = L.layerGroup().addTo(map);
  weekLayer = L.layerGroup().addTo(map);
  L.marker([ME.home.lat, ME.home.lng], { icon: L.divIcon({ className: 'pm', html: '<div class="me-dot"><i></i></div>', iconSize: [0, 0], iconAnchor: [0, 0] }), interactive: false, zIndexOffset: -100 }).addTo(map);
  homeView(false);
  map.on('click', () => deselect());
  map.on('zoomend', () => updateMap());
}

function homeView(animate) {
  if (!map) return;
  const b = L.latLngBounds([[34.0745, -118.50], [34.003, -118.395]]);
  const opts = { paddingTopLeft: [18, 110], paddingBottomRight: [18, 360] };
  if (animate) map.flyToBounds(b, { ...opts, duration: 0.8 }); else map.fitBounds(b, opts);
}

function pinShape(it, st) {
  const g = TYPE_IC[it.type];
  if (it.type === 'meet') return `<svg class="shape" width="36" height="42" viewBox="0 0 36 42"><path class="fill" d="M18 2.5 L31.5 7.5 V20 C31.5 29.5 25 35.5 18 39.5 C11 35.5 4.5 29.5 4.5 20 V7.5 Z"/>${glyphAt(g, 9, 10, 18)}</svg>`;
  if (it.type === 'club') return `<svg class="shape" width="36" height="42" viewBox="0 0 36 42"><path class="fill" d="M18 2.5a15 15 0 0110.6 25.6L18 39.5 7.4 28.1A15 15 0 0118 2.5z"/>${glyphAt(g, 9, 8.5, 18)}</svg>`;
  if (it.type === 'route') return `<svg class="shape" width="32" height="38" viewBox="0 0 32 38"><path class="fill" d="M9 2h14a7 7 0 017 7v13a7 7 0 01-7 7h-3l-4 6-4-6H9a7 7 0 01-7-7V9a7 7 0 017-7z"/>${glyphAt(g, 7.5, 6.5, 17)}</svg>`;
  const lit = st.inWin ? lanesAt(it, st.occ[0]) : 0;
  let lanes = '';
  for (let i = 0; i < 8; i++) lanes += `<rect class="lane ${i < lit ? 'lit' : ''}" x="${29.5 + i * 2.4}" y="10" width="1.6" height="12" rx=".8"/>`;
  return `<svg class="shape" width="56" height="38" viewBox="0 0 56 38"><path class="fill" d="M15 2h26a13 13 0 010 26h-9l-4 6-4-6h-9a13 13 0 010-26z"/>${glyphAt(g, 7, 6, 18)}${lanes}</svg>`;
}
function pinBadge(it, st) {
  if (it.type === 'route') return S.layer === 'route' || U.sel === it.id ? `<b class="pbadge">${it.mi} mi</b>` : '';
  if (st.state === 'out' || st.state === 'off') return '';
  if (st.state === 'plan') return `<b class="pbadge check">${ic('check', 12, 3)}</b>`;
  if (it.type === 'track') {
    const w = curWin(), n = sessionsAt(it.id, w.start, w.end).length;
    if (n) return `<b class="pbadge">${ic('bolt', 11, 2.4)}${n}</b>`;
    if (S.day === 0 && trackOpenAt(it, NOW) && it.atPaceNow) return `<b class="pbadge">${ic('person', 11, 2.4)}${it.atPaceNow}</b>`;
    return '';
  }
  return `<b class="pbadge">${fmtShort(st.occ[0])}</b>`;
}

let mapTimer = 0;
function updateMap() {
  renderChips();
  if (U.tab === 'maps') renderSheet();
  if (!map) return;
  clearTimeout(mapTimer);
  mapTimer = setTimeout(() => {
    const items = mapItems().filter(it => S.layer === 'all' || it.type === S.layer);
    const stats = new Map(items.map(it => [it.id, status(it)]));
    const ids = new Set(items.map(i => i.id));
    for (const id of Object.keys(markers)) if (!ids.has(id)) { markers[id].remove(); delete markers[id]; }
    const zBase = { meet: 400, club: 300, track: 200, route: 100 };
    const rank = { plan: 3, on: 2, off: 1, route: 1, out: 0 };

    // the city lights up around what's happening in this window (and around your selection)
    if (heat) {
      const hot = items.filter(it => it.type !== 'route' && ['on', 'plan'].includes(stats.get(it.id).state))
        .map(it => ({ lat: it.lat, lng: it.lng, r: it.type === 'track' ? 380 : 600, a: it.type === 'meet' ? 0.34 : 0.24 }));
      const sel = U.sel && byId(U.sel);
      if (sel && !sel.route) hot.push({ lat: sel.lat, lng: sel.lng, r: 500, a: 0.35 });
      heat.setHot(hot);
    }

    // pins at the same venue fan out instead of stacking; a dot keeps the true spot
    const nudge = {}, placed = [];
    items.filter(i => stats.get(i.id).state !== 'out' || U.sel === i.id)
      .sort((a, b) => (rank[stats.get(b.id).state] - rank[stats.get(a.id).state]) || (zBase[b.type] - zBase[a.type]))
      .forEach(it => {
        const p = map.latLngToContainerPoint([it.lat, it.lng]);
        let off = 0;
        for (const t of [0, 42, -42, 84, -84]) { off = t; if (!placed.some(q => Math.abs(q.x - (p.x + t)) < 40 && Math.abs(q.y - p.y) < 44)) break; }
        placed.push({ x: p.x + off, y: p.y });
        nudge[it.id] = off;
      });

    for (const it of items) {
      const st = stats.get(it.id);
      if (!markers[it.id]) {
        const m = L.marker([it.lat, it.lng], {
          icon: L.divIcon({ className: 'pm', html: '<div class="pin" role="button" tabindex="0"></div><i class="anchor"></i>', iconSize: [0, 0], iconAnchor: [0, 0] }),
          keyboard: false, title: it.name,
        }).addTo(map);
        m.on('click', e => { L.DomEvent.stopPropagation(e); select(it.id); });
        markers[it.id] = m;
      }
      const m = markers[it.id], el = m.getElement();
      if (!el) continue;
      const pin = el.firstElementChild;
      const html = `<div class="body">${pinShape(it, st)}${pinBadge(it, st)}</div><span class="glow"></span><span class="name">${esc(it.name)}</span>`;
      if (pin._h !== html) { pin.innerHTML = html; pin._h = html; }
      const dx = nudge[it.id] || 0;
      pin.style.setProperty('--dx', dx + 'px');
      pin.setAttribute('aria-label', `${TYPE_LABEL[it.type]}: ${it.name}${st.occ.length ? ', ' + fmtWhen(st.occ[0]) : ''}`);
      pin.className = ['pin', 't-' + it.type, st.state, st.soon ? 'soon' : '', dx ? 'nudged' : '', U.sel === it.id ? 'sel' : ''].filter(Boolean).join(' ');
      m.setZIndexOffset(rank[st.state] * 1000 + zBase[it.type] + (U.sel === it.id ? 9000 : 0));
    }
    drawWeek();
  }, 0);
}

// Your week, drawn across the city as a dotted line between your plans
function drawWeek() {
  if (!weekLayer) return;
  weekLayer.clearLayers();
  const ps = plansSorted().filter(p => p.lat);
  if (ps.length < 2 || U.sel) return;
  L.polyline(ps.map(p => [p.lat, p.lng]), { color: '#fff', weight: 2.5, opacity: 0.75, className: 'week-line', interactive: false }).addTo(weekLayer);
}

const LAYERS = [['all', 'All'], ['meet', 'Meets'], ['track', 'Tracks'], ['club', 'Clubs'], ['route', 'Routes']];
function renderChips() {
  const w = curWin();
  const count = k => (k === 'route' ? ROUTES.length : k === 'track' ? tracksOpenIn(w).length : eventsIn(w, { layer: k }).length);
  $('#mapChips').innerHTML =
    `<button class="chip lens ${S.band ? '' : 'off'}" data-action="lens" aria-label="Pace lens">${ic('target', 16, 2)}${S.band ? (S.target ? `${fmtPace(tgt())} ±${fmtPace(S.band)}` : `Your pace ±${fmtPace(S.band)}`) : 'Any pace'}</button>` +
    LAYERS.map(([k, label]) => `<button class="chip ${S.layer === k ? 'on' : ''}" data-action="layer" data-layer="${k}" aria-pressed="${S.layer === k}">${label}${k === 'all' ? '' : `<span class="ct">${count(k)}</span>`}</button>`).join('');
}

function select(id) {
  let it = byId(id);
  if (!it) return;
  if (it.type === 'session') it = trackOf(it.track);
  if (it.type === 'partner') return partnerPage(it);
  if (U.tab !== 'maps') setTab('maps');
  if (!map) return;
  U.sel = it.id;
  clearTrail();
  const t = travel(it);
  if (t.mode === 'jog' && it.type !== 'route') L.polyline([[ME.home.lat, ME.home.lng], [it.lat, it.lng]], { color: '#4c8dff', weight: 3, opacity: 0.9, className: 'jog-line', interactive: false }).addTo(overlay);
  setSheet('sel');
  const sheetH = parseInt($('#sheet').style.getPropertyValue('--sel-h')) || 330;
  if (it.route && it.route.length > 2) {
    // runs show their actual trail: fit it, then draw it in
    map.flyToBounds(L.latLngBounds(it.route), { paddingTopLeft: [44, 120], paddingBottomRight: [44, sheetH + 24], maxZoom: 16, duration: 0.8 });
    let drawn = false;
    const go = () => { if (!drawn && U.sel === it.id) { drawn = true; drawTrail(it.route); } };
    map.once('moveend', go);
    setTimeout(go, 950);
  } else {
    const z = Math.max(Math.round(map.getZoom()), 14);
    const shift = (sheetH - 110) / 2;
    map.flyTo(map.unproject(map.project([it.lat, it.lng], z).add([0, shift]), z), z, { duration: 0.75, easeLinearity: 0.2 });
  }
  updateMap();
}
function deselect() {
  if (!U.sel) return;
  U.sel = null;
  clearTrail();
  setSheet('peek');
  updateMap();
}

/* ---- Run trails: draw-in animation, mile markers and a ghost runner at your pace ---- */
let trailRaf = 0;
function clearTrail() { cancelAnimationFrame(trailRaf); if (overlay) overlay.clearLayers(); $('#map').classList.remove('trail-on'); }
function drawTrail(coords) {
  $('#map').classList.add('trail-on'); // the city dims so the run you picked owns the map
  const pts = coords.map(([la, ln]) => ({ lat: la, lng: ln }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + miles(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  const loop = miles(pts[0], pts[pts.length - 1]) < 0.08;
  const glow = L.polyline(coords, { color: '#fc5200', weight: 14, opacity: 0.22, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(overlay);
  const line = L.polyline(coords, { color: '#ff6a1a', weight: 5, opacity: 1, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(overlay);
  const hi = L.polyline(coords, { color: '#fff1e2', weight: 1.6, opacity: 0.85, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(overlay);
  [glow, line, hi].forEach(p => {
    const el = p.getElement();
    if (!el || !el.getTotalLength) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len} ${len}`;
    el.style.strokeDashoffset = len;
    el.getBoundingClientRect();
    el.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(.45,0,.2,1)';
    el.style.strokeDashoffset = 0;
    setTimeout(() => { el.style.transition = ''; el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; }, 1600);
  });
  const at_ = d => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const k = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * k, pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * k];
  };
  const mk = (ll, html, z = 0) => L.marker(ll, { icon: L.divIcon({ className: 'pm', html, iconSize: [0, 0], iconAnchor: [0, 0] }), interactive: false, zIndexOffset: z }).addTo(overlay);
  const every = total > 7 ? 2 : 1;
  for (let m = every; m < total - 0.15; m += every) setTimeout(() => mk(at_(m), `<span class="mile-mk">${m}</span>`), 300 + (m / total) * 1200);
  mk(coords[0], `<span class="trail-start">${loop ? 'Start · finish' : 'Start'}</span>`, 50);
  if (!loop) setTimeout(() => mk(coords[coords.length - 1], `<span class="trail-end">${ic('flag', 13, 2.2)}</span>`, 40), 1400);
  // ghost runner: one lap at a time, so you can see the shape of the run
  const ghost = mk(coords[0], '<span class="ghost-runner"><i></i></span>', 60);
  const dur = Math.max(7000, Math.min(16000, total * 2200)), t0 = performance.now() + 1500;
  const step = now => {
    const k = Math.max(0, ((now - t0) / dur) % 1);
    ghost.setLatLng(at_(k * total));
    trailRaf = requestAnimationFrame(step);
  };
  trailRaf = requestAnimationFrame(step);
}

/* ============ 6. Bottom sheet: peek / list / selected ============ */
function setSheet(state) {
  const sheet = $('#sheet');
  if (state !== 'sel' && U.sel) { U.sel = null; clearTrail(); }
  sheet.dataset.state = state;
  renderSheet();
}

function renderSheet() {
  const state = $('#sheet').dataset.state;
  if (state !== 'sel') renderSheetHead();
  if (state === 'peek') renderPeek();
  if (state === 'list') renderList();
  if (state === 'sel' && U.sel) renderSel(byId(U.sel));
}

function renderSheetHead() {
  const d0 = at(S.day, 12);
  const amDisabled = S.day === 0 && NOW.getHours() >= 12;
  let days = '';
  for (let i = 0; i < 7; i++) {
    const d = at(i, 12);
    const n = eventsIn(windowFor(i, S.part)).length;
    const hasPlan = S.plans.some(p => dayDiff(new Date(p.when)) === i);
    days += `<button class="day ${i === S.day ? 'on' : ''}" data-action="day" data-i="${i}" aria-pressed="${i === S.day}"><small>${i === 0 ? 'Today' : DAY[d.getDay()]}</small><b>${d.getDate()}</b><span class="cnt">${n || '–'}</span>${hasPlan ? '<i class="pdot"></i>' : ''}</button>`;
  }
  $('#sheetHead').innerHTML =
    `<div class="sh-row"><div class="sh-title">${dayTitle()}<span class="sh-date">${fmtDate(d0)}</span></div>` +
    `<div class="seg" role="group" aria-label="Time of day">${[['am', 'AM'], ['pm', 'PM'], ['all', 'All']].map(([k, l]) => `<button class="${S.part === k ? 'on' : ''}" data-action="part" data-p="${k}" ${k === 'am' && amDisabled ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>` +
    `<div class="days">${days}</div>`;
}

function tweenNum(el, to) {
  const from = +el.dataset.v || 0;
  el.dataset.v = to;
  if (from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / 420); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function renderPeek() {
  const w = curWin();
  const ev = eventsIn(w, { layer: S.layer === 'track' ? 'all' : S.layer });
  const atPace = ev.filter(paceOK).length;
  const tracks = tracksOpenIn(w).length;
  const ps = plansSorted();
  let card;
  if (!ps.length) {
    card = `<button class="cta-card" data-action="plan-week"><span class="cc-ic">${ic('calendar', 20, 2)}</span><span><div class="cc-t">Plan my first week</div><div class="cc-s">A club run, a track workout and a meet at your pace</div></span>${ic('chev', 18)}</button>`;
  } else {
    card = `<div class="week-strip">${ps.slice(0, 4).map(p => `<button class="wk" data-action="open" data-id="${p.kind === 'session' ? p.track : p.ref}"><span class="date-tile on"><span><small>${DAY[p.date.getDay()]}</small><b>${p.date.getDate()}</b></span></span><span><div class="wk-t">${esc(p.title)}</div><div class="wk-s">${fmtShort(p.date)} · ${esc(p.sub)}</div></span></button>`).join('')}</div>`;
  }
  $('#sheetPeek').innerHTML =
    `<div class="summary"><span><b>${ev.length}</b> runs & meets${S.band ? ` · <b class="pace" id="sumPace" data-v="${U.lastPace ?? atPace}">${U.lastPace ?? atPace}</b> at your pace` : ''} · <b>${tracks}</b> tracks open</span><button class="link" data-action="sheet-list">List ${ic('chev', 14, 2.2)}</button></div>${card}`;
  const sp = $('#sumPace');
  if (sp) tweenNum(sp, atPace);
  U.lastPace = atPace;
}

function rowItem(it, when, opts = {}) {
  const st = opts.state || 'on';
  let eyebrow = `${fmtShort(when)} · ${TYPE_LABEL[it.type]}`, title = it.name, sub = '';
  if (it.type === 'meet') { const h = heatFor(it); sub = `${it.forPace ? tagHtml(h ? `You: ${h.name}` : 'Your level', 'pace') : tagHtml(it.fitNote || 'Not your pace')}<span>${going(it)}</span>`; }
  if (it.type === 'club') { const s = schedFor(it, when); sub = `${paceOK(it) ? tagHtml('Your pace', 'pace') : tagHtml(it.sprint ? 'Sprinters' : 'Faster groups')}<span>${esc(s.label)} · ${it.going} going</span>`; }
  if (it.type === 'session') { const t = trackOf(it.track); title = `${first(it.who)}: ${it.workout}`; sub = `${it.forPace ? tagHtml('Your pace', 'pace') : tagHtml('Faster')}<span>${esc(t.name)} · ${it.joined} joined</span>`; }
  if (it.type === 'track') { const ts = trackStatus(it); const l = lanesAt(it, when); eyebrow = `${ts.open && S.day === 0 ? ts.text : 'Open ' + fmtShort(when)} · ${it.lights ? 'Lights' : 'No lights'}`; sub = `${S.day === 0 && ts.open ? tagHtml(`${crowdWord(l)} · ${l}/8 lanes`, l <= 3 ? 'ok' : 'warn') : ''}<span>${it.publicNow ? 'Public' : 'Students + members'} · ${distTxt(it)}</span>`; }
  const plan = st === 'plan' ? ' · <span class="hot">In your week</span>' : '';
  return `<button class="row-item ${opts.dim ? 'dim' : ''}" data-action="open" data-id="${it.type === 'session' ? it.track : it.id}">${tile(it, st)}<div class="ri-main"><div class="ri-eyebrow">${eyebrow}${plan}</div><div class="ri-t">${esc(title)}</div><div class="ri-s">${sub}</div></div>${ic('chev', 18)}</button>`;
}

function renderList() {
  const w = curWin();
  if (w.empty) { $('#sheetList').innerHTML = `<div class="empty">This morning has passed. Switch to <b>PM</b> or pick another day.</div>`; return; }
  const ev = eventsIn(w).filter(e => S.layer === 'all' || (e.type === 'session' ? 'track' : e.type) === S.layer)
    .map(e => ({ e, t: occurrences(e, w.start, w.end)[0] })).sort((a, b) => (paceOK(b.e) - paceOK(a.e)) || (a.t - b.t));
  const tracks = (S.layer === 'all' || S.layer === 'track') ? tracksOpenIn(w).sort((a, b) => miles(ME.home, a) - miles(ME.home, b)) : [];
  const people = (S.layer === 'all') ? PARTNERS.filter(paceOK) : [];
  const routes = (S.layer === 'all' || S.layer === 'route') ? ROUTES : [];
  let html = '';
  if (S.layer !== 'route') {
    html += `<div class="grp"><span>Runs & meets</span><span>${ev.length}</span></div>`;
    html += ev.length ? ev.map(({ e, t }) => rowItem(e, t, { state: S.plans.some(p => p.ref === e.id) ? 'plan' : paceOK(e) ? 'on' : 'off', dim: !paceOK(e) })).join('') : `<div class="empty">Nothing ${dayTitle().toLowerCase()} for this filter. Try another day.</div>`;
  }
  if (routes.length) html += `<div class="grp"><span>Popular routes</span><span>${routes.length}</span></div>` + routes.map(r => `<button class="row-item" data-action="open" data-id="${r.id}">${tile(r, 'off')}<div class="ri-main"><div class="ri-eyebrow">${r.mi} mi · ${esc(r.area)}</div><div class="ri-t">${esc(r.name)}</div><div class="ri-s"><span>${r.athletes.toLocaleString()} athletes this month · ${esc(r.surface)}</span></div></div>${ic('chev', 18)}</button>`).join('');
  if (tracks.length) html += `<div class="grp"><span>Tracks open</span><span>${tracks.length}</span></div>` + tracks.map(t => rowItem(t, occurrences(t, w.start, w.end)[0], { state: paceOK(t) ? 'on' : 'off' })).join('');
  if (people.length) html += `<div class="grp"><span>Runners at your pace</span><span>${people.length}</span></div>` + people.map(p => `<button class="row-item" data-action="person" data-id="${p.id}">${av(p, '', false)}<div class="ri-main"><div class="ri-eyebrow">${fmtPace(p.pace)}/mi easy · ${esc(p.focus)} · ${esc(p.area)}</div><div class="ri-t">${esc(p.name)}</div><div class="ri-s"><span>${esc(p.week)} · ${esc(p.usual)}</span></div></div>${ic('chev', 18)}</button>`).join('');
  $('#sheetList').innerHTML = html;
}

function renderSel(it) {
  if (!it) return;
  const st = status(it);
  const when = st.inWin ? st.occ[0] : nextOcc(it);
  const lines = [];
  let eyebrow = `${TYPE_LABEL[it.type]} · ${when ? fmtWhen(when) : ''}`, meta = '', actions = '';
  if (it.type === 'meet') {
    const venue = trackOf(it.venue), h = heatFor(it);
    meta = `${venue ? venue.name : it.place || ''} · ${it.fees}`;
    if (it.forPace && h) lines.push(['timer', `Strava predicts <b>${fmtPace(ME.predict.Mile)}</b> mile → <b>${h.name}</b> (${h.range})`]);
    else if (!it.forPace) lines.push(['info', it.fitDetail || 'Not a fit for your pace yet.']);
    lines.push(['club', `${going(it)} · ${it.firstTimers} first-timers`]);
    lines.push([travel(it).mode === 'jog' ? 'run' : 'car', travelText(it, it.when)]);
    const reg = S.regs[it.id];
    actions = `<button class="btn ghost" data-action="detail" data-id="${it.id}">Details</button>` + (reg ? `<button class="btn done" data-action="ticket" data-id="${it.id}">${ic('check', 18, 2.4)} Seeded</button>` : `<button class="btn" data-action="register" data-id="${it.id}">Pre-register</button>`);
  } else if (it.type === 'track') {
    const ts = trackStatus(it), l = lanesAt(it, NOW), w = curWin();
    const ss = w.empty ? [] : sessionsAt(it.id, w.start, w.end);
    eyebrow = `${it.publicNow ? 'Public track' : 'Campus track'} · ${it.area}`;
    meta = `${it.surface}${it.lights ? ' · lights' : ''}`;
    lines.push([ts.open ? 'unlock' : 'lock', ts.open ? `<b>${ts.text}</b> · ${crowdWord(l)}, ${l} of 8 lanes in use` : `<b>${ts.text}</b>`]);
    if (ts.open) lines.push(['person', `<b>${it.atPaceNow}</b> runners at your pace here now`]);
    if (ss.length) lines.push(['bolt', `${ss.length} workout${ss.length > 1 ? 's' : ''} posted · ${esc(first(ss[0].who))}'s ${esc(ss[0].workout)} at ${fmtShort(ss[0].when)}`]);
    lines.push([travel(it).mode === 'jog' ? 'run' : 'car', travelText(it, null)]);
    const join = ss.find(s => s.forPace && !planOf(s.id) && !s.mine);
    const joined = ss.find(s => planOf(s.id));
    actions = `<button class="btn ghost" data-action="detail" data-id="${it.id}">Track details</button>` +
      (joined ? `<button class="btn done" data-action="detail" data-id="${it.id}">${ic('check', 18, 2.4)} In your week</button>` : join ? `<button class="btn" data-action="join" data-id="${join.id}">Join ${esc(first(join.who))}'s ${esc(join.workout.split(' @')[0])}</button>` : `<button class="btn" data-action="post-session" data-id="${it.id}">Post a workout</button>`);
  } else if (it.type === 'club') {
    const s = when ? schedFor(it, when) : it.schedule[0];
    const myG = myGroup(it);
    meta = `${esc(s.label)} · ${it.dist} · ${it.meetSpot}`;
    if (myG) lines.push(['target', `Your group: <b>${fmtPace(myG.pace)}</b> · ran ${myG.actual} avg · ${myG.dropped} dropped in last 4`]);
    else lines.push(['info', `Groups run ${it.groups.map(g => g.mile || fmtPace(g.pace)).join(' / ')}. Not your pace yet.`]);
    lines.push(['club', going(it)]);
    if (when) lines.push([travel(it).mode === 'jog' ? 'run' : 'car', travelText(it, when)]);
    const isGoing = rsvpOf(it, when);
    actions = `<button class="btn ghost" data-action="detail" data-id="${it.id}">Details</button>` + (isGoing ? `<button class="btn done" data-action="rsvp" data-id="${it.id}" data-when="${when.toISOString()}">${ic('check', 18, 2.4)} Going</button>` : `<button class="btn" data-action="rsvp" data-id="${it.id}" data-when="${when ? when.toISOString() : ''}">RSVP</button>`);
  }
  if (it.type === 'route') {
    eyebrow = `Popular route · ${it.area}`;
    meta = `${it.mi} mi · ${it.gain} ft gain · ${it.surface}`;
    const onIt = CLUBS.filter(c => c.route && c.route.some(p => miles({ lat: p[0], lng: p[1] }, it) < 0.25 || it.route.some(q => Math.abs(q[0] - p[0]) < 0.0015 && Math.abs(q[1] - p[1]) < 0.0015)));
    lines.push(['club', `<b>${it.athletes.toLocaleString()}</b> athletes ran it this month`]);
    lines.push(['timer', `About <b>${fmtDur(it.mi * ME.pace)}</b> at your easy pace · best ${it.best.charAt(0).toLowerCase() + it.best.slice(1)}`]);
    if (onIt.length) lines.push(['route', `${esc(onIt[0].name)} runs this route`]);
    lines.push([travel(it).mode === 'jog' ? 'run' : 'car', `Start is a ${travelText(it, null)} away`]);
    actions = `<button class="btn ghost" data-action="save-route" data-id="${it.id}">${S.saved[it.id] ? `${ic('check', 18, 2.4)} Saved` : 'Save'}</button><button class="btn" data-action="run-route" data-id="${it.id}">Run it now</button>`;
  }
  const note = !st.inWin && when ? `<div class="sel-line" style="margin-top:12px;color:var(--yellow)">${ic('calendar', 18)}<span>Not ${dayTitle().toLowerCase()}. Next: ${fmtWhen(when)}</span></div>` : '';
  $('#sheetSel').innerHTML =
    `<div class="sel-nav"><button class="link muted" data-action="sheet-peek">${ic('back', 14, 2.4)} All</button><button class="icon-btn" style="width:32px;height:32px" data-action="deselect" aria-label="Close">${ic('close', 16, 2.2)}</button></div>` +
    `<div class="sel-top">${tile(it, st.state === 'out' ? 'off' : st.state)}<div style="min-width:0"><div class="sel-eyebrow">${eyebrow}</div><div class="sel-title">${esc(it.name)}</div><div class="sel-meta">${meta}</div></div></div>` +
    note + `<div class="sel-lines">${lines.map(([i, t]) => `<div class="sel-line">${ic(i, 18)}<span>${t}</span></div>`).join('')}</div>` +
    `<div class="sel-actions">${actions}</div>`;
  const h = $('#sheetSel').scrollHeight + 22 + 100 + 8;
  $('#sheet').style.setProperty('--sel-h', h + 'px');
}

function initSheet() {
  const grab = $('#sheetGrab');
  let y0 = null, moved = false;
  grab.addEventListener('pointerdown', e => { y0 = e.clientY; moved = false; grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', e => { if (y0 !== null && Math.abs(e.clientY - y0) > 8) moved = true; });
  grab.addEventListener('pointerup', e => {
    if (y0 === null) return;
    const dy = e.clientY - y0; y0 = null;
    const cur = $('#sheet').dataset.state;
    if (cur === 'sel') { if (!moved || dy > 30) deselect(); return; }
    let next = cur;
    if (!moved) next = cur === 'list' ? 'peek' : 'list'; else if (dy < -30) next = 'list'; else if (dy > 30) next = 'peek';
    setSheet(next);
  });
}

/* ============ 7. Detail pages ============ */
function setTab(tab) {
  U.tab = tab;
  closeAllPages();
  $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === tab));
  renderTabbar();
  if (tab === 'home') renderHome();
  if (tab === 'groups') renderGroups();
  if (tab === 'you') renderYou();
  if (tab === 'workout') renderWorkout();
  if (tab === 'maps') {
    initMap();
    if (map) map.invalidateSize();
    updateMap();
    if (!S.personalized) setTimeout(openPersonalize, 450);
  }
}
function renderTabbar() {
  const tabs = [['home', 'Home'], ['maps', 'Maps'], ['workout', 'Record'], ['groups', 'Groups'], ['you', 'You']];
  $('#tabbar').innerHTML = tabs.map(([k, l]) => `<button data-tab="${k}" class="tab ${U.tab === k ? 'active' : ''}" aria-current="${U.tab === k ? 'page' : 'false'}">${ic(k === 'workout' ? 'record' : k, 24, 1.8)}<span>${l}</span>${k === 'workout' && REC.st !== 'idle' ? '<i class="tab-dot"></i>' : ''}</button>`).join('');
}

function pushPage(html, cta = '') {
  const wrap = document.createElement('div');
  wrap.className = 'page-wrap';
  wrap.innerHTML = `<div class="page">${html}</div>${cta ? `<div class="cta-bar">${cta}</div>` : ''}`;
  $('#stack').appendChild(wrap);
  U.stack.push(wrap);
  const page = $('.page', wrap), nt = $('.nav-title', wrap);
  if (nt) page.addEventListener('scroll', () => { nt.style.opacity = page.scrollTop > 120 ? 1 : 0; });
  return wrap;
}
function popPage() {
  const w = U.stack.pop();
  if (!w) return;
  w.classList.add('out');
  setTimeout(() => w.remove(), 230);
  refresh();
}
function closeAllPages() { U.stack.forEach(w => w.remove()); U.stack = []; }
function setCta(html) { const top = U.stack[U.stack.length - 1]; if (!top) return; let bar = $('.cta-bar', top); if (!bar) { bar = document.createElement('div'); bar.className = 'cta-bar'; top.appendChild(bar); } bar.innerHTML = html; }
const navBar = (title = '') => `<div class="page-nav"><button class="icon-btn" data-action="back" aria-label="Back">${ic('back', 20, 2.2)}</button><span class="nav-title">${esc(title)}</span><button class="icon-btn" data-action="share" aria-label="Share">${ic('share', 19)}</button></div>`;

function refresh() {
  if (U.tab === 'maps') updateMap();
  if (U.tab === 'home') renderHome();
  if (U.tab === 'groups') renderGroups();
  if (U.tab === 'you') renderYou();
}
function openModal(html, opts = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true"><div class="modal-grab"></div>${html}</div>`;
  m.hidden = false;
  m.onclick = e => { if (e.target === m && !opts.locked) closeModal(); };
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

/* ---- Meet ---- */
function meetPage(m) {
  const venue = trackOf(m.venue), f = friendsOf(m), h = heatFor(m);
  if (!U.selEvents[m.id]) U.selEvents[m.id] = S.regs[m.id] ? [...S.regs[m.id]] : defaultEvents(m);
  const tags = [m.lights ? 'Under the lights' : '', m.unattached ? 'Day-of entry OK' : 'Students + alumni', m.seeded ? 'Seeded heats' : '', m.sponsored ? `Presented by ${m.sponsored}` : ''].filter(Boolean);
  const predict = m.seeded && m.forPace && h
    ? `<div class="predict"><div><div class="p-k">Strava predicts</div><div class="p-num">${fmtPace(ME.predict.Mile)}</div></div><div><div class="p-t">Mile → ${h.name} (${h.range})</div><div class="p-k">From your 5K best effort (${ME.best5k}) · ${Math.round(m.registered / 4)} runners in your heat range</div></div></div>`
    : !m.forPace ? `<div class="section" style="margin-top:0"><div class="callout neutral">${ic('info', 20)}<div><b>Not a fit yet.</b><span class="muted">${esc(m.fitDetail || '')} Strava predicts a ${fmtPace(ME.predict.Mile)} mile for you. Try Westside Mile Night.</span></div></div></div>` : '';
  const html = `${navBar(m.name)}
    <div class="hero"><div class="hero-art">${laneArt()}</div>
      <div class="eyebrow"><span class="hot">${esc(m.series)}</span></div><h2>${esc(m.name)}</h2>
      <div class="hero-sub">${esc(venue ? venue.name : m.place || '')} · ${fmtWhen(m.when)}</div>
      <div class="tags">${tags.map(t => tagHtml(t)).join('')}</div></div>
    <div style="height:16px"></div>${predict}
    <div class="facts">
      <div class="fact"><div class="k">First event</div><div class="v">${fmtWhen(m.when)}<small>${esc(m.checkIn)}</small></div></div>
      <button class="fact" data-action="open" data-id="${m.id}"><div class="k">Getting there</div><div class="v">${distTxt(m)}<small>${travelText(m, m.when)}</small></div></button>
      <div class="fact"><div class="k">Entry</div><div class="v">${esc(m.fees)}<small>Pay at check-in</small></div></div>
      <div class="fact"><div class="k">Field</div><div class="v">${m.registered} pre-registered<small>${m.firstTimers} first-timers</small></div></div>
    </div>
    <div class="section" style="margin-top:0"><div class="who">${f.length ? avStack(f, 'sm', true) : ic('club', 22)}<div><div class="wt">${going(m)}</div><div class="ws">${f.length ? 'Tap a friend to see their week' : 'Pre-register to see who’s in your heat'}</div></div></div></div>
    <div class="section"><h3 class="section-title">Schedule & events</h3><p class="section-sub">Pick as many as you want. All-comers means you can double.</p>
      <div class="list" id="evList">${eventList(m)}</div></div>
    <div class="section"><div class="callout">${ic('trophy', 20)}<div>${esc(m.blurb)}<span class="muted">Official times post to your Strava activity as a race.</span></div></div></div>
    ${venue ? `<div class="section"><h3 class="section-title">Venue</h3><button class="who" data-action="detail" data-id="${venue.id}"><span class="tile track">${ic('track', 20, 2)}</span><div style="flex:1;min-width:0"><div class="wt">${esc(venue.name)}</div><div class="ws">${esc(venue.access)}</div></div>${ic('chev', 18)}</button></div>` : ''}
    <div class="section"><button class="link muted" data-action="organizer" data-id="${m.id}">${ic('chart', 16)} Organizer view</button></div>`;
  pushPage(html, meetCta(m));
}
function eventList(m) {
  const sel = U.selEvents[m.id] || [], reg = S.regs[m.id], rec = defaultEvents(m);
  return m.events.map(e => {
    const on = sel.includes(e.name);
    const heat = e.heats && m.forPace ? heatFor(m, e.name) : null;
    const sub = `${e.n} entered${heat ? ` · You: ${heat.name}` : ''}${e.relay ? ' · solo entrants matched into teams' : ''}`;
    return `<button class="ev ${on ? 'on' : ''} ${reg ? 'locked' : ''}" data-action="pick-event" data-id="${m.id}" data-ev="${esc(e.name)}" aria-pressed="${on}"><span class="time">${fmtShort(eventTime(m, e))}</span><span class="box">${ic('check', 14, 3)}</span><div><div class="en">${esc(e.name)}</div><div class="es">${sub}</div></div>${rec.includes(e.name) && !reg ? '<span class="tag pace fit">Best fit</span>' : ''}</button>`;
  }).join('');
}
function meetCta(m) {
  if (S.regs[m.id]) return `<button class="btn block done" data-action="ticket" data-id="${m.id}">${ic('check', 18, 2.4)} Pre-registered · ${esc(S.regs[m.id].join(' + '))}</button><div class="cta-note">Tap to see your heat sheet</div>`;
  const ev = U.selEvents[m.id] || [];
  return `<button class="btn block" data-action="confirm-register" data-id="${m.id}" ${ev.length ? '' : 'disabled style="opacity:.4"'}>Pre-register · ${ev.length ? esc(ev.join(' + ')) : 'pick an event'}</button><div class="cta-note">Free to pre-register · pay at check-in · keeps your seed</div>`;
}

function heatSheet(m, evName) {
  const e = m.events.find(x => x.name === evName);
  const h = heatFor(m, evName);
  if (!e || !h) return '';
  const names = ['Alex Moreno', 'Jamie Chen', 'Riley Brooks', 'Noah Kim', 'Sam Ortega', 'Taylor Nguyen', 'Chris Ali', 'Jess Park'];
  const heat = e.heats.find(x => x[0] === h.name);
  const lo = heat[2], hi = Math.min(heat[3], lo + 80);
  const rows = names.map((n, i) => ({ n, t: lo + Math.round((hi - lo) * (i + 0.5) / names.length) }));
  rows.push({ n: ME.name, t: ME.predict.Mile, you: true });
  rows.sort((a, b) => a.t - b.t);
  const pos = rows.findIndex(r => r.you) + 1;
  return `<div class="heat-sheet"><div class="hs-head"><span>${esc(evName)} · ${h.name} · ${fmtShort(eventTime(m, e))}</span><span class="muted">Seed ${pos} of ${rows.length}</span></div>${rows.map((r, i) => `<div class="hs-row ${r.you ? 'you' : ''}"><span class="pos">${i + 1}</span><span class="nm">${esc(r.you ? 'You' : r.n)}</span><span class="seed">${fmtPace(r.t)}</span></div>`).join('')}</div>`;
}

function ticketPage(m, fresh) {
  const venue = trackOf(m.venue), evs = S.regs[m.id] || [];
  const withHeat = evs.find(n => heatFor(m, n));
  const kai = friendsOf(m).find(f => f.id === 'kai');
  const tr = travel(m, m.when);
  const html = `${navBar('Your entry')}
    <div class="success">
      ${fresh ? `<svg class="check-anim" viewBox="0 0 76 76"><circle cx="38" cy="38" r="35" fill="none" stroke="#fc5200" stroke-width="4"/><path d="M24 39l9 9 19-20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
      <h2>${fresh ? 'You’re seeded' : 'Your entry'}</h2>
      <p>${esc(m.name)} · ${fmtWhen(m.when)}<br>${esc(evs.join(' + '))} · pay at check-in</p>
    </div>
    <div class="section" style="margin-top:0">${withHeat ? heatSheet(m, withHeat) : ''}</div>
    ${kai && withHeat ? `<div class="section" style="margin-top:12px"><div class="who">${av(kai, 'sm')}<div><div class="wt">Kai is in Heat 2</div><div class="ws">Warm up together by the home straight before your heat</div></div></div></div>` : ''}
    <div class="facts">
      <div class="fact"><div class="k">Check-in</div><div class="v">${fmtShort(new Date(+m.when - 30 * MIN))}<small>${esc(venue ? venue.name : '')}</small></div></div>
      <div class="fact"><div class="k">Leave by</div><div class="v">${fmtShort(tr.leave)}<small>${tr.mins} min ${tr.mode}</small></div></div>
    </div>`;
  pushPage(html, `<div class="cta-row"><button class="btn ghost" data-action="toast" data-msg="Added to your calendar with a reminder at ${fmtShort(tr.leave)}" data-icon="calendar">Add to calendar</button><button class="btn white" data-action="show-on-map" data-id="${m.id}">See it on the map</button></div>`);
}

function organizerPage(m) {
  m = m || MEETS[0];
  const mile = m.events.find(e => e.heats);
  const html = `${navBar('Organizer view')}
    <div style="padding:0 16px"><div class="eyebrow"><span class="hot">Organizer view</span> · ${esc(m.organizer)}</div><h2 style="font-size:var(--fs-title);margin:6px 0 4px;letter-spacing:-.02em">${esc(m.name)}</h2><div class="muted">${fmtWhen(m.when)}</div></div>
    <div class="section"><div class="stat-grid">
      <div class="stat"><div class="v">${m.registered}</div><div class="k">Pre-registered</div></div>
      <div class="stat"><div class="v">${m.viaPulse}</div><div class="k">Found you on Pulse</div></div>
      <div class="stat"><div class="v">${m.firstTimers}</div><div class="k">First-time racers</div></div>
      <div class="stat"><div class="v">${m.under22}</div><div class="k">Under 22</div></div>
    </div>
    <div class="card" style="padding:14px;margin-top:8px"><div class="row" style="justify-content:space-between"><b>Fill</b><span class="muted num">${m.registered} / ${m.cap}</span></div><div class="fill-bar"><i style="width:${m.registered / m.cap * 100}%"></i></div></div></div>
    ${mile ? `<div class="section"><h3 class="section-title">Heat balance · ${esc(mile.name)}</h3><div class="list">${mile.heats.map(([n, r], i) => `<div class="li"><div class="li-main"><div class="li-t">${n} · ${r}</div></div><span class="num muted">${[6, 11, 13, 8][i] || 4} seeded</span></div>`).join('')}</div></div>` : ''}
    <div class="section"><div class="callout">${ic('target', 20)}<div><b>Who sees this meet</b><span class="muted">Runners within 8 mi whose predicted times fit one of your heats. ${Math.round(m.firstTimers / m.registered * 100)}% of this field has never raced an all-comers meet.</span></div></div></div>`;
  pushPage(html, `<div class="cta-row"><button class="btn ghost" data-action="toast" data-msg="Message sent to ${m.registered} runners" data-icon="chat">Message runners</button><button class="btn" data-action="toast" data-msg="Featured for 7 days to runners at matching paces" data-icon="bolt">Feature · $49</button></div>`);
}

/* ---- Track ---- */
function trackPage(t) {
  const ts = trackStatus(t), l = ts.open ? t.liveLanes : 0;
  const nowH = NOW.getHours();
  const bars = t.crowd.slice(5, 23).map((v, i) => { const hr = i + 5, live = hr === nowH && ts.open; const val = live ? l : v; return `<span class="${live ? 'now' : ''}" ${live ? `data-live="Now ${l}"` : ''} style="height:${Math.max(4, val / 8 * 100)}%"></span>`; }).join('');
  const board = sessionsAt(t.id, new Date(+NOW - 30 * MIN), at(2, 23, 59));
  const rep = S.reports[t.id];
  const clubsHere = CLUBS.filter(c => miles(c, t) < 0.15), meetsHere = MEETS.filter(m => m.venue === t.id);
  const hoursRows = Array.from({ length: 7 }, (_, i) => { const d = at(i, 12); return `<div class="${i === 0 ? 'today' : ''}"><span>${i === 0 ? 'Today' : DAY_FULL[d.getDay()]}</span><span>${t.slots.map(([a, b]) => `${fmtHour(a)}–${fmtHour(b)}`).join(', ')}</span></div>`; }).join('');
  const html = `${navBar(t.name)}
    <div class="hero" style="padding-bottom:22px"><div class="hero-art" style="display:grid;place-items:center;padding-bottom:40px">${ovalSvg(l, 300, 177)}</div>
      <div style="height:120px"></div>
      <div class="eyebrow">${t.publicNow ? 'Public track' : 'Campus track'} · ${esc(t.area)}</div><h2>${esc(t.name)}</h2>
      <div class="hero-sub">${ts.open ? `<b style="color:var(--green)">${ts.text}</b> · ${t.lights ? 'lights on' : 'no lights'} · ${l} of 8 lanes in use` : ts.text}</div></div>
    <div class="facts">
      <div class="fact"><div class="k">At your pace now</div><div class="v">${ts.open ? `${t.atPaceNow} runners` : '–'}<small>${ts.open ? `within ±${fmtPace(S.band || 60)} of ${fmtPace(tgt())}` : ts.text}</small></div></div>
      <div class="fact"><div class="k">Crowd</div><div class="v">${ts.open ? crowdWord(l) : 'Closed'}<small>${ts.open ? `${l} of 8 lanes` : 'Typical at 6 PM: ' + crowdWord(t.crowd[18])}</small></div></div>
      <div class="fact"><div class="k">Surface</div><div class="v">${esc(t.surface)}</div></div>
      <button class="fact" data-action="open" data-id="${t.id}"><div class="k">Getting there</div><div class="v">${distTxt(t)}<small>${travel(t).mins} min ${travel(t).mode}</small></div></button>
    </div>
    <div class="section" style="margin-top:0"><div class="card" style="padding:14px">
      <div class="row" style="justify-content:space-between"><div><b>${rep ? 'Thanks, that helps everyone' : `Confirmed open ${t.confirmedMin} min ago`}</b><div class="muted" style="font-size:13px;margin-top:2px">Hours checked against ${t.verifiedBy} athletes’ GPS this week</div></div>${ic('shield', 22)}</div>
      <div class="report-row">${[['open', 'unlock', 'Open'], ['locked', 'lock', 'Locked'], ['practice', 'club', 'Team practice']].map(([k, i, lab]) => `<button class="report ${rep === k ? 'on' : ''}" data-action="report" data-id="${t.id}" data-k="${k}">${ic(i, 16)}${lab}</button>`).join('')}</div>
    </div></div>
    <div class="section" style="margin-top:12px">${t.youHaveAccess ? `<div class="callout">${ic('shield', 20)}<div><b>${esc(t.youHaveAccess)}</b><span class="muted">${esc(t.access)}</span></div></div>` : `<div class="callout neutral">${ic('info', 20)}<div><b>Who can use it</b><span class="muted">${esc(t.access)}</span></div></div>`}</div>
    <div class="section"><h3 class="section-title">Workout board</h3><p class="section-sub">Join a workout, not a stranger. Posted by runners training here.</p>
      ${board.length ? `<div class="board">${board.map(s => { const joined = planOf(s.id); return `<div class="bd">${av({ id: s.friend, name: s.who, initials: s.initials, hue: s.hue }, 'sm', !!s.friend)}<div class="bd-main"><div class="bd-t">${esc(s.workout)}</div><div class="bd-s">${esc(first(s.who))} · ${fmtDay(s.when)} ${fmtShort(s.when)} · ${esc(s.rest)} · ${s.joined + (joined && !s.mine ? 1 : 0)} joined${s.forPace ? ' · <span style="color:var(--orange-hi)">your pace</span>' : ''}</div></div>${s.mine ? tagHtml('Yours') : joined ? `<button class="btn xs done" data-action="join" data-id="${s.id}" aria-label="Leave">${ic('check', 14, 2.6)}</button>` : `<button class="btn xs ${s.forPace ? '' : 'ghost'}" data-action="join" data-id="${s.id}">Join</button>`}</div>`; }).join('')}</div>` : `<div class="card empty">No workouts posted for the next two days. Post one and runners at your pace will see it.</div>`}
    </div>
    <div class="section"><h3 class="section-title">How busy it gets</h3><p class="section-sub">Lanes in use by hour, from Strava GPS on this track.</p>
      <div class="card" style="padding:18px 14px 12px"><div class="bars">${bars}</div><div class="bars-axis"><span>5a</span><span>9a</span><span>1p</span><span>5p</span><span>10p</span></div></div></div>
    <div class="section"><h3 class="section-title">Getting in</h3><div class="list">
      <div class="li">${ic('gate', 20)}<div class="li-main"><div class="li-s" style="white-space:normal;color:var(--text);margin:0">${esc(t.gate)}</div></div></div>
      <div class="li">${ic('lanes', 20)}<div class="li-main"><div class="li-s" style="white-space:normal;color:var(--text);margin:0">${esc(t.etiquette)}</div></div></div>
    </div></div>
    <div class="section"><h3 class="section-title">Hours</h3><div class="hours">${hoursRows}</div></div>
    ${clubsHere.length || meetsHere.length ? `<div class="section"><h3 class="section-title">Happening here</h3><div class="list">${meetsHere.map(m => `<button class="li" data-action="detail" data-id="${m.id}"><div class="date-tile"><span><small>${DAY[m.when.getDay()]}</small><b>${m.when.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(m.name)}</div><div class="li-s">Meet · ${fmtShort(m.when)}</div></div>${ic('chev', 18)}</button>`).join('')}${clubsHere.map(c => { const n = nextOcc(c); return n ? `<button class="li" data-action="detail" data-id="${c.id}"><div class="date-tile"><span><small>${DAY[n.getDay()]}</small><b>${n.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(c.name)}</div><div class="li-s">Club · ${fmtShort(n)} · ${esc(schedFor(c, n).label)}</div></div>${ic('chev', 18)}</button>` : ''; }).join('')}</div></div>` : ''}`;
  pushPage(html, ts.open
    ? `<button class="btn block" data-action="post-session" data-id="${t.id}">Post a workout here</button><div class="cta-note">${t.atPaceNow} runners at your pace nearby will see it</div>`
    : `<button class="btn block ghost" data-action="toast" data-msg="We’ll ping you when ${esc(t.name)} opens" data-icon="bell">Notify me when it opens</button>`);
}

/* ---- Club ---- */
function myGroup(c) {
  if (c.sprint) return null;
  const g = c.groups.filter(x => x.pace).sort((a, b) => Math.abs(a.pace - tgt()) - Math.abs(b.pace - tgt()))[0];
  return g && Math.abs(g.pace - tgt()) <= Math.max(S.band, 60) ? g : null;
}
const rsvpOf = (c, when) => when && S.plans.find(p => p.ref === c.id && +new Date(p.when) === +when);

function clubPage(c) {
  const n = nextOcc(c), f = friendsOf(c), mine = myGroup(c);
  const upcoming = occurrences(c, NOW, at(14, 23, 59)).slice(0, 4);
  const html = `${navBar(c.name)}
    <div class="hero" style="padding-top:110px"><div class="hero-art">${routeSvg(c.route, 390, 300, { pad: 60 })}</div>
      <div style="height:90px"></div>
      <div class="eyebrow">Run club · ${c.members} members</div><h2>${esc(c.name)}</h2>
      <div class="hero-sub">${esc(c.about)}</div>
      <div class="tags">${c.beginner ? tagHtml('Beginner-friendly') : tagHtml('Experienced')}${tagHtml(c.dist)}</div></div>
    <div class="facts">
      <div class="fact"><div class="k">Next run</div><div class="v">${n ? fmtWhen(n) : '–'}<small>${n ? esc(schedFor(c, n).label) : ''}</small></div></div>
      <button class="fact" data-action="open" data-id="${c.id}"><div class="k">Meet at</div><div class="v">${esc(c.meetSpot)}<small>${n ? travelText(c, n) : ''}</small></div></button>
    </div>
    ${f.length ? `<div class="section" style="margin-top:0"><div class="who">${avStack(f, 'sm', true)}<div><div class="wt">${going(c)}</div><div class="ws">Friends going to the next run</div></div></div></div>` : ''}
    <div class="section"><h3 class="section-title">Pace groups</h3><p class="section-sub">Measured from the club’s last 4 group runs on Strava, not what the club says.</p>
      <div class="pace-groups">${c.groups.map(g => `<div class="pg ${g === mine ? 'you' : ''}"><div class="pg-pace">${g.pace ? fmtPace(g.pace) : esc(g.actual)}<small>${g.mile ? esc(g.mile) + ' mile' : 'easy /mi'}</small></div><div class="pg-stats">Usually <b>${g.usual}</b> runners${g.pace ? ` · ran <b>${g.actual}</b> avg` : ''}<br><b>${g.dropped}</b> dropped in the last 4 runs</div>${g === mine ? tagHtml('You', 'pace') : '<span></span>'}</div>`).join('')}</div></div>
    <div class="section"><div class="callout">${ic('person', 20)}<div><b>First time?</b><span class="muted">${esc(c.firstTimer)} Captain: ${esc(c.captain)}.</span></div></div></div>
    <div class="section"><h3 class="section-title">Upcoming runs</h3><div class="list">${upcoming.map(d => { const r = rsvpOf(c, d); return `<div class="li"><div class="date-tile ${r ? 'on' : ''}"><span><small>${DAY[d.getDay()]}</small><b>${d.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(schedFor(c, d).label)}</div><div class="li-s">${fmtClock(d)} · ${esc(c.meetSpot)}</div></div><button class="btn xs ${r ? 'done' : 'ghost'}" data-action="rsvp" data-id="${c.id}" data-when="${d.toISOString()}">${r ? 'Going' : 'RSVP'}</button></div>`; }).join('')}</div></div>
    <div class="section"><h3 class="section-title">The route · ${esc(c.dist)}</h3><div class="mini-route">${routeSvg(c.route)}</div></div>`;
  pushPage(html, clubCta(c));
}
function clubCta(c) {
  const n = nextOcc(c);
  if (!n) return '';
  return rsvpOf(c, n)
    ? `<button class="btn block done" data-action="rsvp" data-id="${c.id}" data-when="${n.toISOString()}">${ic('check', 18, 2.4)} Going · ${fmtWhen(n)}</button><div class="cta-note">${travelText(c, n)}</div>`
    : `<button class="btn block" data-action="rsvp" data-id="${c.id}" data-when="${n.toISOString()}">RSVP · ${fmtWhen(n)}</button><div class="cta-note">${travelText(c, n)}</div>`;
}
function toggleRsvp(c, when) {
  if (!when) return;
  const id = `rsvp-${c.id}-${+when}`;
  if (S.plans.some(p => p.id === id)) { removePlan(id); toast('RSVP cancelled', 'close'); }
  else {
    addPlan({ id, kind: 'club', ref: c.id, when: when.toISOString(), title: c.name, sub: schedFor(c, when).label, lat: c.lat, lng: c.lng });
    toast(`Going: ${c.name}, ${fmtWhen(when)}. ${travelText(c, when)}.`, 'calendar');
  }
  const top = U.stack[U.stack.length - 1];
  if (top && top.innerHTML.includes('Pace groups')) { popPage(); setTimeout(() => clubPage(c), 240); return; }
  afterChange();
}

/* ---- People ---- */
function partnerPage(p) {
  if (!p) return;
  const friend = !!FRIENDS[p.id];
  const theirPlans = friend ? [...MEETS, ...CLUBS].filter(x => (x.friends || []).includes(p.id)).map(x => ({ x, n: nextOcc(x) })).filter(o => o.n).sort((a, b) => a.n - b.n) : [];
  const chat = S.chats[p.id];
  const html = `${navBar(p.name)}
    <div class="hero" style="padding-top:110px">
      ${av(p, 'lg', false)}<h2 style="margin-top:14px">${esc(p.name)}</h2><div class="hero-sub">${esc(p.bio)}</div>
      <div class="tags">${friend ? tagHtml('Friend', 'ok') : ''}${paceOK({ ...p, type: 'partner' }) ? tagHtml('Your pace', 'pace') : ''}${tagHtml(esc(p.focus))}</div></div>
    <div class="facts">
      <div class="fact"><div class="k">Easy pace</div><div class="v">${fmtPace(p.pace)} /mi<small>You: ${fmtPace(ME.pace)}</small></div></div>
      <div class="fact"><div class="k">Last 4 weeks</div><div class="v">${esc(p.week)}<small>${esc(p.usual)}</small></div></div>
    </div>
    ${p.proof ? `<div class="section" style="margin-top:0"><div class="callout">${ic('route', 20)}<div><b>Recent training</b><span class="muted">${esc(p.proof)}</span></div></div></div>` : ''}
    ${theirPlans.length ? `<div class="section"><h3 class="section-title">${esc(first(p.name))}’s week</h3><div class="list">${theirPlans.map(({ x, n }) => `<button class="li" data-action="detail" data-id="${x.id}"><div class="date-tile"><span><small>${DAY[n.getDay()]}</small><b>${n.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(x.name)}</div><div class="li-s">${TYPE_LABEL[x.type]} · ${fmtShort(n)}</div></div>${ic('chev', 18)}</button>`).join('')}</div></div>` : ''}
    <div class="section"><div class="callout neutral">${ic('shield', 20)}<div><span class="muted" style="margin:0">Pulse shows people by neighborhood, never a live location. Under-18 profiles never appear.</span></div></div></div>`;
  const cta = chat?.status === 'confirmed'
    ? `<button class="btn block done" data-action="chat" data-id="${p.id}">${ic('check', 18, 2.4)} Running together · ${esc(chat.label)}</button>`
    : chat ? `<button class="btn block ghost" data-action="chat" data-id="${p.id}">Waiting for ${esc(first(p.name))}…</button>`
    : friend ? `<button class="btn block" data-action="propose" data-id="${p.id}">Ask ${esc(first(p.name))} to run</button>`
    : `<button class="btn block" data-action="propose" data-id="${p.id}">Propose a run</button><div class="cta-note">They see your first name and pace, nothing else</div>`;
  pushPage(html, cta);
}
const personFor = id => FRIENDS[id] ? { ...FRIENDS[id], proof: `${FRIENDS[id].week} · ${FRIENDS[id].usual}`, slots: [{ d: 1, h: 19, m: 0, what: '5 mi easy · Westwood loop' }, { d: 3, h: 7, m: 30, what: '6 mi easy · San Vicente' }], area: 'Westwood', lat: 34.0627, lng: -118.4470 } : PARTNERS.find(x => x.id === id);

/* ============ 8. Flows ============ */
function openPersonalize() {
  if (U.tab !== 'maps' || !$('#modal').hidden) return;
  openModal(`<div class="steps-dots"><i class="on"></i><i></i></div>
    <h3>Where are you starting from?</h3><p class="lead">One map for everyone. Two taps to sort it for you.</p>
    <button class="choice" data-action="p1" data-v="hs"><span class="ch-ic">${ic('trophy', 22)}</span><div><div class="ct">I ran track or XC in high school</div><div class="cs">Meets, seeded heats and real workouts</div></div></button>
    <button class="choice" data-action="p1" data-v="casual"><span class="ch-ic">${ic('run', 22)}</span><div><div class="ct">I run a few times a week</div><div class="cs">People and groups at my pace</div></div></button>
    <button class="choice" data-action="p1" data-v="new"><span class="ch-ic">${ic('seedling', 22)}</span><div><div class="ct">I’m just starting</div><div class="cs">Beginner groups, no pressure</div></div></button>
    <button class="skip" data-action="p-skip">Skip for now</button>`, { locked: true });
}
function personalizeStep2() {
  $('.modal-card').innerHTML = `<div class="modal-grab"></div><div class="steps-dots"><i class="on"></i><i class="on"></i></div>
    <h3>What do you want this week?</h3><p class="lead">Your pace is set from your last 6 runs: <b style="color:var(--text)">${fmtPace(ME.pace)}/mi easy</b>. Strava predicts a ${fmtPace(ME.predict.Mile)} mile.</p>
    <button class="choice" data-action="p2" data-v="meets"><span class="ch-ic">${ic('flag', 22)}</span><div><div class="ct">A race</div><div class="cs">All-comers meets and time trials</div></div></button>
    <button class="choice" data-action="p2" data-v="tracks"><span class="ch-ic">${ic('track', 22)}</span><div><div class="ct">A track to train on</div><div class="cs">Open hours, crowds and workouts</div></div></button>
    <button class="choice" data-action="p2" data-v="crew"><span class="ch-ic">${ic('club', 22)}</span><div><div class="ct">A crew to run with</div><div class="cs">Club runs at my pace</div></div></button>
    <button class="choice" data-action="p2" data-v="all"><span class="ch-ic">${ic('pin', 22)}</span><div><div class="ct">All of it</div><div class="cs">I just moved here</div></div></button>`;
}
function finishPersonalize(want) {
  S.want = want; S.personalized = true;
  if (S.background === 'new') S.band = 90;
  save(); closeModal(); updateMap();
  setTimeout(planWeekModal, 250);
}

function parsePace(str) {
  const s = String(str).trim().replace(/[^\d:.]/g, '');
  let m, sec;
  if (s.includes(':')) { [m, sec] = s.split(':').map(Number); }
  else if (s.includes('.')) { const f = parseFloat(s); m = Math.floor(f); sec = Math.round((f - m) * 60); }
  else if (s.length >= 3) { m = +s.slice(0, -2); sec = +s.slice(-2); }
  else { m = +s; sec = 0; }
  if (!Number.isFinite(m) || !Number.isFinite(sec) || sec >= 60) return null;
  const v = m * 60 + sec;
  return v >= 240 && v <= 960 ? v : null; // 4:00 to 16:00 per mile
}
function setTarget(v) {
  S.target = v && v !== ME.pace ? Math.max(240, Math.min(960, v)) : null;
  save(); updateMap();
  if (U.tab === 'you') renderYou();
}
function lensKpi() {
  const w = curWin(), total = eventsIn(w).length, n = eventsIn(w).filter(paceOK).length;
  return `${ic('target', 20)}<span><b>${n} of ${total}</b> ${dayTitle().toLowerCase()} fit ${S.band ? `${fmtPace(tgt())} ±${fmtPace(S.band)}` : 'any pace'}</span>`;
}
function lensModal() {
  const opts = [[0, 'Off'], [30, '±0:30'], [60, '±1:00'], [90, '±1:30']];
  const presets = [[ME.pace, 'Easy'], [ME.pace - 60, 'Steady'], [Math.round(ME.predict.Mile * 1.12), 'Tempo']];
  openModal(`<h3>Your pace</h3><p class="lead">Set the pace you want to run with. Pulse highlights club groups, workouts and heats near it.</p>
    <div class="label-sm">Target pace</div>
    <div class="pace-in">
      <button class="step" data-action="pace-step" data-d="-15" aria-label="15 seconds faster">−</button>
      <label class="pace-field"><input id="paceInput" inputmode="decimal" autocomplete="off" maxlength="5" value="${fmtPace(tgt())}" aria-label="Target pace, minutes and seconds per mile"><span>/mi</span></label>
      <button class="step" data-action="pace-step" data-d="15" aria-label="15 seconds slower">+</button>
    </div>
    <div class="pace-meta"><span id="paceSrc">${S.target ? 'Custom pace' : 'Your easy pace from your last 6 runs'}</span>${S.target ? `<button class="link" data-action="pace-reset">Reset to ${fmtPace(ME.pace)}</button>` : ''}</div>
    <div class="pace-presets">${presets.map(([v, l]) => `<button class="opt ${tgt() === v ? 'on' : ''}" data-action="pace-set" data-v="${v}">${l} · ${fmtPace(v)}</button>`).join('')}</div>
    <div class="label-sm">Range</div>
    <div class="opt-row">${opts.map(([b, l]) => `<button class="opt ${S.band === b ? 'on' : ''}" data-action="set-band" data-b="${b}">${l}</button>`).join('')}</div>
    <div class="kpi" id="paceKpi">${lensKpi()}</div>
    <button class="btn block white" data-action="close-modal">Done</button>`);
  const inp = $('#paceInput');
  inp.addEventListener('input', () => {
    const v = parsePace(inp.value);
    inp.classList.toggle('bad', v === null && inp.value.trim().length >= 3);
    if (v === null) return;
    setTarget(v);
    $('#paceKpi').innerHTML = lensKpi();
    $('#paceSrc').textContent = S.target ? 'Custom pace' : 'Your easy pace from your last 6 runs';
    $$('[data-action="pace-set"]').forEach(b => b.classList.toggle('on', +b.dataset.v === tgt()));
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  inp.addEventListener('blur', () => { inp.value = fmtPace(tgt()); inp.classList.remove('bad'); });
  inp.addEventListener('focus', () => inp.select());
}

/* ---- Plan my first week: the wow moment ---- */
function buildWeek() {
  const horizon = at(7, 23, 59);
  const meet = MEETS.filter(m => m.forPace && !m.road && m.when > NOW && m.when < horizon).sort((a, b) => (!heatFor(a) - !heatFor(b)) || (friendsOf(b).length - friendsOf(a).length) || (a.when - b.when))[0];
  // a club run you can get to easily beats an earlier one across town
  const clubs = CLUBS.filter(c => paceOK(c) && c.beginner).map(c => ({ c, n: occurrences(c, NOW, horizon).find(d => !meet || !sameDay(d, meet.when)) })).filter(x => x.n)
    .sort((a, b) => ((travel(a.c).mins > 15) - (travel(b.c).mins > 15)) || (a.n - b.n));
  const run = clubs[0];
  const busy = [run && run.n, meet && meet.when].filter(Boolean);
  const sessions = allSessions().filter(s => s.forPace && !s.mine && s.when > NOW && !busy.some(b => sameDay(b, s.when))).sort((a, b) => a.when - b.when);
  const ses = sessions.find(s => s.friend) || sessions[0];
  const g = run && myGroup(run.c);
  return [
    run && { kind: 'club', ref: run.c.id, when: run.n, k: `Club run · ${travel(run.c).mins} min ${travel(run.c).mode}`, t: run.c.name, s: `${schedFor(run.c, run.n).label}${g ? ` · ${fmtPace(g.pace)} group ran ${g.actual}, ${g.dropped} dropped` : ''}${friendsOf(run.c).length ? ` · ${friendsOf(run.c).map(f => first(f.name)).join(' & ')} going` : ''}`, item: run.c },
    ses && { kind: 'session', ref: ses.id, track: ses.track, when: ses.when, k: `Track workout · ${trackOf(ses.track).name}`, t: `${first(ses.who)}’s ${ses.workout}`, s: `${ses.rest} · ${ses.joined} joined · at your pace`, item: trackOf(ses.track) },
    meet && { kind: 'meet', ref: meet.id, when: meet.when, k: `Meet · ${trackOf(meet.venue)?.name || ''}`, t: meet.name, s: `${defaultEvents(meet).join(' + ')} · seeded in ${heatFor(meet)?.name || 'your heat'} · ${friendsOf(meet).length ? friendsOf(meet).map(f => first(f.name)).join(' & ') + ' racing' : meet.registered + ' going'}`, item: meet },
  ].filter(Boolean).sort((a, b) => a.when - b.when);
}
function planWeekModal() {
  const week = buildWeek();
  U.week = week;
  const firstRun = week.find(w => w.kind === 'club') || week[0];
  openModal(`<h3>Your first week in LA</h3><p class="lead">Picked for your pace and the times you usually run. Remove anything you don’t want.</p>
    <div class="plan-tl">${week.map((w, i) => `<div class="tl-item" id="tl-${i}"><div class="date-tile"><span><small>${DAY[w.when.getDay()]}</small><b>${w.when.getDate()}</b></span></div><div class="tl-main"><div class="tl-k">${esc(w.k)} · ${fmtShort(w.when)}</div><div class="tl-t">${esc(w.t)}</div><div class="tl-s">${esc(w.s)}</div></div><button class="tl-x" data-action="week-remove" data-i="${i}" aria-label="Remove">${ic('close', 16, 2.2)}</button></div>`).join('')}</div>
    ${firstRun ? `<div class="kpi">${ic('timer', 20)}<span>First group run: <b>${fmtDay(firstRun.when).toLowerCase()}, ${fmtShort(firstRun.when)}</b>. Without a map like this, most new movers take weeks to find one.</span></div>` : ''}
    <button class="btn block" data-action="week-add">Add ${week.length} to my week</button>
    <button class="skip" data-action="close-modal">Not now</button>`);
}
function addWeek() {
  const week = (U.week || []).filter(Boolean);
  week.forEach(w => {
    if (w.kind === 'club') addPlan({ id: `rsvp-${w.ref}-${+w.when}`, kind: 'club', ref: w.ref, when: w.when.toISOString(), title: w.t, sub: schedFor(w.item, w.when).label, lat: w.item.lat, lng: w.item.lng });
    if (w.kind === 'session') addPlan({ id: `join-${w.ref}`, kind: 'session', ref: w.ref, track: w.track, when: w.when.toISOString(), title: w.t, sub: trackOf(w.track).name, lat: w.item.lat, lng: w.item.lng });
    if (w.kind === 'meet') { S.regs[w.ref] = defaultEvents(w.item); addPlan({ id: `meet-${w.ref}`, kind: 'meet', ref: w.ref, when: w.when.toISOString(), title: w.t, sub: S.regs[w.ref].join(' + '), lat: w.item.lat, lng: w.item.lng }); }
  });
  save(); closeModal();
  if (U.tab !== 'maps') setTab('maps');
  S.day = 0; S.part = 'all';
  setSheet('peek');
  homeView(true);
  updateMap();
  const f = week[0];
  if (f) setTimeout(() => toast(`Your week is set. First run: ${fmtDay(f.when).toLowerCase()} at ${fmtShort(f.when)}.`, 'calendar', 3400), 500);
}

/* ---- Register ---- */
function registerModal(m) {
  if (!U.selEvents[m.id]) U.selEvents[m.id] = defaultEvents(m);
  const render = () => {
    const sel = U.selEvents[m.id];
    return `<h3>Pre-register</h3><p class="lead">${esc(m.name)} · ${fmtWhen(m.when)}. Free now, pay ${esc(m.fees)} at check-in.</p>
      <div class="list" style="margin-bottom:16px">${m.events.map(e => { const on = sel.includes(e.name); const h = e.heats && m.forPace ? heatFor(m, e.name) : null; return `<button class="ev ${on ? 'on' : ''}" data-action="pick-event-modal" data-id="${m.id}" data-ev="${esc(e.name)}"><span class="time">${fmtShort(eventTime(m, e))}</span><span class="box">${ic('check', 14, 3)}</span><div><div class="en">${esc(e.name)}</div><div class="es">${e.n} entered${h ? ` · You: ${h.name}` : ''}</div></div></button>`; }).join('')}</div>
      <button class="btn block" data-action="confirm-register" data-id="${m.id}" ${sel.length ? '' : 'disabled style="opacity:.4"'}>Pre-register · ${sel.length ? esc(sel.join(' + ')) : 'pick an event'}</button>`;
  };
  U.regRender = render;
  openModal(render());
}
function confirmRegister(m) {
  const ev = U.selEvents[m.id] || defaultEvents(m);
  if (!ev.length) return;
  S.regs[m.id] = [...ev];
  addPlan({ id: `meet-${m.id}`, kind: 'meet', ref: m.id, when: m.when.toISOString(), title: m.name, sub: ev.join(' + '), lat: m.lat, lng: m.lng });
  closeModal();
  closeAllPages();
  ticketPage(m, true);
  refresh();
}

/* ---- Sessions ---- */
function joinSession(s) {
  const id = `join-${s.id}`;
  if (S.plans.some(p => p.id === id)) { removePlan(id); toast('Left the workout', 'close'); }
  else {
    const t = trackOf(s.track);
    addPlan({ id, kind: 'session', ref: s.id, track: s.track, when: s.when.toISOString(), title: `${first(s.who)}’s ${s.workout}`, sub: t.name, lat: t.lat, lng: t.lng });
    toast(`Joined ${first(s.who)}’s ${s.workout}, ${fmtDay(s.when).toLowerCase()} at ${fmtShort(s.when)}`, 'bolt');
  }
  const top = U.stack[U.stack.length - 1];
  if (top && top.innerHTML.includes('Workout board')) { popPage(); setTimeout(() => trackPage(trackOf(s.track)), 240); return; }
  afterChange();
}
function sessionModal(t) {
  U.ses = { track: t.id, when: '0,19,0', what: '6 × 400m @ 2:00' };
  openModal(`<h3>Post a workout</h3><p class="lead">${esc(t.name)}. Runners within ±${fmtPace(S.band || 60)} of your pace see it on Pulse and can join.</p>
    <div class="label-sm">When</div><div class="opt-row">${[['0,19,0', 'Tonight 7:00'], ['1,6,30', 'Tomorrow 6:30a'], ['1,18,30', 'Tomorrow 6:30p']].map(([v, l], i) => `<button class="opt ${i === 0 ? 'on' : ''}" data-action="ses-pick" data-group="when" data-val="${v}">${l}</button>`).join('')}</div>
    <div class="label-sm">Workout</div><div class="opt-row">${['6 × 400m @ 2:00', '4 × 800m @ 4:10', 'Easy laps + strides', 'Mile time trial'].map((w, i) => `<button class="opt ${i === 0 ? 'on' : ''}" data-action="ses-pick" data-group="what" data-val="${w}">${w}</button>`).join('')}</div>
    <button class="btn block" data-action="confirm-session">Post to the workout board</button>`);
}
function confirmSession() {
  const t = trackOf(U.ses.track);
  const [d, h, m] = U.ses.when.split(',').map(Number);
  const when = at(d, h, m);
  const s = { id: 'my' + Date.now(), type: 'session', track: t.id, who: ME.name, initials: ME.initials, hue: 15, when: when.toISOString(), workout: U.ses.what, rest: 'Rest as you like', effort: 480, joined: 0, want: 3, forPace: true };
  S.mySessions.push(s);
  addPlan({ id: `join-${s.id}`, kind: 'session', ref: s.id, track: t.id, when: when.toISOString(), title: `Your ${s.workout}`, sub: t.name, lat: t.lat, lng: t.lng });
  closeModal(); closeAllPages();
  S.day = d; save();
  select(t.id);
  toast(`Posted. ${t.atPaceNow} runners at your pace nearby can join.`, 'bolt');
  setTimeout(() => { const mine = S.mySessions.find(x => x.id === s.id); if (mine) { mine.joined = 2; save(); refresh(); toast(`Jordan and 1 other joined your ${s.workout}`, 'club'); } }, 4200);
}

/* ---- Propose a run ---- */
function proposeModal(p) {
  const slots = p.slots || [];
  U.prop = { id: p.id, i: 0 };
  openModal(`<h3>Run with ${esc(first(p.name))}</h3><p class="lead">Times that fit both your schedules. ${esc(first(p.name))} sees your first name and pace.</p>
    <div class="label-sm">Pick a time</div>
    <div class="list" style="margin-bottom:18px">${slots.map((s, i) => { const d = at(s.d, s.h, s.m); return `<button class="ev ${i === 0 ? 'on' : ''}" data-action="prop-pick" data-i="${i}"><span class="time">${DAY[d.getDay()]} ${fmtShort(d)}</span><span class="box">${ic('check', 14, 3)}</span><div><div class="en">${esc(s.what.split(' · ')[0])}</div><div class="es">${esc(s.what.split(' · ')[1] || '')}</div></div></button>`; }).join('')}</div>
    <button class="btn block" data-action="send-propose">Send</button>`);
}
function sendPropose() {
  const p = personFor(U.prop.id), s = p.slots[U.prop.i], d = at(s.d, s.h, s.m);
  const label = `${DAY[d.getDay()]} ${fmtShort(d)}`;
  S.chats[p.id] = { status: 'sent', label, what: s.what, when: d.toISOString() };
  save();
  chatModal(p);
  setTimeout(() => {
    S.chats[p.id].status = 'confirmed';
    addPlan({ id: `run-${p.id}`, kind: 'run', ref: p.id, when: d.toISOString(), title: `Run with ${first(p.name)}`, sub: s.what, lat: p.lat, lng: p.lng });
    if (!$('#modal').hidden && $('#chatBox')) chatModal(p);
    toast(`${first(p.name)} is in. Added to your week.`, 'calendar');
    const top = U.stack[U.stack.length - 1];
    if (top && $('.cta-bar', top)) setCta(`<button class="btn block done" data-action="chat" data-id="${p.id}">${ic('check', 18, 2.4)} Running together · ${esc(label)}</button>`);
    afterChange();
  }, 1800);
}
function chatModal(p) {
  const c = S.chats[p.id];
  if (!c) return proposeModal(p);
  openModal(`<div class="row" style="margin-bottom:6px">${av(p, 'sm', false)}<div><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">${fmtPace(p.pace)}/mi easy · ${esc(p.area || '')}</div></div></div>
    <div class="chat" id="chatBox"><div class="bubble me">Want to run ${esc(c.label)}? ${esc(c.what)}<small>Sent from Pulse</small></div>
    ${c.status === 'confirmed' ? `<div class="bubble them">I’m in. Meet at the start, I’ll be in an orange jacket.</div>` : `<div class="bubble them" style="opacity:.6">typing…</div>`}</div>
    ${c.status === 'confirmed' ? `<div class="kpi">${ic('calendar', 20)}<span><b>Run with ${esc(first(p.name))}</b> is in your week · ${esc(c.label)}</span></div>` : ''}
    <button class="btn block ghost" data-action="close-modal">Close</button>`);
}

/* ---- Inbox ---- */
function inboxModal() {
  const items = [
    ['club', 'Westwood Night Owls', 'Captain Maya: 3 new runners from Pulse tonight. Meet at the fountain at 6:50.', '12m'],
    ['flag', 'Westside Mile Night', 'Kai and Lena pre-registered. Heat sheets post the day before.', '1h'],
    ['bolt', 'SMC Corsair Field', 'Sam posted 6 × 400m @ 2:00 for tonight, 7:00 PM.', '2h'],
  ];
  Object.entries(S.chats).forEach(([id, c]) => { const p = personFor(id); if (p) items.unshift(['chat', p.name, c.status === 'confirmed' ? `I’m in for ${c.label}.` : 'Waiting for a reply…', 'now']); });
  openModal(`<h3>Inbox</h3><div class="list" style="margin:10px 0 18px">${items.map(([i, t, s, w]) => `<div class="li"><span class="tile">${ic(i, 20, 2)}</span><div class="li-main"><div class="li-t">${esc(t)}</div><div class="li-s" style="white-space:normal">${esc(s)}</div></div><span class="muted" style="font-size:12px">${w}</span></div>`).join('')}</div><button class="btn block ghost" data-action="close-modal">Close</button>`);
}

/* ---- Results loop ---- */
function fastForward() {
  let id = Object.keys(S.regs).find(x => !S.results.some(r => r.meetId === x) && MEETS.find(m => m.id === x && m.seeded && m.forPace && !m.road));
  if (!id) { id = 'm1'; S.regs.m1 = defaultEvents(MEETS[0]); }
  const m = MEETS.find(x => x.id === id), evs = S.regs[id];
  const items = evs.map(ev => {
    if (ev === 'Mile' || ev === '1600m') return { event: ev, time: '8:04', place: 4, field: 13, heat: 'Heat 3', pr: true };
    if (ev === '400m') return { event: ev, time: '1:36.8', place: 6, field: 9, heat: 'Heat 2' };
    if (ev === '800m') return { event: ev, time: '3:31', place: 5, field: 10, heat: 'Heat 2' };
    return { event: ev, time: ev === '1500m' ? '7:32' : '14:58', place: 7, field: 14, heat: 'Heat 2' };
  });
  S.results = S.results.filter(r => r.meetId !== id);
  S.results.push({ meetId: id, items, date: m.when.toISOString() });
  removePlan(`meet-${id}`);
  save();
  closeModal(); closeAllPages();
  if (U.tab !== 'home') setTab('home');
  whatsNextPage(m, items);
}
function whatsNextPage(m, items) {
  const main = items[0];
  const next = MEETS.find(x => x.id === 'm5');
  const club = CLUBS[0], cn = nextOcc(club);
  const raced = [['Riley Brooks', 'RB', 260, '8:01', 'Runs with Westwood Night Owls'], ['Noah Kim', 'NK', 100, '8:09', 'Trains at SMC on Tuesdays'], ['Jess Park', 'JP', 320, '8:15', 'Runs with Venice Track Collective']];
  const html = `${navBar('Race result')}
    <div style="padding:0 16px">
      <div class="official"><div class="o-k">${ic('shield', 14, 2.4)} Official result · FAT</div><div class="o-t">${main.time}</div><div class="o-s">${esc(main.event)} · ${main.heat} · ${main.place} of ${main.field}${main.pr ? ' · first race since high school' : ''}</div>
      ${items.slice(1).map(r => `<div class="o-s" style="margin-top:6px">${esc(r.event)} · <b style="color:var(--text)">${r.time}</b> · ${r.place} of ${r.field}</div>`).join('')}</div>
      <p class="muted" style="font-size:13px;margin:10px 2px 0">${esc(m.name)} · stamped onto your Strava activity and shared with your followers.</p>
    </div>
    <div class="section"><h3 class="section-title">You raced with</h3><p class="section-sub">Runners from your heat, close to your time.</p><div class="list">${raced.map(([n, ini, hue, t, s]) => { const on = S.follows[ini]; return `<div class="li">${av({ name: n, initials: ini, hue }, 'sm', false)}<div class="li-main"><div class="li-t">${n}</div><div class="li-s">Mile ${t} · ${s}</div></div><button class="btn xs ${on ? 'done' : ''}" data-action="follow" data-id="${ini}">${on ? 'Following' : 'Follow'}</button></div>`; }).join('')}</div></div>
    <div class="section"><h3 class="section-title">What’s next</h3><div class="list">
      ${next ? `<button class="li" data-action="detail" data-id="${next.id}"><div class="date-tile on"><span><small>${DAY[next.when.getDay()]}</small><b>${next.when.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(next.series)}</div><div class="li-s">Seeded in Heat 3 from today’s ${main.time}</div></div>${ic('chev', 18)}</button>` : ''}
      ${cn ? `<button class="li" data-action="detail" data-id="${club.id}"><div class="date-tile"><span><small>${DAY[cn.getDay()]}</small><b>${cn.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(club.name)}</div><div class="li-s">Riley runs the 10:30 group · ${fmtShort(cn)}</div></div>${ic('chev', 18)}</button>` : ''}
      <div class="li"><span class="tile">${ic('trophy', 20, 2)}</span><div class="li-main"><div class="li-t">Winter Twilight Series</div><div class="li-s">1 of 3 meets · finish the series for the badge</div></div></div>
    </div></div>`;
  pushPage(html, next ? `<button class="btn block" data-action="detail" data-id="${next.id}">Pre-register for Meet 3</button>` : '');
}

/* ============ 9. Home / Groups / You / Workout ============ */
function trackRunSvg() {
  return `<svg viewBox="0 0 390 200" preserveAspectRatio="xMidYMid slice"><rect width="390" height="200" fill="#1a1f2b"/>
    <path d="M0 40 L390 10 M0 180 L390 150 M60 0 L40 200 M330 0 L350 200" stroke="#262c3a" stroke-width="10"/>
    <rect x="128" y="18" width="124" height="166" rx="62" fill="#3a2a26"/><rect x="150" y="52" width="80" height="98" fill="#1e3a33"/>
    <path d="M146 36 Q190 10 232 36 L238 164 Q190 192 142 164 Z" fill="none" stroke="#fc5200" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M142 42 Q190 14 236 42 L234 160 Q190 188 146 160 Z" fill="none" stroke="#fc5200" stroke-width="3" opacity=".8"/></svg>`;
}
function activityCard(a) {
  const k = !!S.kudos[a.id];
  return `<article class="activity">
    <div class="a-head">${a.avatar}<div><div class="a-name">${esc(a.who)}</div><div class="a-meta">${a.meta}</div></div></div>
    <h3>${esc(a.title)}</h3>
    ${a.official ? `<div style="padding:0 16px 12px"><div class="official" style="padding:12px 14px"><div class="o-k">${ic('shield', 13, 2.4)} Official result · FAT</div><div class="o-s" style="color:var(--text);font-weight:700;font-size:15px;margin-top:4px">${esc(a.official)}</div></div></div>` : ''}
    <div class="a-stats">${a.stats.map(([kk, v]) => `<div><div class="k">${kk}</div><div class="v">${v}</div></div>`).join('')}</div>
    ${a.note ? `<button class="a-note" ${a.noteId ? `data-action="${a.noteAction || 'detail'}" data-id="${a.noteId}"` : ''}>${ic(a.noteIcon || 'trophy', 18)}<span style="flex:1">${a.note}</span>${a.noteId ? ic('chev', 16) : ''}</button>` : ''}
    ${a.map ? `<div class="a-map">${a.map}</div>` : ''}
    <div class="a-foot"><span class="a-kudos">${(a.kudos || 0) + (k ? 1 : 0)} kudos</span><div class="a-actions"><button class="${k ? 'on' : ''}" data-action="kudos" data-id="${a.id}" aria-label="Give kudos">${ic('thumb', 22)}</button><button data-action="share" aria-label="Share">${ic('share', 21)}</button></div></div>
  </article>`;
}
const venueLink = (id, name) => `<button data-action="detail" data-id="${id}">${esc(name)}</button>`;
function homeActivities() {
  const list = [];
  S.results.slice().reverse().forEach(r => {
    const m = MEETS.find(x => x.id === r.meetId), main = r.items[0];
    list.push({ id: 'r-' + r.meetId, who: ME.name, avatar: av({ hue: 15, initials: ME.initials }, '', false), meta: `${fmtDay(new Date(r.date))} · ${m.venue ? venueLink(m.venue, trackOf(m.venue).name) : esc(m.place || '')}`,
      title: m.name, official: `${main.event} ${main.time} · ${main.heat} · ${main.place} of ${main.field}`, stats: [['Events', r.items.length], ['Best', main.time], ['Place', `${main.place}/${main.field}`]],
      note: 'Next in the series: Meet 3', noteId: 'm5', noteIcon: 'flag', kudos: 23 });
  });
  S.activities.slice().reverse().forEach(a => {
    const d = new Date(a.date), best = a.splits && a.splits.length ? Math.min(...a.splits) : null;
    list.push({ id: a.id, who: ME.name, avatar: av({ hue: 15, initials: ME.initials }, '', false), meta: `${fmtDay(d)} at ${fmtClock(d)} · ${a.mode === 'sim' ? 'Simulated' : 'Recorded with GPS'}`,
      title: a.title, stats: [['Distance', a.dist.toFixed(2) + ' mi'], ['Pace', (a.pace ? fmtPace(a.pace) : '–:––') + ' /mi'], ['Time', fmtDur(a.time)]],
      map: a.pts && a.pts.length > 1 ? routeSvg(a.pts, 390, 200, { pad: 22 }) : '', note: best ? `${a.splits.length} mile split${a.splits.length > 1 ? 's' : ''} · fastest ${fmtDur(best)}` : 'View activity', noteAction: 'activity', noteId: a.id, noteIcon: 'timer', kudos: 0 });
  });
  list.push(
    { id: 'a-kai', who: 'Kai Nakamura', avatar: av(FRIENDS.kai, ''), meta: `Yesterday at 6:31 PM · ${venueLink('t1', 'Drake Stadium')}`, title: 'Track intervals · 6 × 400m', stats: [['Distance', '4.20 mi'], ['Pace', '7:58 /mi'], ['Time', '33m 29s']], kudos: 14, note: 'Workout with Bruin Sunrise Milers', noteId: 'c2', noteIcon: 'club' },
    { id: 'a-ian', who: ME.name, avatar: av({ hue: 15, initials: ME.initials }, '', false), meta: 'November 3 at 6:17 AM · Los Angeles, California', title: 'Morning Run', stats: [['Distance', '4.08 mi'], ['Pace', '10:42 /mi'], ['Time', '43m 44s']], note: 'Your fastest 5K ever', noteIcon: 'trophy', map: trackRunSvg(), kudos: 6 },
    { id: 'a-lena', who: 'Lena Ortiz', avatar: av(FRIENDS.lena, ''), meta: `2 days ago · ${venueLink('t3', 'Venice High Track')}`, title: 'Track night, 5 × 400m', stats: [['Distance', '3.10 mi'], ['Pace', '9:12 /mi'], ['Time', '28m 31s']], kudos: 9, note: 'With Venice Track Collective', noteId: 'c3', noteIcon: 'club' },
  );
  return list;
}
function renderHome() {
  const w = windowFor(0, 'all');
  const ev = eventsIn(w), atPace = ev.filter(paceOK).length, tracks = TRACKS.filter(t => trackOpenAt(t, NOW)).length;
  const friendsGoing = new Set(ev.flatMap(e => e.friends || []).concat(ev.filter(e => e.friend).map(e => e.friend))).size;
  const ps = plansSorted();
  const scrolled = $('#screen-home').scrollTop > 8;
  $('#screen-home').innerHTML = `
    <header class="home-head ${scrolled ? 'scrolled' : ''}"><div class="topbar"><button data-tab="you" aria-label="Your profile">${av({ hue: 15, initials: ME.initials }, '', false)}</button>
      <span class="home-title" aria-hidden="true">Home</span>
      <div class="row"><button class="icon-btn" data-action="inbox" aria-label="Messages">${ic('chat', 21)}</button><button class="icon-btn" data-action="inbox" aria-label="Notifications">${ic('bell', 21)}<span class="badge-dot">3</span></button></div></div></header>
    <div class="pulse-card">
      <canvas id="homeHeat" width="732" height="336"></canvas>
      <div class="pc-body"><div class="pc-k"><span class="live-dot"></span> Pulse · near UCLA</div>
        <h3>${ev.length} runs & meets near you tonight</h3>
        <div class="pc-stats">${atPace} at your pace · ${tracks} tracks open now · ${friendsGoing} friend${friendsGoing === 1 ? '' : 's'} going</div>
        <div class="pc-actions">${ps.length ? `<button class="btn" data-tab="maps">Open the map</button>` : `<button class="btn" data-action="go-plan">Plan my first week</button><button class="btn ghost" data-tab="maps">Map</button>`}</div></div></div>
    ${ps.length ? `<div class="home-plans"><div class="section-title" style="font-size:17px;margin:8px 4px 10px">Your week</div><div class="list">${ps.slice(0, 4).map(p => `<button class="li" data-action="open" data-id="${p.kind === 'session' ? p.track : p.ref}"><div class="date-tile on"><span><small>${DAY[p.date.getDay()]}</small><b>${p.date.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(p.title)}</div><div class="li-s">${fmtShort(p.date)} · ${esc(p.sub)}</div></div>${ic('chev', 18)}</button>`).join('')}</div></div>` : ''}
    <div style="height:16px"></div>
    ${homeActivities().map(activityCard).join('')}`;
  drawHomeHeat(ev);
}
function drawHomeHeat(items) {
  const c = $('#homeHeat');
  if (!c) return;
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  const box = { n: 34.085, s: 33.975, w: -118.53, e: -118.33 };
  const P = (la, ln) => [(ln - box.w) / (box.e - box.w) * W, (box.n - la) / (box.n - box.s) * H];
  ctx.fillStyle = '#0b0e16'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#141a26'; ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.moveTo(i * 48, 0); ctx.lineTo(i * 48 - 90, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * 30); ctx.lineTo(W, i * 30 + 60); ctx.stroke(); }
  ctx.fillStyle = '#08121f'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(P(34.03, -118.515)[0], 0); ctx.lineTo(P(33.97, -118.46)[0], H); ctx.lineTo(0, H); ctx.fill();
  // the same street heatmap as the map, at thumbnail scale
  const [bx0, by0] = merc(box.n, box.w), [bx1, by1] = merc(box.s, box.e);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const lv = Array.from({ length: 6 }, () => []);
  HEAT_WAYS.forEach(w => lv[Math.min(5, Math.floor(w.w * 6))].push(w));
  lv.forEach((list, i) => {
    const t = (i + 0.5) / 6;
    ctx.beginPath();
    for (const w of list) for (let j = 0; j < w.xy.length; j += 2) { const x = (w.xy[j] - bx0) / (bx1 - bx0) * W, y = (w.xy[j + 1] - by0) / (by1 - by0) * H; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    if (t > 0.4) { ctx.strokeStyle = `rgba(252,82,0,${0.06 + t * 0.1})`; ctx.lineWidth = 5 + t * 6; ctx.stroke(); }
    ctx.strokeStyle = heatColor(t, 0.25 + t * 0.55); ctx.lineWidth = 0.9 + t * 1.8; ctx.stroke();
    if (t > 0.6) { ctx.strokeStyle = `rgba(255,236,214,${(t - 0.5) * 1.2})`; ctx.lineWidth = 1; ctx.stroke(); }
  });
  ctx.globalCompositeOperation = 'source-over';
  items.forEach(it => {
    const t = it.type === 'session' ? trackOf(it.track) : it;
    const [x, y] = P(t.lat, t.lng);
    ctx.fillStyle = paceOK(it) ? '#fc5200' : '#55555c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); ctx.stroke();
  });
  const [mx, my] = P(ME.home.lat, ME.home.lng);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx, my, 10, 0, 7); ctx.fill();
  ctx.fillStyle = '#4c8dff'; ctx.beginPath(); ctx.arc(mx, my, 7, 0, 7); ctx.fill();
}

const CHALLENGES = [
  { id: 'ch1', title: 'Winter Twilight Series', sub: 'Race 3 all-comers meets this winter', icon: 'flag', sponsor: 'Northline Running', n: '2,418 joined' },
  { id: 'ch2', title: 'Track nights', sub: 'Join 3 workouts on a public track this month', icon: 'bolt', n: '5,902 joined' },
  { id: 'ch3', title: 'Bring a friend', sub: 'RSVP to a club run with a friend', icon: 'club', n: '1,377 joined' },
];
function renderGroups() {
  const tab = U.groupsTab;
  let body = '';
  if (tab === 'clubs') {
    const clubs = CLUBS.map(c => ({ c, n: nextOcc(c), g: myGroup(c) })).sort((a, b) => (!!b.g - !!a.g) || (a.n - b.n));
    body = `<div class="section" style="margin-top:16px"><h3 class="section-title">Clubs that meet near you</h3><p class="section-sub">Real meetups with measured pace groups.</p></div>
      ${clubs.map(({ c, n, g }) => `<button class="club-row" data-action="detail" data-id="${c.id}">${tile(c, g ? 'on' : 'off')}<div class="li-main"><div class="li-t">${esc(c.name)}</div><div class="li-s">${n ? fmtWhen(n) : '–'} · ${distTxt(c)}</div><div class="tags" style="margin-top:6px">${g ? tagHtml(`Your group ran ${g.actual}`, 'pace') : tagHtml(c.sprint ? 'Sprinters' : 'Faster groups')}${rsvpOf(c, n) ? tagHtml('Going', 'ok') : ''}</div></div>${ic('chev', 18)}</button>`).join('')}
      <div class="section"><button class="btn block ghost" data-action="go-map" data-layer="club">${ic('maps', 18)} See clubs on the map</button></div>`;
  } else if (tab === 'challenges') {
    body = `<div class="section" style="margin-top:16px">${CHALLENGES.map(ch => `<div class="challenge"><span class="ch-badge">${ic(ch.icon, 26, 2)}</span><div class="li-main">${ch.sponsor ? `<div class="sponsor">Sponsored · ${esc(ch.sponsor)}</div>` : ''}<div class="li-t">${ch.title}</div><div class="li-s" style="white-space:normal">${ch.sub} · ${ch.n}</div></div><button class="btn xs ${S.challenges[ch.id] ? 'done' : 'ghost'}" data-action="join-challenge" data-id="${ch.id}">${S.challenges[ch.id] ? 'Joined' : 'Join'}</button></div>`).join('')}</div>`;
  } else {
    const ps = plansSorted();
    body = `<div class="section" style="margin-top:16px">${ps.length ? `<div class="list">${ps.map(p => `<button class="li" data-action="open" data-id="${p.kind === 'session' ? p.track : p.ref}"><div class="date-tile on"><span><small>${DAY[p.date.getDay()]}</small><b>${p.date.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(p.title)}</div><div class="li-s">${fmtShort(p.date)} · ${esc(p.sub)}</div></div>${ic('chev', 18)}</button>`).join('')}</div>` : `<div class="card empty">Nothing planned yet.<br><br><button class="btn sm" data-action="go-plan">Plan my first week</button></div>`}</div>`;
  }
  $('#screen-groups').innerHTML = `<div class="topbar"><span style="width:42px"></span><div class="topbar-title">Groups</div><span style="width:42px"></span></div>
    <div class="tabs2">${[['plans', 'Your week'], ['challenges', 'Challenges'], ['clubs', 'Clubs']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-action="groups-tab" data-t="${k}" aria-pressed="${tab === k}"><span>${l}</span></button>`).join('')}</div>${body}`;
}

function renderYou() {
  const ps = plansSorted();
  const runs = 1 + S.activities.length + S.results.length;
  const persona = { hs: 'Ex-HS athlete', new: 'New runner', casual: 'Runs a few times a week' }[S.background];
  $('#screen-you').innerHTML = `<div class="topbar"><span style="width:42px"></span><div class="topbar-title">You</div><span style="width:42px"></span></div>
    <div class="profile">${av({ hue: 15, initials: ME.initials }, 'lg', false)}<div><h2>${esc(ME.name)}</h2><div class="muted" style="font-size:13.5px">${esc(ME.city)} · ${ME.school}</div><div class="tags" style="margin-top:8px">${tagHtml(`${fmtPace(ME.pace)}/mi easy`)}${persona ? tagHtml(persona) : ''}</div></div></div>
    <div class="section"><h3 class="section-title">Strava predicts</h3><div class="stat-grid">
      <div class="stat"><div class="v">${fmtPace(ME.predict.Mile)}</div><div class="k">Mile</div></div><div class="stat"><div class="v">${fmtPace(ME.predict['400m'])}</div><div class="k">400m</div></div>
      <div class="stat"><div class="v">${ME.best5k}</div><div class="k">5K best effort</div></div><div class="stat"><div class="v">${runs}</div><div class="k">Activities this month</div></div></div></div>
    <div class="section"><h3 class="section-title">Your week</h3>${ps.length ? `<div class="list">${ps.map(p => `<button class="li" data-action="open" data-id="${p.kind === 'session' ? p.track : p.ref}"><div class="date-tile on"><span><small>${DAY[p.date.getDay()]}</small><b>${p.date.getDate()}</b></span></div><div class="li-main"><div class="li-t">${esc(p.title)}</div><div class="li-s">${fmtShort(p.date)} · ${esc(p.sub)}</div></div>${ic('chev', 18)}</button>`).join('')}</div>` : '<p class="section-sub">Nothing planned yet. Open Maps to find a run.</p>'}</div>
    ${S.results.length ? `<div class="section"><h3 class="section-title">Race results</h3>${S.results.map(r => { const m = MEETS.find(x => x.id === r.meetId), x = r.items[0]; return `<button class="official" style="width:100%;margin-bottom:8px;text-align:left" data-action="detail" data-id="${m.id}"><div class="o-k">${ic('shield', 13, 2.4)} Official · ${esc(m.name)}</div><div class="o-t" style="font-size:30px">${x.time}</div><div class="o-s">${esc(x.event)} · ${x.heat} · ${x.place} of ${x.field}</div></button>`; }).join('')}</div>` : ''}
    <div class="section"><h3 class="section-title">Pulse settings</h3><div class="list">
      <button class="li" data-action="lens"><span class="tile">${ic('target', 20, 2)}</span><div class="li-main"><div class="li-t">Pace lens</div><div class="li-s">${S.band ? `Within ±${fmtPace(S.band)} of ${fmtPace(tgt())}/mi${S.target ? ' (custom)' : ''}` : 'Off'}</div></div>${ic('chev', 18)}</button>
      <button class="li" data-action="redo-personalize"><span class="tile">${ic('pin', 20, 2)}</span><div class="li-main"><div class="li-t">Background & goals</div><div class="li-s">${persona || 'Not set'}</div></div>${ic('chev', 18)}</button>
      <button class="li" data-action="discoverable"><span class="tile">${ic('person', 20, 2)}</span><div class="li-main"><div class="li-t">Show me to runners at my pace</div><div class="li-s">Neighborhood and pace only. Off by default.</div></div><span class="toggle ${S.discoverable ? 'on' : ''}"></span></button>
    </div></div>
    <p class="muted" style="font-size:12px;line-height:1.5;padding:18px 18px 0;margin:0">Strava Pulse is a student concept for the Product Space case competition. It is not affiliated with or endorsed by Strava. All clubs, meets, people and crowd data are sample data.</p>`;
}

/* Record lives in js/record.js (real GPS + simulate mode) */

/* ============ 10. Actions & boot ============ */
function afterChange() {
  save();
  if (U.tab === 'maps' && $('#sheet').dataset.state === 'sel' && U.sel) renderSel(byId(U.sel));
  refresh();
}
function openDetail(id) {
  const it = byId(id);
  if (!it) return;
  if (it.type === 'meet') return meetPage(it);
  if (it.type === 'track') return trackPage(it);
  if (it.type === 'club') return clubPage(it);
  if (it.type === 'session') return trackPage(trackOf(it.track));
  return partnerPage(personFor(id) || it);
}

const ACTIONS = {
  ...REC_ACTIONS,
  back: () => popPage(),
  share: () => toast('Share card copied: a story-sized image with your route and result', 'share'),
  toast: el => toast(el.dataset.msg, el.dataset.icon || 'check'),
  'close-modal': () => closeModal(),
  layer: el => { S.layer = el.dataset.layer; save(); if (U.sel) deselect(); updateMap(); },
  lens: () => lensModal(),
  'set-band': el => { S.band = +el.dataset.b; save(); updateMap(); lensModal(); if (U.tab === 'you') renderYou(); },
  'pace-step': el => { setTarget(tgt() + +el.dataset.d); lensModal(); },
  'pace-set': el => { setTarget(+el.dataset.v); lensModal(); },
  'pace-reset': () => { setTarget(null); lensModal(); },
  day: el => { S.day = +el.dataset.i; if (S.day === 0 && S.part === 'am' && NOW.getHours() >= 12) S.part = 'all'; save(); updateMap(); },
  part: el => { S.part = el.dataset.p; save(); updateMap(); },
  open: el => { closeAllPages(); select(el.dataset.id); },
  detail: el => openDetail(el.dataset.id),
  person: el => partnerPage(personFor(el.dataset.id)),
  deselect: () => deselect(),
  'sheet-list': () => setSheet('list'),
  'sheet-peek': () => { if (U.sel) deselect(); else setSheet('peek'); },
  recenter: () => { deselect(); homeView(true); },
  'plan-week': () => planWeekModal(),
  'go-plan': () => { setTab('maps'); if (S.personalized) setTimeout(planWeekModal, 300); },
  'week-remove': el => { const i = +el.dataset.i; U.week[i] = null; const row = $('#tl-' + i); if (row) row.remove(); const n = U.week.filter(Boolean).length; const b = $('[data-action="week-add"]'); if (b) b.textContent = n ? `Add ${n} to my week` : 'Nothing selected'; },
  'week-add': () => addWeek(),
  personalize: () => openPersonalize(),
  p1: el => { S.background = el.dataset.v; personalizeStep2(); },
  p2: el => finishPersonalize(el.dataset.v),
  'p-skip': () => { S.personalized = true; save(); closeModal(); updateMap(); },
  'redo-personalize': () => { S.personalized = false; save(); setTab('maps'); },
  'pick-event': el => {
    const m = byId(el.dataset.id);
    if (S.regs[m.id]) return toast('You’re already pre-registered. Change events at check-in.', 'info');
    const sel = U.selEvents[m.id] || [], ev = el.dataset.ev;
    U.selEvents[m.id] = sel.includes(ev) ? sel.filter(x => x !== ev) : [...sel, ev];
    $('#evList').innerHTML = eventList(m);
    setCta(meetCta(m));
  },
  'pick-event-modal': el => {
    const m = byId(el.dataset.id), sel = U.selEvents[m.id] || [], ev = el.dataset.ev;
    U.selEvents[m.id] = sel.includes(ev) ? sel.filter(x => x !== ev) : [...sel, ev];
    $('.modal-card').innerHTML = `<div class="modal-grab"></div>${U.regRender()}`;
  },
  register: el => registerModal(byId(el.dataset.id)),
  'confirm-register': el => confirmRegister(byId(el.dataset.id)),
  ticket: el => ticketPage(byId(el.dataset.id), false),
  'show-on-map': el => { closeAllPages(); const m = byId(el.dataset.id); S.day = Math.max(0, Math.min(6, dayDiff(m.when))); save(); select(m.id); },
  organizer: el => organizerPage(byId(el.dataset.id)),
  rsvp: el => toggleRsvp(byId(el.dataset.id), el.dataset.when ? new Date(el.dataset.when) : nextOcc(byId(el.dataset.id))),
  join: el => joinSession(byId(el.dataset.id)),
  report: el => { S.reports[el.dataset.id] = el.dataset.k; save(); toast(el.dataset.k === 'open' ? 'Thanks. Marked open for runners heading there.' : el.dataset.k === 'locked' ? 'Thanks. We’ll warn runners before they leave.' : 'Thanks. Marked as team practice.', 'shield'); const t = byId(el.dataset.id); popPage(); setTimeout(() => trackPage(t), 240); },
  'post-session': el => sessionModal(byId(el.dataset.id)),
  'ses-pick': el => { $$(`[data-group="${el.dataset.group}"]`).forEach(b => b.classList.toggle('on', b === el)); U.ses[el.dataset.group] = el.dataset.val; },
  'confirm-session': () => confirmSession(),
  propose: el => proposeModal(personFor(el.dataset.id)),
  'prop-pick': el => { U.prop.i = +el.dataset.i; $$('[data-action="prop-pick"]').forEach(b => b.classList.toggle('on', b === el)); },
  'send-propose': () => sendPropose(),
  chat: el => chatModal(personFor(el.dataset.id)),
  inbox: () => inboxModal(),
  follow: el => { S.follows[el.dataset.id] = !S.follows[el.dataset.id]; save(); el.classList.toggle('done', !!S.follows[el.dataset.id]); el.textContent = S.follows[el.dataset.id] ? 'Following' : 'Follow'; },
  'fast-forward': () => fastForward(),
  reset: () => resetDemo(),
  'go-map': el => { if (el.dataset.layer) { S.layer = el.dataset.layer; save(); } setTab('maps'); },
  kudos: el => { S.kudos[el.dataset.id] = !S.kudos[el.dataset.id]; save(); renderHome(); },
  'groups-tab': el => { U.groupsTab = el.dataset.t; renderGroups(); },
  'join-challenge': el => { S.challenges[el.dataset.id] = !S.challenges[el.dataset.id]; save(); renderGroups(); },
  discoverable: () => { S.discoverable = !S.discoverable; save(); renderYou(); toast(S.discoverable ? 'Runners at your pace can now see your neighborhood and pace.' : 'Hidden from other runners', 'shield'); },
  'run-route': el => { U.runRoute = el.dataset.id; setTab('workout'); toast(`Route loaded: ${byId(el.dataset.id).name}. Tap Start when you’re at the start.`, 'route'); },
  'save-route': el => { S.saved[el.dataset.id] = !S.saved[el.dataset.id]; save(); toast(S.saved[el.dataset.id] ? 'Saved to your routes' : 'Removed from saved routes', 'route'); afterChange(); },
};

function resetDemo() {
  recReset();
  S = freshState(); save();
  U.sel = null; U.selEvents = {}; U.lastPace = null;
  closeAllPages(); closeModal();
  if (map) { overlay.clearLayers(); $('#sheet').dataset.state = 'peek'; homeView(false); }
  setTab('home');
  toast('Demo reset', 'check');
}

function boot() {
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { e.preventDefault(); setTab(tab.dataset.tab); return; }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(el, e); }
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('pin')) { const id = Object.keys(markers).find(k => markers[k].getElement()?.firstElementChild === e.target); if (id) select(id); }
    if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (U.stack.length) popPage(); else deselect(); }
    if (U.tab === 'maps' && /^[1-7]$/.test(e.key) && $('#modal').hidden) { S.day = +e.key - 1; save(); updateMap(); }
    if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.shiftKey) fastForward();
    if (e.key.toLowerCase() === 'o' && !e.metaKey && !e.ctrlKey && !e.shiftKey) organizerPage(MEETS[0]);
    if (e.key.toLowerCase() === 'r' && e.shiftKey) resetDemo();
  });
  initSheet();
  // Home header stays pinned; it picks up a frosted background once you scroll
  $('#screen-home').addEventListener('scroll', e => {
    const h = $('.home-head', e.currentTarget);
    if (h) h.classList.toggle('scrolled', e.currentTarget.scrollTop > 8);
  }, { passive: true });
  $('#recenterFab').innerHTML = ic('nav', 19, 2);
  $('#sbTime').textContent = fmtClock(NOW).replace(/ (AM|PM)/, '');
  const start = (location.hash || '').replace('#', '');
  setTab(['home', 'maps', 'workout', 'groups', 'you'].includes(start) ? start : 'home');
}

boot();
