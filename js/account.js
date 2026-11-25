'use strict';
/* =====================================================================
   Accounts — create your own Pulse profile.
   There is no server in this prototype, so accounts live on this device
   (localStorage). Each account gets its own saved plans, runs and results.
   Your recent 5K time sets your easy pace and race predictions.
   Loaded after data.js and before app.js: it swaps in the signed-in
   runner's profile (ME) and picks which saved state app.js loads.
===================================================================== */

const ACCT_HOMES = {
  ucla:   { label: 'UCLA · Westwood',        school: 'UCLA', lat: 34.0652, lng: -118.4528 },
  smc:    { label: 'Santa Monica College',   school: 'SMC',  lat: 34.0170, lng: -118.4700 },
  venice: { label: 'Venice',                 school: '',     lat: 33.9925, lng: -118.4695 },
  palms:  { label: 'Palms · Mar Vista',      school: '',     lat: 34.0250, lng: -118.4160 },
  culver: { label: 'Culver City',            school: '',     lat: 34.0211, lng: -118.3965 },
};

const ACCT = (() => {
  let list = [], cur = null;
  try {
    list = JSON.parse(localStorage.getItem('pulse-accounts') || '[]');
    cur = localStorage.getItem('pulse-current');
  } catch (e) { /* storage blocked: demo only */ }
  return { list, cur, me: list.find(a => a.id === cur) || null };
})();
ME.isDemo = true;
ME.photo = null;

// Riegel's formula: predict other race times from one result
function acctPredict(t5) {
  const r = d => Math.round(t5 * Math.pow(d / 5000, 1.06));
  return { '400m': r(400), '800m': r(800), 'Mile': r(1609.34), '1500m': r(1500), '3000m': r(3000), '5K': Math.round(t5) };
}
const acctDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function acctApply(a) {
  const home = ACCT_HOMES[a.home] || ACCT_HOMES.ucla;
  const t5 = a.best5k || 1800;
  Object.assign(ME, {
    name: `${a.first} ${a.last}`.trim(),
    initials: ((a.first || '?')[0] + ((a.last || '')[0] || '')).toUpperCase(),
    city: 'Los Angeles, California',
    school: home.school || home.label,
    pace: a.pace || Math.round((t5 / 3.10686) * 1.19), // easy pace ≈ 5K pace + 19%
    best5k: acctDur(t5),
    predict: acctPredict(t5),
    home: { lat: home.lat, lng: home.lng },
    photo: a.photo || null,
    isDemo: false,
  });
}
if (ACCT.me) acctApply(ACCT.me);
window.PULSE_STORE_KEY = ACCT.me ? `strava-pulse-v3:${ACCT.me.id}` : 'strava-pulse-v3';

function acctSaveList() { try { localStorage.setItem('pulse-accounts', JSON.stringify(ACCT.list)); } catch (e) { /* ignore */ } }
function acctSwitch(id) {
  try { id ? localStorage.setItem('pulse-current', id) : localStorage.removeItem('pulse-current'); } catch (e) { /* ignore */ }
  location.hash = 'home';
  location.reload();
}

