'use strict';
// POST /api/pope — Pope Bot daily trigger (called by GitHub Actions cron)
//
// Reads today's stats, formats a Telegram message, sends it to Ray.
// Protected by x-pope-secret header.
// Stores last send record in pope_memory table.
//
// Required env vars (add via Vercel dashboard or CLI):
//   POPE_SECRET          — matching the GH secret POPE_SECRET
//   TELEGRAM_BOT_TOKEN   — from @BotFather (https://t.me/botfather)
//   TELEGRAM_CHAT_ID     — Ray's Telegram chat ID (or group ID)
const { getPool, ensureTables } = require('./_db');

const DAYS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = req.headers['x-pope-secret'];
  if (!process.env.POPE_SECRET || secret !== process.env.POPE_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // ── Today in Mexico City time (UTC-6) ─────────────────────────────────────
  const now = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);
  const dayName = DAYS_ES[now.getDay()];
  const dateStr = `${dayName} ${now.getDate()} de ${MONTHS_ES[now.getMonth()]}`;

  try {
    await ensureTables();
    const db = getPool();

    // ── Fetch yesterday's stats ───────────────────────────────────────────────
    const r = await db.query(
      `SELECT pizzas, clientes, wa_orders FROM daily_stats WHERE date = $1`,
      [today]
    );
    const stats = r.rows[0] || { pizzas: 0, clientes: 0, wa_orders: 0 };

    // ── Format Telegram message ───────────────────────────────────────────────
    const msg = [
      `🍕 *La Pizza Cubana — Buenos días, Ray!*`,
      ``,
      `📅 ${dateStr}`,
      ``,
      `*Registro de hoy hasta ahora:*`,
      `🍕 ${stats.pizzas} pizzas`,
      `👤 ${stats.clientes} clientes`,
      `📱 ${stats.wa_orders} pedidos por WhatsApp`,
      ``,
      `*Checklist de hoy:*`,
      `✅ Publicar en Instagram`,
      `✅ Revisar mensajes de WhatsApp`,
      `✅ Responder reseñas de Google`,
      `✅ Contar pizzas al final del día`,
      ``,
      `[👉 Abrir Dashboard](https://la-pizza-cubana.vercel.app/ray)`,
    ].join('\n');

    // ── Send via Telegram ─────────────────────────────────────────────────────
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramStatus = 'not_configured';

    if (botToken && chatId) {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: msg,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          }),
        }
      );
      const tgData = await tgRes.json();
      telegramStatus = tgData.ok ? 'sent' : `failed: ${tgData.description}`;
    }

    // ── Persist last trigger in pope_memory ────────────────────────────────
    await db.query(
      `INSERT INTO pope_memory (key, value)
       VALUES ('last_daily_trigger', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify({ triggered_at: new Date().toISOString(), date: today, stats, telegram: telegramStatus })]
    );

    return res.json({ ok: true, date: today, stats, telegram: telegramStatus });
  } catch (err) {
    console.error('[/api/pope]', err.message);
    res.status(500).json({ error: 'internal', message: err.message });
  }
};
