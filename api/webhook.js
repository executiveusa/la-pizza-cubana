'use strict';
// GET  /api/webhook — Meta webhook verification challenge
// POST /api/webhook — Receive Meta (WhatsApp / Instagram / Facebook) events
//
// Setup steps (do once in Meta Developer Console):
//   1. Go to https://developers.facebook.com → your app → Webhooks
//   2. Set callback URL: https://la-pizza-cubana.vercel.app/api/webhook
//   3. Set verify token to the value of META_WEBHOOK_VERIFY_TOKEN env var
//   4. Subscribe to: messages, messaging_postbacks (WhatsApp), feed (Instagram)
//
// Required env vars:
//   META_WEBHOOK_VERIFY_TOKEN  — any random string you choose
//   META_APP_SECRET            — from Meta app settings (for signature verification)
const crypto = require('crypto');
const { getPool, ensureTables } = require('./_db');

// Disable Vercel's automatic body parsing so we can read the raw body for HMAC
module.exports.config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // ── GET: Webhook verification ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      console.log('[webhook] verified successfully');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'verification_failed' });
  }

  // ── POST: Receive events ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const rawBody = await readRawBody(req);

    // Verify HMAC signature if META_APP_SECRET is configured
    if (process.env.META_APP_SECRET) {
      const sig = req.headers['x-hub-signature-256'] || '';
      const expected = 'sha256=' + crypto
        .createHmac('sha256', process.env.META_APP_SECRET)
        .update(rawBody)
        .digest('hex');
      // Use constant-time comparison to prevent timing attacks
      const sigBuf = Buffer.from(sig.padEnd(expected.length, '\0'));
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.error('[webhook] invalid signature');
        return res.status(401).json({ error: 'invalid_signature' });
      }
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }

    // Always acknowledge quickly — Meta expects 200 within 5 seconds
    res.status(200).json({ ok: true });

    // Process asynchronously (after responding)
    setImmediate(async () => {
      try {
        await ensureTables();
        const db = getPool();
        const eventType = payload?.object || 'unknown';

        // Store the raw event
        await db.query(
          `INSERT INTO events (event_type, payload) VALUES ($1, $2)`,
          [eventType, JSON.stringify(payload)]
        );

        // Auto-count WhatsApp incoming messages → wa_orders counter
        if (eventType === 'whatsapp_business_account') {
          const changes = payload?.entry?.[0]?.changes || [];
          let msgCount = 0;
          for (const change of changes) {
            if (change.field === 'messages') {
              const messages = change.value?.messages || [];
              msgCount += messages.filter(m => m.type !== 'status').length;
            }
          }
          if (msgCount > 0) {
            const today = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
            await db.query(
              `INSERT INTO daily_stats (date, wa_orders) VALUES ($1, $2)
               ON CONFLICT (date) DO UPDATE SET
                 wa_orders = daily_stats.wa_orders + $2,
                 updated_at = NOW()`,
              [today, msgCount]
            );
          }
        }
      } catch (err) {
        console.error('[webhook] async processing error:', err.message);
      }
    });

    return; // response already sent
  }

  res.status(405).end();
};
