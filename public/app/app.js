import { openDB } from './vendor/idb.js';

/* ============================================================================
   Storage
   Record: { id, text, dueAt, sent, createdAt, updatedAt, deleted }
   dueAt is epoch milliseconds or null. No timezone, no formatted string is
   ever written down - local time exists only at the moment of display.
   ============================================================================ */
const DB_NAME = 'lists';
const STORE   = 'notes';

const dbp = openDB(DB_NAME, 1, {
  upgrade(db){
    const store = db.createObjectStore(STORE, { keyPath: 'id' });
    store.createIndex('createdAt', 'createdAt');
    store.createIndex('dueAt', 'dueAt');
  }
});

const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID()
                     : Date.now().toString(36) + Math.random().toString(36).slice(2));

async function allNotes(){
  const db = await dbp;
  return (await db.getAll(STORE)).filter(n => !n.deleted);
}

async function putNote(note){
  const db = await dbp;
  await db.put(STORE, note);
  return note;
}

async function getNote(id){
  const db = await dbp;
  return db.get(STORE, id);
}

async function createNote(text, dueAt){
  const now = Date.now();
  return putNote({
    id: newId(),
    text,
    dueAt,
    sent: 0,
    createdAt: now,
    updatedAt: now,
    deleted: false
  });
}

async function updateNote(id, patch){
  const note = await getNote(id);
  if (!note) return null;
  return putNote({ ...note, ...patch, updatedAt: Date.now() });
}

/* soft delete, so undo is just a flag flip, and the D1 row can be dropped */
const softDelete = id => updateNote(id, { deleted: true });
const restore    = id => updateNote(id, { deleted: false });

/* sync bookkeeping only - deliberately does NOT touch updatedAt */
async function markPending(id, pendingSync){
  const db = await dbp;
  const note = await db.get(STORE, id);
  if (!note || note.pendingSync === pendingSync) return;
  await db.put(STORE, { ...note, pendingSync });
}

/* every row, tombstones included - a delete still has to reach the server */
async function everyNote(){
  const db = await dbp;
  return db.getAll(STORE);
}

/* ============================================================================
   Sync — IndexedDB is the truth for display, D1 is only the delivery queue.
   The local write has already happened by the time any of this runs; if the
   network is down the note is simply flagged and retried later.
   ============================================================================ */
const SUB_KEY = 'subscriptionId';
const subscriptionId = () => { try { return localStorage.getItem(SUB_KEY); } catch { return null; } };

async function syncNote(note){
  /* a row should exist only for a live note that has a time on it */
  const wantsRow = !note.deleted && note.dueAt != null;
  const url = `/api/reminders/${encodeURIComponent(note.id)}`;

  try {
    const res = wantsRow
      ? await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: note.text,
            dueAt: note.dueAt,              // epoch ms, straight through
            subscriptionId: subscriptionId(),
            createdAt: note.createdAt,
            updatedAt: note.updatedAt
          })
        })
      : await fetch(url, { method: 'DELETE' });

    if (!res.ok) throw new Error(String(res.status));
    await markPending(note.id, false);
    return true;
  } catch (err) {
    console.warn('[sync] queued for retry:', note.id, err.message);
    await markPending(note.id, true);
    return false;
  }
}

/* a brand new note with no time never touches the server at all */
const syncIfRelevant = note =>
  (note.dueAt != null || note.pendingSync) ? syncNote(note) : Promise.resolve(true);

let flushing = false;
async function flushPending(){
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const stuck = (await everyNote()).filter(n => n.pendingSync);
    if (!stuck.length) return;
    console.log(`[sync] retrying ${stuck.length}`);
    let changed = false;
    for (const note of stuck) if (await syncNote(note)) changed = true;
    if (changed) await render();
  } finally {
    flushing = false;
  }
}

/* ---- push subscription: same flow as the push test, reused ---- */
function urlBase64ToUint8Array(base64){
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function ensureSubscription(){
  if (!pushSupported() || Notification.permission !== 'granted') return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub){
      const res = await fetch('/api/vapid-public-key');
      const { key } = await res.json();
      if (!key) throw new Error('worker returned no VAPID key');
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key)
      });
    }
    const saved = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    }).then(r => r.json());

    if (saved?.id){
      try { localStorage.setItem(SUB_KEY, saved.id); } catch {}
      return saved.id;
    }
    return null;
  } catch (err) {
    console.warn('[push] could not subscribe:', err.message);
    return null;
  }
}

/* ============================================================================
   Time — display only, always via Intl, always in the viewer's local zone
   ============================================================================ */
const timeFmt  = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
const wdFmt    = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dayFmt   = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });

