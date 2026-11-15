// MOCKED — in-memory D1 stub for AI Studio runtime (data resets on restart)
export interface MockD1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface MockD1PreparedStatement {
  bind(...values: unknown[]): MockD1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<MockD1Result<T>>;
  run(): Promise<MockD1Result>;
}

export interface MockD1Database {
  prepare(query: string): MockD1PreparedStatement;
  batch<T = unknown>(statements: MockD1PreparedStatement[]): Promise<T[]>;
}

interface StoredUser {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  password_salt: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'USER';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'DISABLED';
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  last_login_at: string | null;
}

interface StoredSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
}

interface StoredAuditLog {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export function createMockD1(): MockD1Database {
  const users: StoredUser[] = [];
  const sessions: StoredSession[] = [];
  const auditLogs: StoredAuditLog[] = [];

  const execute = (query: string, params: unknown[]): MockD1Result => {
    const sql = query.replace(/\s+/g, ' ').trim();
    const now = new Date().toISOString();

    if (sql.startsWith('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ?')) {
      const [tokenHash, nowIso] = params as [string, string];
      const session = sessions.find(s => s.token_hash === tokenHash && s.expires_at > nowIso);
      const user = session ? users.find(u => u.id === session.user_id) : undefined;
      return { results: user ? [{ ...user }] : [], success: true };
    }

    if (sql.startsWith('INSERT INTO audit_logs(id,actor_user_id,target_user_id,action,details)')) {
      const [id, actor_user_id, target_user_id, action, details] = params as [string, string | null, string | null, string, string | null];
      auditLogs.push({ id, actor_user_id, target_user_id, action, details, created_at: now });
      return { results: [], success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('INSERT INTO sessions(id,user_id,token_hash,expires_at)')) {
      const [id, user_id, token_hash, expires_at] = params as [string, string, string, string];
      sessions.push({ id, user_id, token_hash, expires_at, created_at: now, last_seen_at: now });
      return { results: [], success: true, meta: { changes: 1 } };
    }

    if (sql === 'UPDATE users SET last_login_at=?,updated_at=? WHERE id=?') {
      const [last_login_at, updated_at, id] = params as [string, string, string];
      const user = users.find(u => u.id === id);
      if (user) {
        user.last_login_at = last_login_at;
        user.updated_at = updated_at;
      }
      return { results: [], success: true, meta: { changes: user ? 1 : 0 } };
    }

    if (sql === 'SELECT id FROM users WHERE email=?') {
      const [email] = params as [string];
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      return { results: user ? [{ id: user.id }] : [], success: true };
    }

    if (sql.startsWith('INSERT INTO users(id,email,full_name,password_hash,password_salt,role,status)')) {
      const [id, email, full_name, password_hash, password_salt, role, status] = params as [
        string, string, string, string, string, StoredUser['role'], StoredUser['status'],
      ];
      if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('UNIQUE constraint failed: users.email');
      }
      users.push({
        id,
        email,
        full_name,
        password_hash,
        password_salt,
        role,
        status,
        created_at: now,
        updated_at: now,
        approved_at: null,
        approved_by: null,
        last_login_at: null,
      });
      return { results: [], success: true, meta: { changes: 1 } };
    }

    if (sql === "SELECT COUNT(*) AS count FROM users WHERE role='SUPER_ADMIN'") {
      const count = users.filter(u => u.role === 'SUPER_ADMIN').length;
      return { results: [{ count }], success: true };
    }

    if (sql.startsWith("INSERT INTO users(id,email,full_name,password_hash,password_salt,role,status,approved_at)")) {
      const [id, email, full_name, password_hash, password_salt, approved_at] = params as [
        string, string, string, string, string, string,
      ];
      if (users.some(u => u.role === 'SUPER_ADMIN')) {
        throw new Error('UNIQUE constraint failed: idx_users_single_super_admin');
      }
      if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('UNIQUE constraint failed: users.email');
      }
      users.push({
        id,
        email,
        full_name,
        password_hash,
        password_salt,
        role: 'SUPER_ADMIN',
        status: 'APPROVED',
        created_at: now,
        updated_at: now,
        approved_at,
        approved_by: null,
        last_login_at: null,
      });
      return { results: [], success: true, meta: { changes: 1 } };
    }

    if (sql === 'SELECT * FROM users WHERE email=?') {
      const [email] = params as [string];
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      return { results: user ? [{ ...user }] : [], success: true };
    }

