import { useEffect, useState } from 'react';
import { LockKeyhole, LogIn, LogOut, ShieldCheck, UserPlus, Users, X, Check, Ban, KeyRound, ArrowRight } from 'lucide-react';
import { api, roleLabel, statusLabel } from './lib/api';
import type { User, UserQuota, UserUsage } from './types';

type Props = {
  open: boolean;
  initialMode?: 'login' | 'register' | 'account';
  inline?: boolean;
  onClose: () => void;
  onAuthChange?: (user: User | null, quota?: UserQuota | null, usage?: UserUsage | null) => void;
  onNavigate?: (path: string) => void;
};

export default function AuthPanel({ open, initialMode = 'login', inline = false, onClose, onAuthChange, onNavigate }: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'account'>(initialMode);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassValue, setResetPassValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadUsers = async () => {
    const result = await api<{ users: User[] }>('/api/admin/users');
    setUsers(result.users || []);
  };

  useEffect(() => {
    if (open) {
      setError('');
      setMessage('');
      setMode(initialMode);
      api<{ user: User | null; quota?: UserQuota; usage?: UserUsage }>('/api/auth/me')
        .then(r => {
          if (r.user) {
            setUser(r.user);
            setMode('account');
            onAuthChange?.(r.user, r.quota || null, r.usage || null);
          } else {
            setUser(null);
            setMode(initialMode === 'account' ? 'login' : initialMode);
          }
        })
        .catch(() => {});
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (open && user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      loadUsers().catch(e => setError(e.message));
    }
  }, [open, user?.id]);

  if (!open) return null;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = () =>
    run(async () => {
      if (mode === 'register') {
        const result = await api<{ message: string }>('/api/auth/register', 'POST', {
          fullName,
          email,
          username,
          phone,
          purpose,
          password,
        });
        setMessage(result.message);
        setMode('login');
        setIdentifier(email);
        setPassword('');
      } else {
        const result = await api<{ user: User; quota?: UserQuota; usage?: UserUsage }>('/api/auth/login', 'POST', {
          identifier,
          email: identifier,
          password,
        });
        setUser(result.user);
        setMode('account');
        setPassword('');
        setMessage('Đăng nhập thành công.');
        onAuthChange?.(result.user, result.quota || null, result.usage || null);
      }
    });

  const logout = () =>
    run(async () => {
      await api('/api/auth/logout', 'POST', {});
      setUser(null);
      setUsers([]);
      setMode('login');
      setMessage('Đã đăng xuất.');
      onAuthChange?.(null, null, null);
    });

  const action = (id: string, verb: string, data?: unknown) =>
    run(async () => {
      await api(`/api/admin/users/${id}/${verb}`, 'POST', data || {});
      await loadUsers();
      setResetTarget(null);
      setResetPassValue('');
      setDeleteTarget(null);
      setMessage('Đã cập nhật tài khoản.');
    });

  const canManage = (target: User) =>
    user?.role === 'SUPER_ADMIN' || (user?.role === 'ADMIN' && ['EDITOR', 'USER'].includes(target.role));

  const changePassword = () =>
    run(async () => {
      if (newPassword !== confirmNewPassword) {
        throw new Error('Xác nhận mật khẩu mới chưa khớp.');
      }
      const r = await api<{ message: string }>('/api/auth/change-password', 'POST', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setMessage(r.message);
    });

  const panelContent = (
    <section className={inline ? 'auth-panel auth-panel-inline' : 'auth-panel'} role="dialog" aria-modal={!inline} aria-label="Tài khoản">
      <div className="auth-head">
        <div className="auth-brand">
          <span>
            <ShieldCheck size={19} />
          </span>
          <div>
            <b>AI PRODUCT VIDEO STUDIO</b>
            <small>TÀI KHOẢN & BẢO MẬT</small>
          </div>
        </div>
        {!inline && (
          <button className="auth-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        )}
      </div>

      {!user ? (
        <div className="auth-content">
          <div className="auth-tabs">
            <button
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Đăng nhập
            </button>
            <button
              className={mode === 'register' ? 'selected' : ''}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Đăng ký
            </button>
          </div>

          <h2>{mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}</h2>
          <p className="auth-intro">
            {mode === 'login'
              ? 'Đăng nhập bằng email hoặc tên đăng nhập của tài khoản đã được phê duyệt.'
              : 'Tài khoản mới cần được Admin hoặc Super Admin phê duyệt trước khi sử dụng Studio.'}
          </p>

          {mode === 'register' ? (
            <>
              <label>
                Họ và tên *
                <input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" placeholder="Nguyễn Văn A" />
              </label>
              <div className="password-grid">
                <label>
                  Email *
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="email@example.com" />
                </label>
                <label>
                  Tên đăng nhập
                  <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="nguyenvana" />
                </label>
              </div>
              <div className="password-grid">
                <label>
                  Số điện thoại (không bắt buộc)
                  <input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="09xx xxx xxx" />
                </label>
                <label>
                  Mục đích sử dụng
                  <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Bán hàng online, quảng cáo sản phẩm..." />
                </label>
              </div>
              <label>
                Mật khẩu *
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Tối thiểu 12 ký tự"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Email hoặc tên đăng nhập
                <input
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  autoComplete="username"
                  placeholder="email@example.com hoặc username"
                />
              </label>
              <label>
                Mật khẩu
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && identifier && password) submitAuth();
                  }}
                />
              </label>
            </>
          )}

          <button
            className="auth-submit"
            disabled={busy || !password || (mode === 'login' ? !identifier : !email || !fullName)}
            onClick={submitAuth}
          >
            {mode === 'login' ? <LogIn size={17} /> : <UserPlus size={17} />}
            {mode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}
          </button>

          <div className="auth-security">
            <LockKeyhole size={15} /> Mật khẩu được băm PBKDF2-HMAC-SHA256; phiên đăng nhập dùng cookie HttpOnly bảo mật.
          </div>
        </div>
      ) : (
        <div className="auth-content">
          <div className="account-summary">
            <span className="account-avatar">{user.fullName.slice(0, 1).toUpperCase()}</span>
            <div>
              <h2>{user.fullName}</h2>
              <p>
                {user.email}
                {user.username ? ` · @${user.username}` : ''}
              </p>
              <div className="account-badges">
                <b>{roleLabel[user.role] || user.role}</b>
                <span>{statusLabel[user.status] || user.status}</span>
              </div>
            </div>
          </div>

          {onNavigate && (
            <div className="auth-quick-nav">
              <button
                className="auth-secondary"
                onClick={() => {
                  onClose();
                  onNavigate('/studio');
                }}
              >
                Vào Video Studio <ArrowRight size={14} />
              </button>
              <button
                className="auth-secondary"
                onClick={() => {
                  onClose();
                  onNavigate('/profile');
                }}
              >
                Hồ sơ & Hạn mức
              </button>
              {['SUPER_ADMIN', 'ADMIN'].includes(user.role) && (
                <button
                  className="auth-secondary"
                  onClick={() => {
                    onClose();
                    onNavigate('/admin');
                  }}
                >
                  Trang Quản trị
                </button>
              )}
            </div>
          )}

          <div className="auth-section-title">
            <KeyRound size={17} /> Đổi mật khẩu cá nhân
          </div>
          <div className="password-grid">
            <label>
              Mật khẩu hiện tại *
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label>
              Mật khẩu mới *
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Tối thiểu 12 ký tự"
              />
            </label>
          </div>
          <label>
            Xác nhận mật khẩu mới *
            <input
              type="password"
              value={confirmNewPassword}
              onChange={e => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button
            className="auth-secondary"
            disabled={busy || !currentPassword || newPassword.length < 12 || newPassword !== confirmNewPassword}
            onClick={changePassword}
          >
            Cập nhật mật khẩu
          </button>

          {['SUPER_ADMIN', 'ADMIN'].includes(user.role) && (
            <div className="admin-users">
              <div className="auth-section-title">
                <Users size={17} /> Quản lý tài khoản nhanh <span>{users.length}</span>
              </div>
              {users.map(item => (
                <div className="admin-user-row" key={item.id}>
                  <div className="admin-user-info">
                    <b>{item.fullName}</b>
                    <small>{item.email}</small>
                    <span>
                      {roleLabel[item.role] || item.role} · {statusLabel[item.status] || item.status}
                    </span>
                  </div>
                  {item.role !== 'SUPER_ADMIN' && canManage(item) && (
                    <div className="admin-user-actions">
                      <select
                        aria-label="Vai trò tài khoản"
                        value={item.role}
                        onChange={e => action(item.id, 'role', { role: e.target.value })}
                      >
                        {(user.role === 'SUPER_ADMIN' ? ['ADMIN', 'EDITOR', 'USER'] : ['EDITOR', 'USER']).map(role => (
                          <option key={role} value={role}>
                            {roleLabel[role]}
                          </option>
                        ))}
                      </select>
                      {item.status === 'PENDING_APPROVAL' && (
                        <button title="Phê duyệt" onClick={() => action(item.id, 'approve')}>
                          <Check size={15} />
                        </button>
                      )}
                      {item.status === 'APPROVED' ? (
                        <button title="Khóa tài khoản" onClick={() => action(item.id, 'disable')}>
                          <Ban size={15} />
                        </button>
                      ) : (
                        item.status !== 'PENDING_APPROVAL' && (
                          <button title="Mở khóa / duyệt" onClick={() => action(item.id, 'enable')}>
                            <Check size={15} />
                          </button>
                        )
                      )}
                      {user.role === 'SUPER_ADMIN' && (
                        <button
                          title="Đặt lại mật khẩu"
                          onClick={() => {
                            setResetTarget(item);
                            setResetPassValue('');
                            setDeleteTarget(null);
                          }}
                        >
                          <KeyRound size={15} />
                        </button>
                      )}
                      {user.role === 'SUPER_ADMIN' && (
                        <button
                          title="Xóa tài khoản"
                          onClick={() => {
                            setDeleteTarget(item);
                            setResetTarget(null);
                          }}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {resetTarget && (
                <div className="inline-confirm-box">
                  <p>
                    Đặt lại mật khẩu cho <b>{resetTarget.email}</b> (không cần mật khẩu cũ):
                  </p>
                  <input
                    type="password"
                    value={resetPassValue}
                    onChange={e => setResetPassValue(e.target.value)}
                    placeholder="Mật khẩu mới tối thiểu 12 ký tự"
                  />
                  <div className="inline-confirm-actions">
                    <button
                      className="auth-secondary"
                      disabled={busy || resetPassValue.length < 12}
                      onClick={() => action(resetTarget.id, 'reset-password', { newPassword: resetPassValue })}
                    >
                      Xác nhận đặt lại
                    </button>
                    <button className="auth-secondary" onClick={() => setResetTarget(null)}>
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {deleteTarget && (
                <div className="inline-confirm-box danger">
                  <p>
                    Xác nhận xóa vĩnh viễn tài khoản <b>{deleteTarget.email}</b>?
                  </p>
                  <div className="inline-confirm-actions">
                    <button className="auth-logout" onClick={() => action(deleteTarget.id, 'delete')}>
                      Xác nhận xóa
                    </button>
                    <button className="auth-secondary" onClick={() => setDeleteTarget(null)}>
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="auth-logout" disabled={busy} onClick={logout}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      )}

      {(message || error) && <div className={error ? 'auth-message error' : 'auth-message'}>{error || message}</div>}
    </section>
  );

  if (inline) {
    return <div className="inline-auth-wrap">{panelContent}</div>;
  }

  return (
    <div
      className="auth-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {panelContent}
    </div>
  );
}
