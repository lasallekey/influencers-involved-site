// A minimal D1-compatible adapter over node:sqlite, for local preview and tests only.
// It mirrors the parts of the D1 API the Worker uses: prepare().bind().run/first/all, batch (atomic), exec.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p.map((v) => (v === undefined ? null : v))); }
  _run() {
    const s = this.db.prepare(this.sql);
    const returning = /\bRETURNING\b/i.test(this.sql) || /^\s*(SELECT|PRAGMA|WITH)/i.test(this.sql);
    if (returning) return { results: s.all(...this.params).map((r) => ({ ...r })), meta: { changes: 0 } };
    const r = s.run(...this.params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async run() { return { success: true, ...this._run() }; }
  async all() { return { success: true, ...this._run() }; }
  async first(col) { const r = this._run().results[0] ?? null; return col && r ? r[col] : r; }
}

export function createD1(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async exec(sql) { db.exec(sql); },
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => ({ success: true, ...s._run() }));
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

export function createMigratedD1(path) {
  const d = createD1(path);
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) d.raw.exec(readFileSync(join(dir, f), 'utf8'));
  return d;
}
