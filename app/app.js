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

/* soft delete, so undo is just a flag flip (and phase 3 gets its tombstone) */
const softDelete = id => updateNote(id, { deleted: true });
const restore    = id => updateNote(id, { deleted: false });

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
  install: $('install'), installYes: $('installYes'), installNo: $('installNo')
};

let editingId = null;   // note currently expanded for editing

const CLOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

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
    await updateNote(note.id, {
      text: body,
      dueAt: cb.checked ? fromLocalInput(when.value) : null
    });
    editingId = null;
    await render();
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
  await softDelete(note.id);
  await render();
  showToast('deleted', () => restore(note.id));
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

  await createNote(text, els.remindOn.checked ? fromLocalInput(els.when.value) : null);

  els.text.value = '';
  els.remindOn.checked = false;
  els.when.hidden = true;
  els.when.value = '';
  autogrow(els.text);
  syncSaveState();
  await render();
  els.scroll.scrollTo({ top: 0 });
});

/* notes cross into "done" on their own, without a reload */
setInterval(() => { if (!editingId) render(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !editingId) render();
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
render();
