'use strict';
// Shared database module for La Pizza Cubana serverless API
// Uses pg (node-postgres) with Prisma Postgres (standard postgres:// URL)
const { Pool } = require('pg');

let pool;
let tablesReady = false;

function getPool() {
  if (!pool) {
    const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connStr) throw new Error('No database connection string in env');
    pool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 2,                    // keep low for serverless
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => console.error('pg pool error:', err.message));
  }
  return pool;
}

async function ensureTables() {
  if (tablesReady) return;
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      date        DATE         PRIMARY KEY,
      pizzas      INT          NOT NULL DEFAULT 0,
      clientes    INT          NOT NULL DEFAULT 0,
      wa_orders   INT          NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id            BIGSERIAL    PRIMARY KEY,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      source        TEXT         NOT NULL DEFAULT 'manual',
      customer_name TEXT,
      message       TEXT,
      amount        NUMERIC(8,2)
    );

    CREATE TABLE IF NOT EXISTS events (
      id          BIGSERIAL    PRIMARY KEY,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      event_type  TEXT         NOT NULL,
      payload     JSONB        NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS pope_memory (
      key         TEXT         PRIMARY KEY,
      value       TEXT         NOT NULL,
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  tablesReady = true;
}

module.exports = { getPool, ensureTables };