    if (sql === 'DELETE FROM sessions WHERE token_hash=?') {
      const [tokenHash] = params as [string];
      let changes = 0;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].token_hash === tokenHash) {
          sessions.splice(i, 1);
          changes++;
        }
      }
      return { results: [], success: true, meta: { changes } };
    }

    if (sql === 'SELECT password_hash,password_salt FROM users WHERE id=?') {
      const [id] = params as [string];
      const user = users.find(u => u.id === id);
      return {
        results: user ? [{ password_hash: user.password_hash, password_salt: user.password_salt }] : [],
        success: true,
      };
    }

    if (sql === 'UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?') {
      const [password_hash, password_salt, updated_at, id] = params as [string, string, string, string];
      const user = users.find(u => u.id === id);
      if (user) {
        user.password_hash = password_hash;
        user.password_salt = password_salt;
        user.updated_at = updated_at;
      }
      return { results: [], success: true, meta: { changes: user ? 1 : 0 } };
    }

    if (sql === 'DELETE FROM sessions WHERE user_id=?') {
      const [userId] = params as [string];
      let changes = 0;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].user_id === userId) {
          sessions.splice(i, 1);
          changes++;
        }
      }
      return { results: [], success: true, meta: { changes } };
    }

    if (sql === 'SELECT * FROM users WHERE id=?') {
      const [id] = params as [string];
      const user = users.find(u => u.id === id);
      return { results: user ? [{ ...user }] : [], success: true };
    }

    if (sql === 'SELECT id,email,full_name,role,status,created_at,approved_at,last_login_at FROM users ORDER BY created_at DESC') {
      const sorted = [...users].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        results: sorted.map(u => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          status: u.status,
          created_at: u.created_at,
          approved_at: u.approved_at,
          last_login_at: u.last_login_at,
        })),
        success: true,
      };
    }

    if (sql === "UPDATE users SET status=?,approved_at=?,approved_by=?,updated_at=? WHERE id=? AND role<>'SUPER_ADMIN'") {
      const [status, approved_at, approved_by, updated_at, id] = params as [
        StoredUser['status'], string | null, string | null, string, string,
      ];
      const user = users.find(u => u.id === id && u.role !== 'SUPER_ADMIN');
      if (user) {
        user.status = status;
        user.approved_at = approved_at;
        user.approved_by = approved_by;
        user.updated_at = updated_at;
      }
      return { results: [], success: true, meta: { changes: user ? 1 : 0 } };
    }

    if (sql === "UPDATE users SET role=?,updated_at=? WHERE id=? AND role<>'SUPER_ADMIN'") {
      const [role, updated_at, id] = params as [StoredUser['role'], string, string];
      const user = users.find(u => u.id === id && u.role !== 'SUPER_ADMIN');
      if (user) {
        user.role = role;
        user.updated_at = updated_at;
      }
      return { results: [], success: true, meta: { changes: user ? 1 : 0 } };
    }

    if (sql === "UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=? AND role<>'SUPER_ADMIN'") {
      const [password_hash, password_salt, updated_at, id] = params as [string, string, string, string];
      const user = users.find(u => u.id === id && u.role !== 'SUPER_ADMIN');
      if (user) {
        user.password_hash = password_hash;
        user.password_salt = password_salt;
        user.updated_at = updated_at;
      }
      return { results: [], success: true, meta: { changes: user ? 1 : 0 } };
    }

    if (sql === "DELETE FROM users WHERE id=? AND role<>'SUPER_ADMIN'") {
      const [id] = params as [string];
      const idx = users.findIndex(u => u.id === id && u.role !== 'SUPER_ADMIN');
      if (idx !== -1) {
        users.splice(idx, 1);
        return { results: [], success: true, meta: { changes: 1 } };
      }
      return { results: [], success: true, meta: { changes: 0 } };
    }

    console.warn('[AI Studio Mock D1] Unhandled query:', sql);
    return { results: [], success: true };
  };

  const makeStatement = (query: string, bound: unknown[] = []): MockD1PreparedStatement => ({
    bind(...values: unknown[]) {
      return makeStatement(query, values);
    },
    async first<T = Record<string, unknown>>() {
      const result = execute(query, bound);
      return (result.results[0] as T | undefined) ?? null;
    },
    async all<T = Record<string, unknown>>() {
      return execute(query, bound) as MockD1Result<T>;
    },
    async run() {
      return execute(query, bound);
    },
  });

  return {
    prepare(query: string) {
      return makeStatement(query);
    },
    async batch<T = unknown>(statements: MockD1PreparedStatement[]) {
      const results: T[] = [];
      for (const stmt of statements) {
        results.push((await stmt.run()) as T);
      }
      return results;
    },
  };
}
