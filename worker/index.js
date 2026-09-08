/* ============================================================================
   Push test worker

   Web Push, done with nothing but the Web Crypto API that the Workers runtime
   already has. The node `web-push` library does not run here.

     - content encryption: aes128gcm  (RFC 8188, keyed per RFC 8291)
     - request auth:       VAPID JWT signed ES256 (RFC 8292)

   Routes:
     GET    /api/vapid-public-key   the browser needs it to subscribe
     POST   /api/subscribe          store a PushSubscription in D1
     POST   /api/testpush           push to every stored subscription
     PUT    /api/reminders/:id      upsert a reminder into the delivery queue
     DELETE /api/reminders/:id      drop one
     *                              static assets

   scheduled(): every minute, sweep anything overdue and push it.
   ============================================================================ */

const OVERDUE_PREFIX_AFTER = 3 * 60 * 60 * 1000;   // 3 hours
const MAX_ATTEMPTS = 5;
const SWEEP_LIMIT = 50;
const DISPLAY_ZONE = 'Australia/Sydney';

/* ---------------------------------------------------------------- bytes --- */
const utf8 = s => new TextEncoder().encode(s);

function b64urlToBytes(s){
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(input){
  const bytes = new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts){
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts){ out.set(p, at); at += p.length; }
  return out;
}

