interface D1Result<T = Record<string, unknown>> { results: T[]; success: boolean; meta?: unknown }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}
export interface Env {
  DB: D1Database;
  BOOTSTRAP_ADMIN_KEY?: string;
  APP_ORIGIN?: string;
  SESSION_DAYS?: string;
}
interface UserRow {
  id: string; email: string; full_name: string; password_hash: string; password_salt: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'USER';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'DISABLED';
  created_at: string; approved_at: string | null; approved_by: string | null; last_login_at: string | null;
}
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const uuid = () => crypto.randomUUID();
const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const hex = (v: Uint8Array) => Array.from(v, x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string) => new Uint8Array((s.match(/.{2}/g) || []).map(x => parseInt(x, 16)));
async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(hash));
}
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(salt), iterations: 310000, hash: 'SHA-256' }, key, 256);
  return hex(new Uint8Array(bits));
}
async function verifyPassword(password: string, salt: string, expected: string) {
  const actual = await passwordHash(password, salt);
  return actual.length === expected.length && actual === expected;
}
function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie') || '';
  const item = raw.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}
function cookieHeader(value: string, maxAge: number) {
  return `__Host-avs_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function clearCookie() { return '__Host-avs_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'; }
function originAllowed(request: Request, env: Env) {
  const origin = request.headers.get('origin');
  if (!origin) return request.method === 'GET' || request.method === 'HEAD';
  const expected = env.APP_ORIGIN || new URL(request.url).origin;
  return origin === expected;
}
async function body(request: Request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('Yêu cầu phải sử dụng JSON.');
  const value = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dữ liệu không hợp lệ.');
  return value as Record<string, unknown>;
}
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, fullName: user.full_name, role: user.role, status: user.status, createdAt: user.created_at, approvedAt: user.approved_at, lastLoginAt: user.last_login_at };
}
async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const token = cookie(request, '__Host-avs_session');
  if (!token) return null;
  const hash = await digest(token);
  const row = await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ? LIMIT 1`)
    .bind(hash, new Date().toISOString()).first<UserRow>();
  if (!row || row.status !== 'APPROVED') return null;
  return row;
}
async function audit(env: Env, actor: string | null, target: string | null, action: string, details?: unknown) {
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,target_user_id,action,details) VALUES(?,?,?,?,?)')
    .bind(uuid(), actor, target, action, details ? JSON.stringify(details).slice(0, 2000) : null).run();
}
function roleRank(role: string) { return ({ SUPER_ADMIN: 4, ADMIN: 3, EDITOR: 2, USER: 1 } as Record<string, number>)[role] || 0; }
async function issueSession(env: Env, user: UserRow) {
  const token = hex(bytes(32));
  const days = Math.min(30, Math.max(1, Number(env.SESSION_DAYS || 7)));
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)')
    .bind(uuid(), user.id, await digest(token), expires).run();
  await env.DB.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?')
    .bind(new Date().toISOString(), new Date().toISOString(), user.id).run();
  return { token, maxAge: days * 86400 };
}
async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!originAllowed(request, env)) return fail('Nguồn yêu cầu không được phép.', 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  try {
    if (path === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'account-api' });

    if (path === '/api/auth/register' && request.method === 'POST') {
      const data = await body(request);
      const email = str(data.email).toLowerCase();
      const fullName = str(data.fullName);
      const password = str(data.password);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return fail('Email không hợp lệ.');
      if (fullName.length < 2 || fullName.length > 120) return fail('Họ và tên phải từ 2 đến 120 ký tự.');
      if (password.length < 12 || password.length > 128) return fail('Mật khẩu phải có ít nhất 12 ký tự.');
      const exists = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
      if (exists) return fail('Email này đã được đăng ký.', 409);
      const salt = hex(bytes(16));
      const id = uuid();
      await env.DB.prepare('INSERT INTO users(id,email,full_name,password_hash,password_salt,role,status) VALUES(?,?,?,?,?,?,?)')
        .bind(id, email, fullName, await passwordHash(password, salt), salt, 'USER', 'PENDING_APPROVAL').run();
      await audit(env, null, id, 'ACCOUNT_REGISTERED');
      return json({ message: 'Đăng ký thành công. Tài khoản đang chờ quản trị viên phê duyệt.', status: 'PENDING_APPROVAL' }, 201);
    }

    if (path === '/api/auth/bootstrap' && request.method === 'POST') {
      if (!env.BOOTSTRAP_ADMIN_KEY || !request.headers.get('x-bootstrap-key') || request.headers.get('x-bootstrap-key') !== env.BOOTSTRAP_ADMIN_KEY) return fail('Không có quyền khởi tạo.', 403);
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role='SUPER_ADMIN'").first<{count:number}>();
      if ((count?.count || 0) > 0) return fail('Super Admin đã được khởi tạo. Không thể khởi tạo lần nữa.', 409);
      const data = await body(request);
      const email = str(data.email).toLowerCase();
      const fullName = str(data.fullName);
      const password = str(data.password);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || fullName.length < 2 || password.length < 12 || password.length > 128) return fail('Thông tin khởi tạo không hợp lệ; mật khẩu tối thiểu 12 ký tự.');
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
      if (existing) return fail('Email đã tồn tại. Hãy dùng email quản trị khác.', 409);
      const salt = hex(bytes(16)); const id = uuid();
      await env.DB.prepare("INSERT INTO users(id,email,full_name,password_hash,password_salt,role,status,approved_at) VALUES(?,?,?,?,?,'SUPER_ADMIN','APPROVED',?)")
        .bind(id,email,fullName,await passwordHash(password,salt),salt,new Date().toISOString()).run();
      await audit(env, id, id, 'SUPER_ADMIN_BOOTSTRAPPED');
      return json({ message: 'Đã khởi tạo Super Admin. Hãy xóa secret BOOTSTRAP_ADMIN_KEY khỏi môi trường sau bước này.' }, 201);
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      const data = await body(request);
      const email = str(data.email).toLowerCase();
      const password = str(data.password);
      const user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<UserRow>();
      if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) return fail('Email hoặc mật khẩu không chính xác.', 401);
      if (user.status !== 'APPROVED') return fail(user.status === 'PENDING_APPROVAL' ? 'Tài khoản đang chờ phê duyệt.' : 'Tài khoản hiện không được phép đăng nhập.', 403);
      const session = await issueSession(env, user);
      await audit(env, user.id, user.id, 'LOGIN');
      return json({ user: publicUser(user) }, 200, { 'set-cookie': cookieHeader(session.token, session.maxAge) });
    }

    if (path === '/api/auth/logout' && request.method === 'POST') {
      const token = cookie(request, '__Host-avs_session');
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
      return json({ message: 'Đã đăng xuất.' }, 200, { 'set-cookie': clearCookie() });
    }

    if (path === '/api/auth/me' && request.method === 'GET') {
      const user = await currentUser(request, env);
      return user ? json({ user: publicUser(user) }) : json({ user: null }, 200, { 'set-cookie': clearCookie() });
    }

    const actor = await currentUser(request, env);
    if (!actor) return fail('Vui lòng đăng nhập bằng tài khoản đã được phê duyệt.', 401);

    if (path === '/api/auth/change-password' && request.method === 'POST') {
      const data = await body(request);
      const current = str(data.currentPassword); const next = str(data.newPassword);
      if (next.length < 12 || next.length > 128) return fail('Mật khẩu mới phải có ít nhất 12 ký tự.');
      const row = await env.DB.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(actor.id).first<{password_hash:string;password_salt:string}>();
      if (!row || !(await verifyPassword(current,row.password_salt,row.password_hash))) return fail('Mật khẩu hiện tại không chính xác.', 403);
      const salt = hex(bytes(16));
      await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?')
        .bind(await passwordHash(next,salt),salt,new Date().toISOString(),actor.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(actor.id).run();
      const fresh = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(actor.id).first<UserRow>();
      if (!fresh) return fail('Không thể tải lại tài khoản.',500);
      const session = await issueSession(env,fresh);
      await audit(env,actor.id,actor.id,'PASSWORD_CHANGED');
      return json({ message:'Đổi mật khẩu thành công.' },200,{'set-cookie':cookieHeader(session.token,session.maxAge)});
    }

    if (path === '/api/admin/users' && request.method === 'GET') {
      if (roleRank(actor.role) < roleRank('ADMIN')) return fail('Bạn không có quyền quản lý tài khoản.',403);
      const result = await env.DB.prepare('SELECT id,email,full_name,role,status,created_at,approved_at,last_login_at FROM users ORDER BY created_at DESC').all();
      return json({ users: result.results.map((row: Record<string, unknown>) => ({ id: row.id, email: row.email, fullName: row.full_name, role: row.role, status: row.status, createdAt: row.created_at, approvedAt: row.approved_at, lastLoginAt: row.last_login_at })) });
    }

    const match = path.match(/^\/api\/admin\/users\/([0-9a-f-]+)\/(approve|reject|disable|enable|role|reset-password|delete)$/);
    if (match && request.method === 'POST') {
      if (roleRank(actor.role) < roleRank('ADMIN')) return fail('Bạn không có quyền quản lý tài khoản.',403);
      const [, targetId, action] = match;
      const target = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(targetId).first<UserRow>();
      if (!target) return fail('Không tìm thấy tài khoản.',404);
      if (target.role === 'SUPER_ADMIN') return fail('Tài khoản Super Admin được bảo vệ tuyệt đối; không thể khóa, xóa, hạ cấp hoặc thay đổi trạng thái.',403);
      if (actor.id === target.id && ['disable','delete','role','reset-password'].includes(action)) return fail('Không thể thực hiện thao tác này trên chính tài khoản đang đăng nhập.',403);
      if (actor.role !== 'SUPER_ADMIN' && (roleRank(target.role) >= roleRank(actor.role) || action === 'delete' || action === 'reset-password')) return fail('Bạn chỉ được quản lý tài khoản có quyền thấp hơn.',403);
      const data = await body(request);
      const now = new Date().toISOString();
      if (action === 'approve' || action === 'reject' || action === 'disable' || action === 'enable') {
        const status = ({ approve:'APPROVED', reject:'REJECTED', disable:'DISABLED', enable:'APPROVED' } as Record<string,string>)[action];
        await env.DB.prepare('UPDATE users SET status=?,approved_at=?,approved_by=?,updated_at=? WHERE id=? AND role<>\'SUPER_ADMIN\'')
          .bind(status, status === 'APPROVED' ? now : target.approved_at, status === 'APPROVED' ? actor.id : target.approved_by, now,targetId).run();
        if (status !== 'APPROVED') await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(targetId).run();
      } else if (action === 'role') {
        const role = str(data.role);
        if (!['ADMIN','EDITOR','USER'].includes(role)) return fail('Vai trò không hợp lệ.');
        if (actor.role !== 'SUPER_ADMIN' && roleRank(role) >= roleRank(actor.role)) return fail('Không thể cấp vai trò ngang hoặc cao hơn quyền của bạn.',403);
        await env.DB.prepare('UPDATE users SET role=?,updated_at=? WHERE id=? AND role<>\'SUPER_ADMIN\'').bind(role,now,targetId).run();
      } else if (action === 'reset-password') {
        const password = str(data.newPassword);
        if (password.length < 12 || password.length > 128) return fail('Mật khẩu mới phải có ít nhất 12 ký tự.');
        const salt = hex(bytes(16));
        await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=? AND role<>\'SUPER_ADMIN\'')
          .bind(await passwordHash(password,salt),salt,now,targetId).run();
        await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(targetId).run();
      } else if (action === 'delete') {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(targetId),
          env.DB.prepare('DELETE FROM users WHERE id=? AND role<>\'SUPER_ADMIN\'').bind(targetId)
        ]);
      }
      await audit(env,actor.id,targetId,'ADMIN_'+action.toUpperCase());
      return json({ message:'Đã thực hiện thao tác quản trị.' });
    }
    return fail('Không tìm thấy API.',404);
  } catch (error) {
    console.error('API error', error);
    return fail('Đã xảy ra lỗi máy chủ. Vui lòng thử lại hoặc kiểm tra nhật ký Worker.',500);
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request,env);
    if (env.DB) {
      const asset = await (env as Env & { ASSETS?: { fetch: (request: Request) => Promise<Response> } }).ASSETS?.fetch(request);
      if (asset) return asset;
    }
    return new Response('AI Product Video Studio API is running.', { status: 200 });
  }
};