/* "5:00 pm" - Intl gives "5:00 PM", sometimes with a narrow no-break space */
const clock = d => timeFmt.format(d).replace(/[\u202f\u00a0\s]+/g, ' ').toLowerCase();

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function friendlyTime(ms, now = Date.now()){
  const d = new Date(ms);
  const days = Math.round((startOfDay(d) - startOfDay(new Date(now))) / 86400000);

  if (days === 0)  return `today, ${clock(d)}`;
  if (days === 1)  return `tomorrow, ${clock(d)}`;
  if (days === -1) return `yesterday, ${clock(d)}`;

  const stamp = `${wdFmt.format(d)} ${dayFmt.format(d)} ${monthFmt.format(d)}`;
  const year  = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${stamp}${year}, ${clock(d)}`;
}

/* datetime-local <-> epoch ms, both through local calendar fields */
const pad = n => String(n).padStart(2, '0');

function toLocalInput(ms){
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value){
  if (!value) return null;
  const [date, time] = value.split('T');
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi]    = time.split(':').map(Number);
  const ms = new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const inOneHour = () => {
  const d = new Date(Date.now() + 3600000);
  d.setSeconds(0, 0);
  return d.getTime();
};

/* ============================================================================
   DOM
   ============================================================================ */
const $ = id => document.getElementById(id);

const els = {
  scroll: $('scroll'),
  openGroup: $('openGroup'), openList: $('openList'),
  doneGroup: $('doneGroup'), doneList: $('doneList'),
  empty: $('empty'), count: $('count'),
  composer: $('composer'), text: $('text'),
  remindOn: $('remindOn'), when: $('when'), save: $('save'),
  toast: $('toast'), toastText: $('toastText'), undo: $('undo'),
  install: $('install'), installYes: $('installYes'), installNo: $('installNo'),
  remPrompt: $('remPrompt'), remDenied: $('remDenied')
};

let editingId = null;   // note currently expanded for editing

const CLOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

const BELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`;

function autogrow(el, max = Infinity){
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, max) + 'px';
}

/* ---------------------------------------------------------------- render -- */
function noteEl(note, isPast){
  const li = document.createElement('li');
  li.className = 'note';
  li.dataset.id = note.id;

  if (note.id === editingId){
    li.classList.add('is-open');
    li.append(editorEl(note));
    return li;
  }

  const body = document.createElement('button');
  body.type = 'button';
  body.className = 'note-body';
  body.textContent = note.text;
  body.addEventListener('click', () => { editingId = note.id; render(); });
  li.append(body);

  if (note.dueAt != null){
    const due = document.createElement('span');
    due.className = 'due' + (isPast ? ' past' : '');
    due.innerHTML = CLOCK_ICON;
    due.append(document.createTextNode(friendlyTime(note.dueAt)));
    li.append(due);

    const bell = document.createElement('span');
    bell.className = 'bell';
    bell.title = 'reminder set';
    bell.innerHTML = BELL_ICON;
    li.append(bell);
  }

  if (note.pendingSync){
    const pending = document.createElement('span');
    pending.className = 'pending';
    pending.textContent = 'syncing';
    li.append(pending);
  }

  const kill = document.createElement('button');
  kill.type = 'button';
  kill.className = 'kill';
  kill.setAttribute('aria-label', 'Delete note');
  kill.textContent = '×';
  kill.addEventListener('click', e => { e.stopPropagation(); removeNote(note); });
  li.append(kill);

  return li;
}

