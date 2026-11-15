import { useEffect, useState } from 'react';
import { ArrowRight, Ban, Check, KeyRound, LockKeyhole, LogIn, LogOut, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import PasswordInput from './components/PasswordInput';
import { api, roleLabel, statusLabel } from './lib/api';
import type { User, UserQuota, UserUsage } from './types';

const REMEMBER_LOGIN_KEY = 'avs_remember_login';
const SAVED_IDENTIFIER_KEY = 'avs_saved_identifier';

type Props = {
  open: boolean;
  currentUser?: User | null;
  initialMode?: 'login' | 'register' | 'account';
  inline?: boolean;
  onClose: () => void;
  onAuthChange?: (user: User | null, quota?: UserQuota | null, usage?: UserUsage | null) => void;
  onNavigate?: (path: string) => void;
};

export default function AuthPanel({
  open,
  currentUser,
  initialMode = 'login',
  inline = false,
  onClose,
  onAuthChange,
  onNavigate,
}: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'account'>(initialMode);
  const [user, setUser] = useState<User | null>(currentUser ?? null);
  const [users, setUsers] = useState<User[]>([]);

  const [rememberLogin, setRememberLogin] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REMEMBER_LOGIN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [identifier, setIdentifier] = useState<string>(() => {
    try {
      return localStorage.getItem(REMEMBER_LOGIN_KEY) === '1'
        ? localStorage.getItem(SAVED_IDENTIFIER_KEY) || ''
        : '';
    } catch {
      return '';
    }
  });

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
    if (currentUser !== undefined) {
      setUser(currentUser);
      if (!currentUser && mode === 'account') {
        setMode(initialMode === 'register' ? 'register' : 'login');
      }
    }
  }, [currentUser, initialMode, mode]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setMessage('');
    if (currentUser) {
      setUser(currentUser);
      setMode('account');
      return;
    }
    setMode(initialMode === 'account' ? 'login' : initialMode);
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
  }, [open, initialMode, currentUser]);

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

  const handleRememberChange = (checked: boolean) => {
    setRememberLogin(checked);
    try {
      if (checked) {
        localStorage.setItem(REMEMBER_LOGIN_KEY, '1');
        if (identifier.trim()) localStorage.setItem(SAVED_IDENTIFIER_KEY, identifier.trim());
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
        localStorage.removeItem(SAVED_IDENTIFIER_KEY);
      }
    } catch {
      // Ignore storage errors in restricted environments
    }
  };

  const submitAuth = () =>
    run(async () => {
      if (mode === 'register') {
        if (password.length < 12) {
          throw new Error('Mật khẩu phải có ít nhất 12 ký tự.');
        }
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
        try {
          if (rememberLogin) {
            localStorage.setItem(REMEMBER_LOGIN_KEY, '1');
            localStorage.setItem(SAVED_IDENTIFIER_KEY, identifier.trim());
          } else {
            localStorage.removeItem(REMEMBER_LOGIN_KEY);
            localStorage.removeItem(SAVED_IDENTIFIER_KEY);
          }
        } catch {
          // Ignore storage errors
        }

        const result = await api<{ user: User; quota?: UserQuota; usage?: UserUsage }>('/api/auth/login', 'POST', {
          identifier,
          email: identifier,
          password,
        });
        setUser(result.user);
        setPassword('');
        setMessage('Đăng nhập thành công.');
        onAuthChange?.(result.user, result.quota || null, result.usage || null);
        if (!inline) {
          onClose();
        } else {
          setMode('account');
        }
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

  const passwordMismatch = confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;
  const passwordTooShort = newPassword.length > 0 && newPassword.length < 12;

  const changePassword = () =>
    run(async () => {
      if (!currentPassword) {
        throw new Error('Vui lòng nhập mật khẩu hiện tại.');
      }
      if (newPassword.length < 12) {
        throw new Error('Mật khẩu mới phải có ít nhất 12 ký tự.');
      }
      if (newPassword !== confirmNewPassword) {
        throw new Error('Xác nhận mật khẩu mới chưa khớp.');
      }
      const r = await api<{ message: string }>('/api/auth/change-password', 'POST', {
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setMessage(r.message);
    });

  const panelContent = (
    <section
      className={inline ? 'auth-panel auth-panel-inline' : 'auth-panel'}
      role={inline ? undefined : 'dialog'}
      aria-modal={!inline || undefined}
      aria-label="Tài khoản"
    >
      <div className="auth-head">
        <div className="auth-brand">
          <span>
            <ShieldCheck size={19} />
          </span>
          <div>
            <b>AI Product Video Studio</b>
            <small>Tài khoản & Bảo mật</small>
          </div>
        </div>
        {!inline && (
          <button type="button" className="auth-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        )}
      </div>

      {!user ? (
        <div className="auth-content">
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'selected' : ''}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Đăng ký
            </button>
          </div>

          <h2>{mode === 'login' ? 'Đăng nhập tài khoản' : 'Tạo tài khoản mới'}</h2>
          <p className="auth-intro">
            {mode === 'login'
              ? 'Sử dụng email hoặc tên đăng nhập đã được quản trị viên phê duyệt.'
              : 'Tài khoản sau khi đăng ký sẽ ở trạng thái chờ Admin hoặc Super Admin phê duyệt.'}
          </p>

          <form
            onSubmit={e => {
              e.preventDefault();
              submitAuth();
            }}
          >
            {mode === 'register' ? (
              <>
                <label>
                  Họ và tên *
                  <input
                    name="name"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    autoComplete="name"
                    placeholder="Nguyễn Văn A"
                    required
                  />
                </label>
                <div className="password-grid">
                  <label>
                    Email *
                    <input
                      type="email"
                      name="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="email@example.com"
                      required
                    />
                  </label>
                  <label>
                    Tên đăng nhập
                    <input
                      name="username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      autoComplete="username"
                      placeholder="nguyenvana"
                    />
                  </label>
                </div>
                <div className="password-grid">
                  <label>
                    Số điện thoại (không bắt buộc)
                    <input
                      name="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      autoComplete="tel"
                      placeholder="09xx xxx xxx"
                    />
                  </label>
                  <label>
                    Mục đích sử dụng
                    <input
                      name="purpose"
                      value={purpose}
                      onChange={e => setPurpose(e.target.value)}
                      placeholder="Bán hàng, giới thiệu sản phẩm..."
                    />
                  </label>
                </div>
                <label>
                  Mật khẩu *
                  <PasswordInput
                    name="password"
                    value={password}
                    onValueChange={setPassword}
                    autoComplete="new-password"
                    placeholder="Tối thiểu 12 ký tự"
                    clearAriaLabel="Xóa mật khẩu đăng ký"
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Email hoặc tên đăng nhập
                  <input
                    name="username"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    autoComplete="username"
                    placeholder="email@example.com hoặc tên đăng nhập"
                    required
                  />
                </label>
                <label>
                  Mật khẩu
                  <PasswordInput
                    name="password"
                    value={password}
                    onValueChange={setPassword}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    clearAriaLabel="Xóa mật khẩu đăng nhập"
                    required
                  />
                </label>
                <div className="remember-row">
                  <label className="remember-check">
                    <input
                      type="checkbox"
                      checked={rememberLogin}
                      onChange={e => handleRememberChange(e.target.checked)}
                    />
                    <span>Ghi nhớ mật khẩu trên thiết bị này</span>
                  </label>
                  <small className="remember-hint">
                    Lưu tên đăng nhập trên trình duyệt và dùng trình quản lý mật khẩu an toàn của thiết bị.
                  </small>
                </div>
              </>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={busy || !password || (mode === 'login' ? !identifier.trim() : !email.trim() || !fullName.trim())}
            >
              {mode === 'login' ? <LogIn size={17} /> : <UserPlus size={17} />}
              {busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}
            </button>
          </form>

          <div className="auth-security">
            <LockKeyhole size={16} />
            <span>Mật khẩu được băm PBKDF2-SHA256; phiên đăng nhập dùng cookie HttpOnly bảo mật.</span>
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
                type="button"
                className="auth-secondary"
                onClick={() => {
                  onClose();
                  onNavigate('/studio');
                }}
              >
                Vào Video Studio <ArrowRight size={15} />
              </button>
              <button
                type="button"
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
                  type="button"
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
          <form
            onSubmit={e => {
              e.preventDefault();
              changePassword();
            }}
          >
            <div className="password-grid">
              <label>
                Mật khẩu hiện tại *
                <PasswordInput
                  value={currentPassword}
                  onValueChange={setCurrentPassword}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu hiện tại"
                  clearAriaLabel="Xóa mật khẩu hiện tại"
                />
              </label>
              <label>
                Mật khẩu mới *
                <PasswordInput
                  value={newPassword}
                  onValueChange={setNewPassword}
                  autoComplete="new-password"
                  placeholder="Tối thiểu 12 ký tự"
                  clearAriaLabel="Xóa mật khẩu mới"
                />
              </label>
            </div>
            <label>
              Xác nhận mật khẩu mới *
              <PasswordInput
                value={confirmNewPassword}
                onValueChange={setConfirmNewPassword}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                clearAriaLabel="Xóa xác nhận mật khẩu mới"
              />
            </label>
            {passwordTooShort && <p className="field-error-note">Mật khẩu mới cần tối thiểu 12 ký tự.</p>}
            {passwordMismatch && <p className="field-error-note">Mật khẩu xác nhận chưa khớp với mật khẩu mới.</p>}
            <button
              type="submit"
              className="auth-secondary"
              disabled={busy || !currentPassword || newPassword.length < 12 || newPassword !== confirmNewPassword}
            >
              Cập nhật mật khẩu
            </button>
          </form>

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
                        <button type="button" title="Phê duyệt" onClick={() => action(item.id, 'approve')}>
                          <Check size={15} />
                        </button>
                      )}
                      {item.status === 'APPROVED' ? (
                        <button type="button" title="Khóa tài khoản" onClick={() => action(item.id, 'disable')}>
                          <Ban size={15} />
                        </button>
                      ) : (
                        item.status !== 'PENDING_APPROVAL' && (
                          <button type="button" title="Mở khóa / duyệt" onClick={() => action(item.id, 'enable')}>
                            <Check size={15} />
                          </button>
                        )
                      )}
                      {user.role === 'SUPER_ADMIN' && (
                        <button
                          type="button"
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
                          type="button"
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
                  <PasswordInput
                    value={resetPassValue}
                    onValueChange={setResetPassValue}
                    autoComplete="new-password"
                    placeholder="Mật khẩu mới tối thiểu 12 ký tự"
                    clearAriaLabel="Xóa mật khẩu đặt lại"
                  />
                  <div className="inline-confirm-actions">
                    <button
                      type="button"
                      className="auth-secondary"
                      disabled={busy || resetPassValue.length < 12}
                      onClick={() => action(resetTarget.id, 'reset-password', { newPassword: resetPassValue })}
                    >
                      Xác nhận đặt lại
                    </button>
                    <button type="button" className="auth-secondary" onClick={() => setResetTarget(null)}>
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
                    <button type="button" className="auth-logout" onClick={() => action(deleteTarget.id, 'delete')}>
                      Xác nhận xóa
                    </button>
                    <button type="button" className="auth-secondary" onClick={() => setDeleteTarget(null)}>
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button type="button" className="auth-logout" disabled={busy} onClick={logout}>
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
