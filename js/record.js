'use strict';
/* =====================================================================
   Record — a real run recorder.
   • GPS mode: the browser's Geolocation API (needs HTTPS or localhost).
     Filters weak fixes, GPS jitter and spikes; pause starts a new segment.
   • Simulate mode: when location isn't available (e.g. a laptop on stage),
     runs a virtual runner along the loaded route at your easy pace.
   Live map with your trail, time, distance, average + current pace,
   mile splits, then save to your feed with the route.
   Loaded before app.js; only defines functions + REC_ACTIONS.
===================================================================== */

const REC = {
  st: 'idle',          // idle | locating | running | paused
  mode: null,          // gps | sim
  segs: [[]],          // polyline segments (a new one after each pause)
  dist: 0,             // miles
  moving: 0,           // seconds of moving time
  hist: [],            // [{m, d}] for current pace
  splits: [],          // seconds per completed mile
  splitAt: 0,          // moving time at the last split
  last: null,          // last accepted point
  gap: false,          // next point starts a new segment
  watch: null, timer: null, wake: null, acc: null,
  lastTick: 0, follow: true, speed: 10,
  sim: null,           // { route, cum, total, d }
};
let recMap = null, recLine = null, recGlow = null, recGuide = null, recMe = null;

const REC_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';

function recRoute() { return (U.runRoute && byId(U.runRoute)) || null; }