function editorEl(note){
  const wrap = document.createElement('div');
  wrap.className = 'editor';

  const ta = document.createElement('textarea');
  ta.rows = 1;
  ta.value = note.text;
  ta.setAttribute('aria-label', 'Edit note');
  ta.addEventListener('input', () => autogrow(ta));
  wrap.append(ta);

  const row = document.createElement('div');
  row.className = 'editor-row';

  const label = document.createElement('label');
  label.className = 'toggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = note.dueAt != null;
  const track = document.createElement('span');
  track.className = 'track';
  track.setAttribute('aria-hidden', 'true');
  track.innerHTML = '<span class="knob"></span>';
  const text = document.createElement('span');
  text.className = 'toggle-label';
  text.textContent = 'set reminder';
  label.append(cb, track, text);

  const when = document.createElement('input');
  when.type = 'datetime-local';
  when.className = 'when';
  when.setAttribute('aria-label', 'Reminder time');
  when.value = toLocalInput(note.dueAt ?? inOneHour());
  when.hidden = note.dueAt == null;

  cb.addEventListener('change', () => {
    when.hidden = !cb.checked;
    if (cb.checked && !when.value) when.value = toLocalInput(inOneHour());
  });

  const actions = document.createElement('div');
  actions.className = 'editor-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn ghost';
  cancel.textContent = 'cancel';
  cancel.addEventListener('click', () => { editingId = null; render(); });

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn';
  save.textContent = 'save';
  save.addEventListener('click', async () => {
    const body = ta.value.trim();
    if (!body){ removeNote(note); return; }
    const updated = await updateNote(note.id, {
      text: body,
      dueAt: cb.checked ? fromLocalInput(when.value) : null
    });
    editingId = null;
    await render();
    /* PUT if it still has a time, DELETE if the time was taken off */
    if (updated) syncIfRelevant(updated).then(render);
  });

  actions.append(cancel, save);
  row.append(label, when, actions);
  wrap.append(row);

  requestAnimationFrame(() => {
    autogrow(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  return wrap;
}

async function render(){
  const now   = Date.now();
  const notes = await allNotes();

  const isPast = n => n.dueAt != null && n.dueAt <= now;
  const open = notes.filter(n => !isPast(n)).sort((a, b) => b.createdAt - a.createdAt);
  const done = notes.filter(isPast).sort((a, b) => b.dueAt - a.dueAt);

  els.openList.replaceChildren(...open.map(n => noteEl(n, false)));
  els.doneList.replaceChildren(...done.map(n => noteEl(n, true)));

  els.doneGroup.hidden  = done.length === 0;
  els.openGroup.hidden  = open.length === 0;
  els.empty.hidden      = notes.length > 0;

  els.count.textContent = notes.length
    ? `${open.length} open${done.length ? ` · ${done.length} done` : ''}`
    : '';
}

/* ---------------------------------------------------------------- toast --- */
let undoTimer = null;

function showToast(message, onUndo){
  clearTimeout(undoTimer);
  els.toastText.textContent = message;
  els.toast.hidden = false;
  els.undo.onclick = async () => {
    clearTimeout(undoTimer);
    els.toast.hidden = true;
    await onUndo();
    await render();
  };
  undoTimer = setTimeout(() => { els.toast.hidden = true; }, 5000);
}

async function removeNote(note){
  if (editingId === note.id) editingId = null;
  const gone = await softDelete(note.id);
  await render();
  if (note.dueAt != null && gone) syncNote(gone).then(render);

  showToast('deleted', async () => {
    const back = await restore(note.id);
    if (back && back.dueAt != null) syncNote(back).then(render);
  });
}

/* ---------------------------------------------------------------- compose - */
const syncSaveState = () => { els.save.disabled = els.text.value.trim() === ''; };

els.text.addEventListener('input', () => {
  autogrow(els.text, window.innerHeight * 0.34);
  syncSaveState();
});

els.remindOn.addEventListener('change', () => {
  els.when.hidden = !els.remindOn.checked;
  if (els.remindOn.checked) els.when.value = toLocalInput(inOneHour());
});

els.composer.addEventListener('submit', async e => {
  e.preventDefault();
  const text = els.text.value.trim();
  if (!text) return;

  const created = await createNote(text, els.remindOn.checked ? fromLocalInput(els.when.value) : null);

  els.text.value = '';
  els.remindOn.checked = false;
  els.when.hidden = true;
  els.when.value = '';
  autogrow(els.text);
  syncSaveState();
  await render();
  els.scroll.scrollTo({ top: 0 });

  /* the note is already saved locally; the server is best effort from here */
  if (created.dueAt != null) syncNote(created).then(render);
});

/* notes cross into "done" on their own, without a reload */
setInterval(() => { if (!editingId) render(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !editingId) render();
});

/* ------------------------------------------------------------- reminders - */
/* Never prompt on load. A dialog she didn't ask for gets dismissed, and a
   denied permission cannot be asked for again. */
function refreshReminderUI(){
  if (!pushSupported()){
    els.remPrompt.hidden = true;
    els.remDenied.hidden = true;
    return;
  }
  const state = Notification.permission;
  els.remPrompt.hidden = state !== 'default';
  els.remDenied.hidden = state !== 'denied';
}

els.remPrompt.addEventListener('click', async () => {
  els.remPrompt.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    refreshReminderUI();
    if (permission !== 'granted') return;

    await ensureSubscription();

    /* everything already queued was stored without a subscriptionId - resend
       them now so the sweep knows where to deliver */
    const withTimes = (await everyNote()).filter(n => !n.deleted && n.dueAt != null);
    for (const note of withTimes) await syncNote(note);
    await render();
  } finally {
    els.remPrompt.disabled = false;
  }
});

/* ---------------------------------------------------------------- install - */
const DISMISS_KEY = 'installBannerDismissed';
let installEvent = null;

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function dismissInstall(){
  els.install.hidden = true;
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e;
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch {}
  if (!dismissed && !isStandalone()) els.install.hidden = false;
});

els.installYes.addEventListener('click', async () => {
  if (!installEvent) return dismissInstall();
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  dismissInstall();
});
els.installNo.addEventListener('click', dismissInstall);
window.addEventListener('appinstalled', dismissInstall);

/* ---------------------------------------------------------------- boot ---- */
/* A module script and its imports can finish evaluating after `load` has already
   fired, in which case a load listener never runs - so check readyState first. */
if ('serviceWorker' in navigator){
  const registerSW = () =>
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })
      .catch(err => console.warn('SW registration failed', err));

  if (document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW, { once: true });
}

syncSaveState();
autogrow(els.text);
refreshReminderUI();

render().then(async () => {
  /* if she already said yes, make sure the subscription is current, then push
     anything that failed to reach the server last time */
  if (pushSupported() && Notification.permission === 'granted'){
    await ensureSubscription();
  }
  await flushPending();
});

/* retry the moment the network comes back, and whenever the app is reopened */
window.addEventListener('online', flushPending);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) flushPending();
});
