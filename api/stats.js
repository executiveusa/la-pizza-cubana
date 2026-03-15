'use strict';
// GET /api/stats  — returns today's stats
// POST /api/stats — increments a counter field by delta
//
// POST body: { field: 'pizzas'|'customers'|'orders', delta: 1|-1 }
// Maps UI field names → DB column names
const { getPool, ensureTables } = require('./_db');

const FIELD_MAP = { pizzas: 'pizzas', customers: 'clientes', orders: 'wa_orders' };
const CORS = 'https://la-pizza-cubana.vercel.app';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Use today's date in Mexico City time (UTC−6)
  const now = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);

  try {
    await ensureTables();
    const db = getPool();

    // ── GET ─────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const r = await db.query(
        `SELECT pizzas, clientes, wa_orders FROM daily_stats WHERE date = $1`,
        [today]
      );
      const row = r.rows[0] || { pizzas: 0, clientes: 0, wa_orders: 0 };
      return res.json({
        date: today,
        pizzas: row.pizzas,
        customers: row.clientes,
        orders: row.wa_orders,
      });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { field, delta = 1 } = req.body || {};
      const col = FIELD_MAP[field];
      if (!col) return res.status(400).json({ error: 'invalid field', allowed: Object.keys(FIELD_MAP) });

      const d = parseInt(delta, 10);
      if (isNaN(d) || d < -100 || d > 100) return res.status(400).json({ error: 'invalid delta' });

      const r = await db.query(
        `INSERT INTO daily_stats (date, pizzas, clientes, wa_orders)
         VALUES ($1,
           CASE WHEN $2 = 'pizzas'    THEN GREATEST(0,$3) ELSE 0 END,
           CASE WHEN $2 = 'clientes'  THEN GREATEST(0,$3) ELSE 0 END,
           CASE WHEN $2 = 'wa_orders' THEN GREATEST(0,$3) ELSE 0 END
         )
         ON CONFLICT (date) DO UPDATE SET
           pizzas    = CASE WHEN $2 = 'pizzas'    THEN GREATEST(0, daily_stats.pizzas    + $3) ELSE daily_stats.pizzas    END,
           clientes  = CASE WHEN $2 = 'clientes'  THEN GREATEST(0, daily_stats.clientes  + $3) ELSE daily_stats.clientes  END,
           wa_orders = CASE WHEN $2 = 'wa_orders' THEN GREATEST(0, daily_stats.wa_orders + $3) ELSE daily_stats.wa_orders END,
           updated_at = NOW()
         RETURNING pizzas, clientes, wa_orders`,
        [today, col, d]
      );
      const row = r.rows[0];
      return res.json({
        date: today,
        pizzas: row.pizzas,
        customers: row.clientes,
        orders: row.wa_orders,
      });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[/api/stats]', err.message);
    res.status(500).json({ error: 'db_error', message: err.message });
  }
};