/* ---------- welcome gate ---------- */
function acctGate(view = 'welcome', editId = null) {
  let g = $('#gate');
  if (!g) { g = document.createElement('div'); g.id = 'gate'; g.className = 'gate'; $('#device').appendChild(g); }
  if (view === 'welcome') {
    const others = ACCT.list.filter(a => a.id !== ACCT.cur);
    g.innerHTML = `<canvas id="gateHeat" width="780" height="1100"></canvas><div class="gate-shade"></div>
      <div class="gate-body">
        <div class="gate-brand"><span class="live-dot"></span> Strava Pulse</div>
        <h1>Find your people, your track and your next race.</h1>
        <p>Meets, open tracks, club runs and track workouts near you, sorted by day and by your pace.</p>
        ${others.length ? `<div class="label-sm" style="margin-top:22px">On this device</div><div class="list acct-list">${others.map(a => `<button class="li" data-action="acct-login" data-id="${a.id}">${acctAvatar(a, 'sm')}<div class="li-main"><div class="li-t">${esc(a.first)} ${esc(a.last)}</div><div class="li-s">${esc((ACCT_HOMES[a.home] || {}).label || '')}</div></div>${ic('chev', 18)}</button>`).join('')}</div>` : ''}
        <button class="btn block" data-action="acct-signup" style="margin-top:22px">Create your account</button>
        <button class="btn block ghost" data-action="acct-demo" style="margin-top:10px">Try the demo account</button>
        <p class="gate-note">Concept prototype. Accounts are saved on this device only. Not affiliated with Strava.</p>
      </div>`;
    if (typeof drawHomeHeat === 'function') drawHomeHeat([...MEETS, ...CLUBS].filter(x => x.lat), $('#gateHeat'), true);
  } else {
    const a = editId ? ACCT.list.find(x => x.id === editId) : null;
    const v = a || { first: '', last: '', email: '', home: 'ucla', background: 'hs', best5k: null, pace: null, photo: null };
    U.acctPhoto = v.photo || null;
    g.innerHTML = `<div class="gate-form">
      <div class="page-nav" style="position:static;background:none"><button class="icon-btn" data-action="${a ? 'acct-close' : 'acct-welcome'}" aria-label="Back">${ic('back', 20, 2.2)}</button><span></span><span style="width:42px"></span></div>
      <h2>${a ? 'Edit profile' : 'Create your account'}</h2>
      <p class="muted" style="margin:4px 0 18px">${a ? 'Changes apply right away.' : 'Takes 30 seconds. Saved on this device.'}</p>
      <div class="photo-pick"><label class="photo-drop" id="photoDrop" aria-label="Add a profile photo">${acctPhotoInner(v)}<input type="file" id="acctPhoto" accept="image/*" hidden></label><div><div class="li-t">Profile photo</div><div class="li-s">Optional · tap to ${v.photo ? 'change' : 'add'}</div></div></div>
      <div class="two"><label class="fld"><span>First name</span><input id="fFirst" class="text-in" autocomplete="given-name" value="${esc(v.first)}" maxlength="30"></label>
      <label class="fld"><span>Last name</span><input id="fLast" class="text-in" autocomplete="family-name" value="${esc(v.last)}" maxlength="30"></label></div>
      <label class="fld"><span>Email <em>optional</em></span><input id="fEmail" class="text-in" type="email" autocomplete="email" value="${esc(v.email || '')}" maxlength="80"></label>
      <div class="label-sm">Where do you run from?</div>
      <div class="opt-row" id="fHome">${Object.entries(ACCT_HOMES).map(([k, h]) => `<button class="opt ${v.home === k ? 'on' : ''}" data-action="acct-opt" data-group="fHome" data-v="${k}">${h.label}</button>`).join('')}</div>
      <div class="label-sm">Your running background</div>
      <div class="opt-row" id="fBg">${[['hs', 'Ran HS track / XC'], ['casual', 'Run a few times a week'], ['new', 'Just starting']].map(([k, l]) => `<button class="opt ${v.background === k ? 'on' : ''}" data-action="acct-opt" data-group="fBg" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="two"><label class="fld"><span>Recent 5K time</span><input id="f5k" class="text-in num" inputmode="decimal" placeholder="28:00" value="${v.best5k ? acctDur(v.best5k) : ''}" maxlength="6"></label>
      <label class="fld"><span>Easy pace /mi <em>optional</em></span><input id="fPace" class="text-in num" inputmode="decimal" placeholder="auto" value="${v.pace ? acctDur(v.pace) : ''}" maxlength="5"></label></div>
      <p class="muted" id="fPredict" style="font-size:13px;margin:-4px 0 18px"></p>
      <div id="fErr" class="form-err" role="alert"></div>
      <button class="btn block" data-action="acct-save" data-id="${a ? a.id : ''}">${a ? 'Save changes' : 'Create account'}</button>
      ${a ? `<button class="btn block ghost" data-action="acct-delete" data-id="${a.id}" style="margin-top:10px;color:#ff6b5b">Delete this account</button>` : ''}
    </div>`;
    const upd = () => {
      const s = acctParse5k($('#f5k').value), p = parsePace($('#fPace').value);
      $('#fPredict').textContent = s ? `Easy pace ${acctDur(p || Math.round((s / 3.10686) * 1.19))}/mi · predicted mile ${acctDur(acctPredict(s).Mile)} · 400m ${acctDur(acctPredict(s)['400m'])}` : 'Your 5K time sets your pace lens and seeds you into meet heats.';
    };
    $('#f5k').addEventListener('input', upd);
    $('#fPace').addEventListener('input', upd);
    upd();
    $('#acctPhoto').addEventListener('change', e => acctReadPhoto(e.target.files && e.target.files[0]));
    setTimeout(() => { if (!a) $('#fFirst').focus(); }, 200);
  }
  g.hidden = false;
}
function acctClose() { const g = $('#gate'); if (g) g.remove(); }
function acctAvatar(a, cls = '') {
  if (a.photo) return `<span class="avatar ${cls} photo" style="background-image:url('${a.photo}')"></span>`;
  return `<span class="avatar ${cls}" style="--h:${a.hue || 15}">${esc(((a.first || '?')[0] + ((a.last || '')[0] || '')).toUpperCase())}</span>`;
}
function acctPhotoInner(v) {
  const src = U.acctPhoto || v.photo;
  return src ? `<img src="${src}" alt="Profile photo preview">` : `${ic('plus', 26, 2)}`;
}
// "27:30", "2730" or "27.5" → seconds; 12:00 to 60:00
function acctParse5k(str) {
  const s = String(str).trim();
  if (!s) return null;
  let m, sec;
  if (s.includes(':')) [m, sec] = s.split(':').map(Number);
  else if (s.includes('.')) { const f = parseFloat(s); m = Math.floor(f); sec = Math.round((f - m) * 60); }
  else if (s.length >= 3) { m = +s.slice(0, -2); sec = +s.slice(-2); }
  else { m = +s; sec = 0; }
  if (!Number.isFinite(m) || !Number.isFinite(sec) || sec >= 60) return null;
  const v = m * 60 + sec;
  return v >= 720 && v <= 3600 ? v : null;
}
// shrink the chosen photo to a 192px square so it fits in local storage
function acctReadPhoto(file) {
  if (!file || !/^image\//.test(file.type)) return;
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const c = document.createElement('canvas'), S2 = 192, k = Math.min(img.width, img.height);
    c.width = c.height = S2;
    c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, S2, S2);
    U.acctPhoto = c.toDataURL('image/jpeg', 0.82);
    URL.revokeObjectURL(url);
    $('#photoDrop').innerHTML = `<img src="${U.acctPhoto}" alt="Profile photo preview"><input type="file" id="acctPhoto" accept="image/*" hidden>`;
    $('#acctPhoto').addEventListener('change', e => acctReadPhoto(e.target.files && e.target.files[0]));
  };
  img.src = url;
}
function acctSave(editId) {
  const first = $('#fFirst').value.trim(), last = $('#fLast').value.trim(), email = $('#fEmail').value.trim();
  const home = ($('#fHome .opt.on') || {}).dataset?.v || 'ucla';
  const background = ($('#fBg .opt.on') || {}).dataset?.v || 'casual';
  const best5k = acctParse5k($('#f5k').value);
  const paceRaw = $('#fPace').value.trim(), pace = paceRaw ? parsePace(paceRaw) : null;
  const err = msg => { $('#fErr').textContent = msg; };
  if (!first) return err('Add your first name.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('That email doesn’t look right.');
  if (!best5k) return err('Add a recent 5K time, like 28:00. A guess is fine.');
  if (paceRaw && !pace) return err('Easy pace should look like 10:30.');
  const rec = { first, last, email, home, background, best5k, pace, photo: U.acctPhoto || null };
  if (editId) {
    Object.assign(ACCT.list.find(a => a.id === editId), rec);
    acctSaveList();
    acctSwitch(editId);
    return;
  }
  const id = 'u' + Date.now().toString(36);
  ACCT.list.push({ id, created: new Date().toISOString(), hue: Math.floor(Math.random() * 360), ...rec });
  acctSaveList();
  try { localStorage.setItem(`strava-pulse-v3:${id}`, JSON.stringify({ personalized: true, background, want: 'all', welcome: true })); } catch (e) { /* ignore */ }
  acctSwitch(id);
}

const ACCT_ACTIONS = {
  'acct-signup': () => acctGate('form'),
  'acct-welcome': () => acctGate('welcome'),
  'acct-demo': () => acctSwitch('demo'),
  'acct-login': el => acctSwitch(el.dataset.id),
  'acct-close': () => acctClose(),
  'acct-opt': el => { $$(`#${el.dataset.group} .opt`).forEach(b => b.classList.toggle('on', b === el)); },
  'acct-save': el => acctSave(el.dataset.id || null),
  'acct-edit': () => acctGate('form', ACCT.cur),
  'acct-switch': () => acctGate('welcome'),
  'acct-logout': () => acctSwitch(null),
  'acct-delete': el => {
    if (!confirm('Delete this account and its saved runs on this device? This can’t be undone.')) return;
    ACCT.list = ACCT.list.filter(a => a.id !== el.dataset.id);
    acctSaveList();
    try { localStorage.removeItem(`strava-pulse-v3:${el.dataset.id}`); } catch (e) { /* ignore */ }
    acctSwitch(null);
  },
};