function recInitMap() {
  if (recMap || !window.L) return;
  recMap = L.map('recMap', { zoomControl: false, attributionControl: false, zoomSnap: 0.25 }).setView([ME.home.lat, ME.home.lng], 15);
  L.tileLayer(REC_TILES + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, maxNativeZoom: 16 }).addTo(recMap);
  L.tileLayer(REC_TILES + 'World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, maxNativeZoom: 16, opacity: 0.4 }).addTo(recMap);
  recMap.createPane('heat').style.zIndex = 350;
  recMap.getPane('heat').classList.add('leaflet-heat-pane');
  if (typeof HeatLayer === 'function' || HeatLayer) new HeatLayer().addTo(recMap);
  recGlow = L.polyline([], { color: '#fc5200', weight: 14, opacity: 0.25, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(recMap);
  recLine = L.polyline([], { color: '#ff6a1a', weight: 5, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(recMap);
  recMe = L.marker([ME.home.lat, ME.home.lng], { icon: L.divIcon({ className: 'pm', html: '<div class="me-dot rec-me"><i></i></div>', iconSize: [0, 0], iconAnchor: [0, 0] }), interactive: false, zIndexOffset: 500 }).addTo(recMap);
  recMap.on('dragstart', () => { REC.follow = false; recPaintCenter(); });
}

function recShowGuide() {
  if (!recMap) return;
  if (recGuide) { recGuide.remove(); recGuide = null; }
  const r = recRoute();
  if (r) {
    recGuide = L.polyline(r.route, { color: '#ffffff', weight: 3, opacity: 0.55, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(recMap);
    if (REC.st === 'idle') recMap.fitBounds(L.latLngBounds(r.route), { paddingTopLeft: [30, 110], paddingBottomRight: [30, 30] });
  }
}

/* ---------- render ---------- */
function renderWorkout() {
  const root = $('#screen-workout');
  if (!$('#recMap', root)) {
    root.innerHTML = `<div class="record">
      <div class="record-map"><div id="recMap"></div>
        <div class="rec-top"><span class="sport" id="recSport"></span><button class="gps" id="recGps" data-action="rec-gps-info"></button></div>
        <button class="fab rec-center" id="recCenter" data-action="rec-center" aria-label="Follow my location">${ic('nav', 19, 2)}</button>
      </div>
      <div class="record-panel">
        <div class="rec-big"><div class="v num" id="recTime">0:00</div><div class="k">Moving time</div></div>
        <div class="record-stats">
          <div><div class="v num" id="recDist">0.00</div><div class="k">Distance (mi)</div></div>
          <div><div class="v num" id="recPace">–:––</div><div class="k">Avg pace /mi</div></div>
          <div><div class="v num" id="recNow">–:––</div><div class="k">Current /mi</div></div>
        </div>
        <div class="rec-splits" id="recSplits"></div>
        <div class="record-ctrls" id="recCtrls"></div>
      </div></div>`;
    recMap = null; recGuide = null;
  }
  recInitMap();
  requestAnimationFrame(() => { if (recMap) { recMap.invalidateSize(); recShowGuide(); recRedrawLine(); } });
  recWarmUp();
  recPaint();
}

function recPaint() {
  if (!$('#recCtrls')) return;
  const r = recRoute();
  $('#recSport').innerHTML = `${ic(r ? 'route' : 'run', 16, 2)} ${r ? `${esc(r.name)} · ${r.mi} mi` : 'Run'}`;
  recPaintGps();
  recPaintStats();
  recPaintCenter();
  const c = $('#recCtrls');
  if (REC.st === 'idle') c.innerHTML = `<button class="rec-btn" data-action="rec-start" aria-label="Start recording">START</button>`;
  else if (REC.st === 'locating') c.innerHTML = `<button class="rec-btn locating" disabled aria-label="Finding GPS"><span class="spin"></span></button>`;
  else if (REC.st === 'running') c.innerHTML = `<button class="rec-btn pause" data-action="rec-pause" aria-label="Pause"><svg width="26" height="26" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg></button>`;
  else c.innerHTML = `<button class="rec-btn small" data-action="rec-resume">RESUME</button><button class="rec-btn" data-action="rec-finish">FINISH</button>`;
  $('.record-panel').classList.toggle('paused', REC.st === 'paused');
  renderTabbar();
}

function recPaintGps() {
  const g = $('#recGps');
  if (!g) return;
  let cls = '', txt = '';
  if (REC.mode === 'sim') { cls = 'sim'; txt = `Simulated run · ${REC.speed}×`; }
  else if (REC.st === 'locating') { cls = 'wait'; txt = 'Finding GPS…'; }
  else if (REC.acc == null) { cls = 'off'; txt = 'GPS starts when you tap Start'; }
  else { cls = REC.acc <= 15 ? 'good' : REC.acc <= 35 ? 'ok' : 'weak'; txt = `GPS ±${Math.round(REC.acc)} m`; }
  g.className = `gps ${cls}`;
  g.innerHTML = `<i></i>${txt}`;
}

function recPaceNow() {
  const h = REC.hist;
  if (REC.dist < 0.03 || h.length < 2) return null;
  let s = h[0];
  for (let i = h.length - 1; i >= 0; i--) { if (REC.dist - h[i].d >= 0.12) { s = h[i]; break; } }
  const dd = REC.dist - s.d;
  return dd > 0.01 ? (REC.moving - s.m) / dd : null;
}
function recPaintStats() {
  if (!$('#recTime')) return;
  $('#recTime').textContent = fmtDur(REC.moving);
  $('#recDist').textContent = REC.dist.toFixed(2);
  $('#recPace').textContent = REC.dist > 0.02 ? fmtPace(REC.moving / REC.dist) : '–:––';
  const now = recPaceNow();
  $('#recNow').textContent = now && now < 3600 ? fmtPace(now) : '–:––';
  $('#recSplits').innerHTML = REC.splits.length
    ? REC.splits.map((s, i) => `<span class="split"><b>Mi ${i + 1}</b>${fmtDur(s)}</span>`).join('')
    : `<span class="split-hint">${REC.st === 'idle' ? (recRoute() ? 'Route loaded. Head to the start, then tap Start.' : 'Splits show up here every mile.') : 'First split at 1.00 mi'}</span>`;
}
function recPaintCenter() { const b = $('#recCenter'); if (b) b.classList.toggle('on', REC.follow); }

/* ---------- GPS ---------- */
async function recWarmUp() {
  // If location is already allowed, show where you are before you start (no prompt otherwise)
  if (REC.st !== 'idle' || !navigator.geolocation || !navigator.permissions) return;
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' });
    if (p.state !== 'granted') return;
    navigator.geolocation.getCurrentPosition(pos => {
      REC.acc = pos.coords.accuracy;
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (recMe) recMe.setLatLng(ll);
      if (recMap && !recRoute()) recMap.setView(ll, 16);
      recPaintGps();
    }, () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  } catch (e) { /* permissions API unavailable */ }
}

function recStart() {
  if (!navigator.geolocation) return recOfferSim('This browser can’t share your location.');
  if (!window.isSecureContext) return recOfferSim('Location only works on a secure (https) page.');
  REC.st = 'locating';
  recPaint();
  navigator.geolocation.getCurrentPosition(pos => {
    recBegin('gps');
    recOnPos(pos);
    REC.watch = navigator.geolocation.watchPosition(recOnPos, recOnErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }, err => {
    REC.st = 'idle';
    recPaint();
    recOfferSim(err.code === 1 ? 'Location permission is off for this site.' : 'Couldn’t get a GPS fix here.');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
}

function recBegin(mode) {
  Object.assign(REC, { st: 'running', mode, segs: [[]], dist: 0, moving: 0, hist: [{ m: 0, d: 0 }], splits: [], splitAt: 0, last: null, gap: false, follow: true });
  REC.lastTick = performance.now();
  clearInterval(REC.timer);
  REC.timer = setInterval(recTick, 250);
  recRedrawLine();
  recWake(true);
  recPaint();
  toast(mode === 'sim' ? `Simulating your run at ${fmtPace(ME.pace)}/mi, ${REC.speed}× speed` : 'Recording. Keep this screen open while you run.', mode === 'sim' ? 'route' : 'record');
}

function recOnPos(pos) {
  const c = pos.coords;
  REC.acc = c.accuracy;
  recPaintGps();
  const p = { lat: c.latitude, lng: c.longitude, t: pos.timestamp || Date.now() };
  if (recMe) recMe.setLatLng([p.lat, p.lng]);
  if (REC.follow && recMap) recMap.panTo([p.lat, p.lng], { animate: true, duration: 0.5 });
  if (REC.st !== 'running') return;
  if (c.accuracy > 40) return;                 // too weak to trust
  recAddPoint(p);
}
function recOnErr(err) {
  if (err.code === 1) { recPause(); recOfferSim('Location permission was turned off.'); }
  else { REC.acc = 99; recPaintGps(); }
}

function recAddPoint(p) {
  const last = REC.last;
  if (last && !REC.gap) {
    const d = miles(last, p), meters = d * 1609.34, secs = Math.max(0.5, (p.t - last.t) / 1000);
    if (meters < 3) return;                      // standing still / jitter
    if (meters / secs > 12) return;              // faster than a 2:15 mile: a GPS spike
    REC.dist += d;
  }
  if (REC.gap) { REC.segs.push([]); REC.gap = false; }
  REC.segs[REC.segs.length - 1].push([p.lat, p.lng]);
  REC.last = p;
  REC.hist.push({ m: REC.moving, d: REC.dist });
  if (REC.hist.length > 600) REC.hist.splice(1, 1);
  recLine.addLatLng && recRedrawLine();
  recCheckSplit();
}
function recRedrawLine() {
  if (!recLine) return;
  const segs = REC.segs.filter(s => s.length);
  recLine.setLatLngs(segs);
  recGlow.setLatLngs(segs);
}
function recCheckSplit() {
  const done = Math.floor(REC.dist);
  while (REC.splits.length < done) {
    const t = REC.moving - REC.splitAt;
    REC.splits.push(t);
    REC.splitAt = REC.moving;
    toast(`Mile ${REC.splits.length} · ${fmtDur(t)}`, 'timer', 2200);
  }
}

/* ---------- clock + simulator ---------- */
function recTick() {
  const now = performance.now();
  const dt = (now - REC.lastTick) / 1000;
  REC.lastTick = now;
  if (REC.st !== 'running') return;
  const k = REC.mode === 'sim' ? REC.speed : 1;
  REC.moving += dt * k;
  if (REC.mode === 'sim') recSimStep(dt * k);
  recPaintStats();
}
function recSimSetup() {
  const r = recRoute() || { route: CLUBS[0].route };
  const pts = r.route.map(([la, ln]) => ({ lat: la, lng: ln }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + miles(pts[i - 1], pts[i]));
  REC.sim = { pts, cum, total: cum[cum.length - 1], d: 0, wall: Date.now() };
}
function recSimStep(sec) {
  const s = REC.sim;
  if (!s) return;
  const wobble = 1 + 0.05 * Math.sin(REC.moving / 40);  // a little pace variation, like a real run
  s.d += sec / (ME.pace * wobble);
  s.wall += sec * 1000;
  const d = s.d % s.total;
  let i = 1;
  while (i < s.cum.length - 1 && s.cum[i] < d) i++;
  const f = (d - s.cum[i - 1]) / ((s.cum[i] - s.cum[i - 1]) || 1);
  const a = s.pts[i - 1], b = s.pts[i];
  const p = { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, t: s.wall };
  if (recMe) recMe.setLatLng([p.lat, p.lng]);
  if (REC.follow && recMap) recMap.panTo([p.lat, p.lng], { animate: false });
  recAddPoint(p);
}

/* ---------- controls ---------- */
function recPause() {
  if (REC.st !== 'running') return;
  REC.st = 'paused';
  REC.gap = true;
  recPaint();
}
function recResume() {
  REC.st = 'running';
  REC.lastTick = performance.now();
  recPaint();
}
function recStop() {
  clearInterval(REC.timer);
  if (REC.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(REC.watch);
  REC.watch = null;
  recWake(false);
}
function recReset() {
  recStop();
  Object.assign(REC, { st: 'idle', mode: null, segs: [[]], dist: 0, moving: 0, hist: [], splits: [], splitAt: 0, last: null, gap: false, sim: null, follow: true });
  recRedrawLine();
  if ($('#recCtrls')) recPaint();
}
async function recWake(on) {
  try {
    if (on && 'wakeLock' in navigator && !REC.wake) REC.wake = await navigator.wakeLock.request('screen');
    if (!on && REC.wake) { await REC.wake.release(); REC.wake = null; }
  } catch (e) { /* not supported */ }
}

function recOfferSim(reason) {
  const r = recRoute();
  openModal(`<h3>GPS isn’t available</h3><p class="lead">${esc(reason)} On your phone, Record tracks your real run with GPS. Here you can simulate one instead: a runner at your easy pace (${fmtPace(ME.pace)}/mi) along ${r ? esc(r.name) : 'the Westwood loop'}.</p>
    <div class="label-sm">Simulation speed</div>
    <div class="opt-row">${[1, 10, 30].map(s => `<button class="opt ${REC.speed === s ? 'on' : ''}" data-action="rec-speed" data-s="${s}">${s === 1 ? 'Real time' : s + '×'}</button>`).join('')}</div>
    <button class="btn block" data-action="rec-sim">Simulate a run</button>
    <button class="skip" data-action="rec-retry">Try GPS again</button>`);
}

function recFinish() {
  if (REC.st === 'running') recPause();
  const dist = REC.dist, time = REC.moving;
  const h = new Date().getHours();
  const title = h < 11 ? 'Morning Run' : h < 14 ? 'Lunch Run' : h < 17 ? 'Afternoon Run' : h < 21 ? 'Evening Run' : 'Night Run';
  const name = recRoute() ? recRoute().name : title;
  const pts = REC.segs.flat();
  openModal(`<h3>Save activity</h3>
    <label class="label-sm" for="recTitle">Title</label>
    <input id="recTitle" class="text-in" value="${esc(name)}" maxlength="60" autocomplete="off">
    <div class="save-sum">
      ${pts.length > 1 ? `<div class="mini-route">${routeSvg(pts, 358, 150, { pad: 18 })}</div>` : ''}
      <div class="kv3"><div><div class="k">Distance</div><div class="v">${dist.toFixed(2)} mi</div></div><div><div class="k">Moving time</div><div class="v">${fmtDur(time)}</div></div><div><div class="k">Avg pace</div><div class="v">${dist > 0.02 ? fmtPace(time / dist) : '–:––'}</div></div></div>
      ${dist < 0.05 ? '<p class="muted" style="font-size:13px;margin:10px 0 0">This one is very short. You can still save it.</p>' : ''}
    </div>
    <button class="btn block" data-action="rec-save">Save activity</button>
    <div class="cta-row" style="margin-top:8px"><button class="btn ghost" data-action="rec-keep">Keep going</button><button class="btn ghost" data-action="rec-discard" style="color:#ff6b5b">Discard</button></div>`, { locked: true });
}
function recSave() {
  const title = ($('#recTitle')?.value || '').trim() || 'Run';
  const all = REC.segs.flat();
  const step = Math.max(1, Math.ceil(all.length / 400));
  const pts = all.filter((_, i) => i % step === 0 || i === all.length - 1).map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);
  const a = {
    id: 'w' + Date.now(), title, dist: REC.dist, time: REC.moving, pace: REC.dist > 0.02 ? REC.moving / REC.dist : 0,
    date: new Date().toISOString(), pts, splits: REC.splits.slice(), mode: REC.mode, route: U.runRoute || null,
  };
  S.activities.push(a);
  save();
  closeModal();
  recReset();
  U.runRoute = null;
  setTab('home');
  toast('Saved to your feed', 'check');
}

/* ---------- activity detail ---------- */
function activityPage(id) {
  const a = S.activities.find(x => x.id === id);
  if (!a) return;
  const best = a.splits && a.splits.length ? Math.min(...a.splits) : null;
  const html = `${navBar(a.title)}
    <div style="padding:0 16px"><div class="eyebrow">${fmtDay(new Date(a.date))} at ${fmtClock(new Date(a.date))}${a.mode === 'sim' ? ' · simulated' : ' · GPS'}</div><h2 style="font-size:var(--fs-title);margin:6px 0 0;letter-spacing:-.02em">${esc(a.title)}</h2></div>
    ${a.pts && a.pts.length > 1 ? `<div class="section" style="margin-top:14px"><div class="mini-route">${routeSvg(a.pts, 358, 240, { pad: 24 })}</div></div>` : ''}
    <div class="section"><div class="stat-grid">
      <div class="stat"><div class="v">${a.dist.toFixed(2)}</div><div class="k">Miles</div></div>
      <div class="stat"><div class="v">${fmtDur(a.time)}</div><div class="k">Moving time</div></div>
      <div class="stat"><div class="v">${a.pace ? fmtPace(a.pace) : '–:––'}</div><div class="k">Avg pace /mi</div></div>
      <div class="stat"><div class="v">${best ? fmtDur(best) : '–'}</div><div class="k">Fastest mile</div></div>
    </div></div>
    ${a.splits && a.splits.length ? `<div class="section"><h3 class="section-title">Splits</h3><div class="list">${a.splits.map((s, i) => `<div class="li"><span class="num" style="width:28px;color:var(--muted);font-weight:700">${i + 1}</span><div class="li-main"><div class="split-bar"><i style="width:${Math.min(100, (best / s) * 100)}%"></i></div></div><span class="num" style="font-weight:700">${fmtDur(s)}</span></div>`).join('')}</div></div>` : ''}
    <div class="section"><button class="btn block ghost" data-action="activity-delete" data-id="${a.id}" style="color:#ff6b5b">Delete activity</button></div>`;
  pushPage(html);
}

const REC_ACTIONS = {
  'rec-start': () => recStart(),
  'rec-pause': () => recPause(),
  'rec-resume': () => recResume(),
  'rec-finish': () => recFinish(),
  'rec-keep': () => { closeModal(); recResume(); },
  'rec-save': () => recSave(),
  'rec-discard': () => { closeModal(); recReset(); toast('Run discarded', 'close'); },
  'rec-sim': () => { closeModal(); recSimSetup(); recBegin('sim'); },
  'rec-retry': () => { closeModal(); recStart(); },
  'rec-speed': el => { REC.speed = +el.dataset.s; $$('[data-action="rec-speed"]').forEach(b => b.classList.toggle('on', b === el)); recPaintGps(); },
  'rec-gps-info': () => {
    if (REC.mode === 'sim') { REC.speed = REC.speed === 1 ? 10 : REC.speed === 10 ? 30 : 1; recPaintGps(); toast(`Simulation speed ${REC.speed === 1 ? 'real time' : REC.speed + '×'}`, 'timer', 1600); }
    else toast(REC.acc == null ? 'GPS turns on when you tap Start' : `Location accuracy about ±${Math.round(REC.acc)} m`, 'pin', 2000);
  },
  'rec-center': () => {
    REC.follow = true;
    recPaintCenter();
    const p = REC.last || (recMe && recMe.getLatLng());
    if (p && recMap) recMap.setView([p.lat, p.lng], Math.max(recMap.getZoom(), 16));
  },
  activity: el => activityPage(el.dataset.id),
  'activity-delete': el => { S.activities = S.activities.filter(x => x.id !== el.dataset.id); save(); popPage(); toast('Activity deleted', 'close'); },
};