/* ------------------------------------------------------------ HKDF bits --- */
async function hmac(keyBytes, data){
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

/* HKDF-Extract is just an HMAC with the salt as the key */
const hkdfExtract = (salt, ikm) => hmac(salt, ikm);

/* HKDF-Expand, single block - every length we need is <= 32 bytes */
async function hkdfExpand(prk, info, length){
  const block = await hmac(prk, concat(info, new Uint8Array([1])));
  return block.slice(0, length);
}

/* --------------------------------------------------------------- VAPID ---- */
async function vapidAuthHeader(endpoint, env){
  const publicKey  = b64urlToBytes(env.VAPID_PUBLIC_KEY);   // 65 bytes: 0x04 || X || Y
  const privateKey = b64urlToBytes(env.VAPID_PRIVATE_KEY);  // 32 bytes: d

  if (publicKey.length !== 65 || publicKey[0] !== 0x04)
    throw new Error(`VAPID_PUBLIC_KEY should be 65 uncompressed bytes, got ${publicKey.length}`);
  if (privateKey.length !== 32)
    throw new Error(`VAPID_PRIVATE_KEY should be 32 bytes, got ${privateKey.length}`);

  const header  = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(utf8(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT
  })));
  const unsigned = `${header}.${payload}`;

  /* Web Crypto wants the key as a JWK; x and y come out of the public key */
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC', crv: 'P-256', ext: true,
      d: bytesToB64url(privateKey),
      x: bytesToB64url(publicKey.slice(1, 33)),
      y: bytesToB64url(publicKey.slice(33, 65))
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  /* Web Crypto returns the raw r||s pair, which is exactly what JWS wants */
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned));

  return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${bytesToB64url(publicKey)}`;
}

/* ---------------------------------------------------------- encryption ---- */
async function encryptPayload(text, p256dhB64, authB64){
  const uaPublic   = b64urlToBytes(p256dhB64);   // the browser's public key, 65 bytes
  const authSecret = b64urlToBytes(authB64);     // shared auth secret, 16 bytes

  /* a fresh sender keypair for every message */
  const asKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  /* RFC 8291 s3.4 - fold the auth secret and both public keys into the IKM */
  const keyInfo = concat(utf8('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdfExpand(await hkdfExtract(authSecret, shared), keyInfo, 32);

  /* RFC 8188 s2.2 - derive the content key and nonce from a random salt */
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const prk   = await hkdfExtract(salt, ikm);
  const cek   = await hkdfExpand(prk, concat(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdfExpand(prk, concat(utf8('Content-Encoding: nonce'),     new Uint8Array([0])), 12);

  /* 0x02 is the padding delimiter that marks this as the final record */
  const plaintext = concat(utf8(text), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext));

  /* header: salt(16) || record size(4) || key id length(1) || sender key(65) */
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);

  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/* ------------------------------------------------------- notification ----- */
/* The only place a time becomes a string, and it happens at send time from the
   stored epoch milliseconds - never on the way into the database. */
const dueTimeFmt = new Intl.DateTimeFormat('en-AU', {
  timeZone: DISPLAY_ZONE, hour: 'numeric', minute: '2-digit', hour12: true
});

const dueClock = ms => dueTimeFmt.format(new Date(ms))
  .replace(/[\u202f\u00a0\s]+/g, ' ')
  .toLowerCase()
  .trim();

function buildNotification(reminder, now = Date.now()){
  const text = String(reminder.text || '').trim() || 'Reminder';
  const lateBy = now - reminder.dueAt;
  const dueLine = lateBy > OVERDUE_PREFIX_AFTER
    ? `this was due ${dueClock(reminder.dueAt)}`
    : `due ${dueClock(reminder.dueAt)}`;

  return {
    title: text.slice(0, 40),
    body: `${text}\n${dueLine}`,
    tag: reminder.id,            // a re-send replaces rather than stacks
    url: '/app'
  };
}

/* --------------------------------------------------------------- send ----- */
async function sendPush(sub, payload, env){
  let body, authorization;
  try {
    body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
    authorization = await vapidAuthHeader(sub.endpoint, env);
  } catch (err) {
    console.log(`[push] could not build request for ${sub.id}: ${err.message}`);
    return { id: sub.id, status: 0, error: err.message };
  }

  let res;
  try {
    res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'high'
      },
      body
    });
  } catch (err) {
    /* an unreachable endpoint must not take the whole batch down with it */
    console.log(`[push] request to ${sub.id} failed: ${err.message}`);
    return { id: sub.id, status: 0, error: err.message };
  }

  const text = await res.text().catch(() => '');
  console.log(
    `[push] ${res.status} ${res.statusText} ` +
    `endpoint=${sub.endpoint.slice(0, 70)}… ` +
    `body=${text ? text.slice(0, 300) : '(empty)'}`
  );

  /* the subscription is gone for good - stop trying to reach it */
  if (res.status === 404 || res.status === 410){
    await env.DB.prepare('DELETE FROM subscriptions WHERE id = ?1').bind(sub.id).run();
    console.log(`[push] ${res.status} - deleted subscription ${sub.id}`);
  }

  return { id: sub.id, status: res.status, body: text.slice(0, 300) };
}

/* -------------------------------------------------------------- sweep ----- */
/* `dueAt <= now`, deliberately. This collects everything OVERDUE, not whatever
   happens to be due this exact minute, so a missed run self-heals on the next. */
async function sweep(env, now = Date.now()){
  const { results: due } = await env.DB.prepare(
    `SELECT id, text, dueAt, subscriptionId, attempts
       FROM reminders
      WHERE sent = 0 AND dueAt <= ?1
      ORDER BY dueAt
      LIMIT ${SWEEP_LIMIT}`
  ).bind(now).all();

  if (!due.length) return { found: 0, delivered: 0, failed: 0, givenUp: 0 };

  const { results: subs } = await env.DB.prepare(
    'SELECT id, endpoint, p256dh, auth FROM subscriptions').all();

  console.log(`[sweep] ${due.length} overdue, ${subs.length} subscription(s)`);

  const out = { found: due.length, delivered: 0, failed: 0, givenUp: 0, noSubscription: 0 };

  for (const reminder of due){
    /* prefer the subscription the note was saved against, fall back to whatever
       is registered - one person, usually one device */
    const targets = subs.filter(sc => sc.id === reminder.subscriptionId);
    const use = targets.length ? targets : subs;

    if (!use.length){
      /* nothing to send to yet. Not a failure, so don't burn an attempt - it
         will go out once she turns notifications on. */
      out.noSubscription++;
      console.log(`[sweep] ${reminder.id} has no subscription to send to, leaving queued`);
      continue;
    }

    const payload = buildNotification(reminder, now);
    let anyDelivered = false;
    let allGone = true;

    for (const sub of use){
      const res = await sendPush(sub, payload, env);
      if (res.status >= 200 && res.status < 300){ anyDelivered = true; allGone = false; }
      else if (res.status !== 404 && res.status !== 410){ allGone = false; }
      /* 404/410 already deleted the subscription row inside sendPush */
    }

    if (anyDelivered){
      await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?1').bind(reminder.id).run();
      out.delivered++;
      console.log(`[sweep] delivered ${reminder.id}`);
    } else if (allGone){
      /* every endpoint is dead - retrying forever helps nobody */
      await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?1').bind(reminder.id).run();
      out.givenUp++;
      console.log(`[sweep] ${reminder.id} had only dead endpoints, marking sent`);
    } else {
      const attempts = (reminder.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS){
        await env.DB.prepare(
          'UPDATE reminders SET attempts = ?2, sent = 1 WHERE id = ?1').bind(reminder.id, attempts).run();
        out.givenUp++;
        console.log(`[sweep] giving up on ${reminder.id} after ${attempts} attempts`);
      } else {
        await env.DB.prepare(
          'UPDATE reminders SET attempts = ?2 WHERE id = ?1').bind(reminder.id, attempts).run();
        out.failed++;
        console.log(`[sweep] ${reminder.id} failed, attempt ${attempts}/${MAX_ATTEMPTS}, will retry`);
      }
    }
  }

  console.log(`[sweep] ${JSON.stringify(out)}`);
  return out;
}

/* -------------------------------------------------------------- routes ---- */
const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

export default {
  async fetch(request, env){
    const url = new URL(request.url);

    if (url.pathname === '/api/vapid-public-key' && request.method === 'GET'){
      if (!env.VAPID_PUBLIC_KEY) return json({ error: 'VAPID_PUBLIC_KEY is not set' }, 500);
      return json({ key: env.VAPID_PUBLIC_KEY });
    }

    if (url.pathname === '/api/subscribe' && request.method === 'POST'){
      let sub;
      try { sub = await request.json(); }
      catch { return json({ error: 'body was not JSON' }, 400); }

      const endpoint = sub?.endpoint;
      const p256dh   = sub?.keys?.p256dh;
      const auth     = sub?.keys?.auth;
      if (!endpoint || !p256dh || !auth)
        return json({ error: 'need endpoint, keys.p256dh and keys.auth' }, 400);

      try {
        await env.DB.prepare(
          `INSERT INTO subscriptions (id, endpoint, p256dh, auth, createdAt)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh,
                                               auth   = excluded.auth`
        ).bind(crypto.randomUUID(), endpoint, p256dh, auth, Date.now()).run();

        const { results } = await env.DB.prepare(
          'SELECT id FROM subscriptions WHERE endpoint = ?1').bind(endpoint).all();

        console.log(`[subscribe] stored ${endpoint.slice(0, 70)}…`);
        return json({ ok: true, id: results[0]?.id, stored: true });
      } catch (err) {
        /* a raw 500 tells the phone nothing; say what actually broke */
        console.log(`[subscribe] D1 write failed: ${err.message}`);
        return json({ ok: false, error: `database write failed: ${err.message}` }, 500);
      }
    }

    if (url.pathname === '/api/testpush' && request.method === 'POST'){
      for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']){
        if (!env[name]) return json({ error: `${name} is not set on the Worker` }, 500);
      }

      let results;
      try {
        ({ results } = await env.DB.prepare(
          'SELECT id, endpoint, p256dh, auth FROM subscriptions').all());
      } catch (err) {
        console.log(`[testpush] D1 read failed: ${err.message}`);
        return json({ error: `database read failed: ${err.message}` }, 500);
      }

      if (!results.length){
        console.log('[testpush] no subscriptions stored');
        return json({ sent: 0, note: 'no subscriptions stored yet' });
      }

      const payload = {
        title: 'It works',
        body: 'Push is coming from your Worker.',
        sentAt: Date.now()
      };

      const sent = [];
      for (const sub of results) sent.push(await sendPush(sub, payload, env));

      return json({ sent: sent.length, results: sent });
    }

    /* ---- reminders: the delivery queue, keyed by the local note id ---- */
    const reminderMatch = url.pathname.match(/^\/api\/reminders\/(.+)$/);
    if (reminderMatch){
      const id = decodeURIComponent(reminderMatch[1]);

      if (request.method === 'PUT'){
        let body;
        try { body = await request.json(); }
        catch { return json({ error: 'body was not JSON' }, 400); }

        const text  = body?.text;
        const dueAt = body?.dueAt;

        if (typeof text !== 'string' || !text.trim())
          return json({ error: 'text is required' }, 400);
        /* epoch milliseconds only - a string here would poison the sweep */
        if (typeof dueAt !== 'number' || !Number.isFinite(dueAt))
          return json({ error: 'dueAt must be epoch milliseconds (a number)' }, 400);

        const now = Date.now();
        try {
          await env.DB.prepare(
            `INSERT INTO reminders (id, text, dueAt, sent, subscriptionId, createdAt, updatedAt, attempts)
             VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, 0)
             ON CONFLICT(id) DO UPDATE SET
               text           = excluded.text,
               subscriptionId = excluded.subscriptionId,
               updatedAt      = excluded.updatedAt,
               -- every right-hand side here sees the OLD row, so this compares
               -- the stored dueAt against the incoming one
               sent     = CASE WHEN reminders.dueAt <> excluded.dueAt THEN 0 ELSE reminders.sent END,
               attempts = CASE WHEN reminders.dueAt <> excluded.dueAt THEN 0 ELSE reminders.attempts END,
               dueAt    = excluded.dueAt`
          ).bind(id, text.trim(), dueAt, body?.subscriptionId ?? null,
                 body?.createdAt ?? now, body?.updatedAt ?? now).run();
        } catch (err) {
          console.log(`[reminders] upsert failed for ${id}: ${err.message}`);
          return json({ ok: false, error: `database write failed: ${err.message}` }, 500);
        }

        console.log(`[reminders] upserted ${id} due ${dueAt}`);
        return json({ ok: true, id });
      }

      if (request.method === 'DELETE'){
        try {
          await env.DB.prepare('DELETE FROM reminders WHERE id = ?1').bind(id).run();
        } catch (err) {
          console.log(`[reminders] delete failed for ${id}: ${err.message}`);
          return json({ ok: false, error: `database write failed: ${err.message}` }, 500);
        }
        console.log(`[reminders] deleted ${id}`);
        return json({ ok: true, id });   // idempotent: deleting nothing is fine
      }

      return json({ error: 'use PUT or DELETE' }, 405);
    }

    /* manual trigger, handy for testing the sweep without waiting a minute */
    if (url.pathname === '/api/sweep' && request.method === 'POST'){
      return json(await sweep(env));
    }

    return env.ASSETS.fetch(request);
  },

  /* every minute, per the cron trigger in wrangler.jsonc */
  async scheduled(event, env, ctx){
    ctx.waitUntil(sweep(env).catch(err => {
      console.log(`[sweep] threw: ${err.message}`);
    }));
  }
};
