import { DatabaseSync, backup } from 'node:sqlite';

// Keep existing synchronous repository queries and SQLite files unchanged.
// node:sqlite ships with Node, avoiding a separately compiled GLIBC-dependent addon.
export default class Database {
  constructor(file, { readonly = false, timeout = 5000 } = {}) {
    this.connection = new DatabaseSync(file, { readOnly: readonly });
    this.connection.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(timeout))}`);
    this.depth = 0;
  }
  exec(sql) { this.connection.exec(sql); return this; }
  prepare(sql) {
    const statement = this.connection.prepare(sql);
    const row = value => value === undefined ? undefined : { ...value };
    return {
      run: (...args) => statement.run(...args),
      get: (...args) => row(statement.get(...args)),
      all: (...args) => statement.all(...args).map(row),
    };
  }
  pragma(sql, { simple = false } = {}) {
    const rows = this.prepare(`PRAGMA ${sql}`).all();
    return simple ? (rows[0] ? Object.values(rows[0])[0] : undefined) : rows;
  }
  transaction(fn) {
    return (...args) => {
      const name = `repository_${this.depth++}`;
      this.connection.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn(...args);
        if (result?.then) throw new Error('SQLite transactions must be synchronous.');
        this.connection.exec(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        this.connection.exec(`ROLLBACK TO SAVEPOINT ${name}; RELEASE SAVEPOINT ${name}`);
        throw error;
      } finally { this.depth--; }
    };
  }
  backup(file) { return backup(this.connection, file); }
  close() { this.connection.close(); }
}
