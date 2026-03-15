'use strict';
// GET /api/ping — health check + DB connectivity test
const { getPool, ensureTables } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    await ensureTables();
    const db = getPool();
    const r = await db.query('SELECT NOW() AS ts, COUNT(*) AS event_count FROM events');
    res.json({
      ok: true,
      db: 'connected',
      server_time: r.rows[0].ts,
      total_events: r.rows[0].event_count,
    });
  } catch (err) {
    res.status(500).json({ ok: false, db: 'error', message: err.message });
  }
};
