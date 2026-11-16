import { useState } from 'react';
import { ChevronDown, KeyRound, ShieldCheck, User as UserIcon } from 'lucide-react';
import PasswordInput from './PasswordInput';
import { api, formatDate, roleLabel, statusLabel } from '../lib/api';
import type { User, UserQuota, UserUsage } from '../types';

interface Props {
  user: User;
  quota: UserQuota | null;
  usage: UserUsage | null;
  onUserUpdated: (user: User) => void;
  onLogout?: () => Promise<void> | void;
}

export default function ProfilePage({ user, quota, usage, onUserUpdated }: Props) {
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone || '');
  const [purpose, setPurpose] = useState(user.purpose || '');
  const [passwordSectionOpen, setPasswordSectionOpen] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia('(max-width: 680px)').matches
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 12;
  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const saveProfile = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api<{ user: User; message: string }>('/api/auth/profile', 'PATCH', {
        fullName,
        phone,
        purpose,
      });
      onUserUpdated(res.user);
      setMessage(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không cập nhật được thông tin.');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < 12) {
      setError('Mật khẩu mới phải có ít nhất 12 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới và xác nhận mật khẩu chưa khớp.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api<{ message: string }>('/api/auth/change-password', 'POST', {
        currentPassword,
        newPassword,
        confirmNewPassword: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đổi được mật khẩu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <span className="eyebrow">THÔNG TIN TÀI KHOẢN</span>
          <h1>Hồ sơ, hạn mức & bảo mật</h1>
          <p>Quản lý thông tin cá nhân, kiểm tra hạn mức sử dụng và cập nhật mật khẩu đăng nhập.</p>
        </div>

      </div>

      {(error || message) && <div className={error ? 'banner-alert error' : 'banner-alert'}>{error || message}</div>}

      <div className="profile-grid">
        <section className="panel-card">
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

          <div className="profile-meta-list">
            <div>
              <small>Ngày đăng ký</small>
              <strong>{formatDate(user.createdAt)}</strong>
            </div>
            <div>
              <small>Lần đăng nhập cuối</small>
              <strong>{formatDate(user.lastLoginAt)}</strong>
            </div>
          </div>

          <h3>
            <UserIcon size={17} /> Cập nhật thông tin
          </h3>
          <form
            onSubmit={e => {
              e.preventDefault();
              saveProfile();
            }}
          >
            <label className="field-label">
              Họ và tên
              <input value={fullName} onChange={e => setFullName(e.target.value)} required />
            </label>
            <div className="form-grid-2">
              <label className="field-label">
                Email (cố định)
                <input value={user.email} disabled />
              </label>
              <label className="field-label">
                Tên đăng nhập
                <input value={user.username || (user.role === 'SUPER_ADMIN' ? 'Đăng nhập bằng email' : 'Chưa đặt')} disabled />
              </label>
            </div>
            <label className="field-label">
              Số điện thoại
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Không bắt buộc" />
            </label>
            <label className="field-label">
              Mục đích sử dụng
              <textarea rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} />
            </label>
            <button type="submit" className="primary-btn" disabled={busy || fullName.trim().length < 2}>
              Lưu thông tin cá nhân
            </button>
          </form>
        </section>

        <div className="profile-right-col">
          {user.role !== 'SUPER_ADMIN' && (
            <section className="panel-card">
              <h3>
                <ShieldCheck size={17} /> Hạn mức tài khoản
              </h3>
              {quota ? (
                <div className="quota-grid">
                  <div className="quota-stat">
                    <small>Video hôm nay</small>
                    <strong>
                      {usage?.dailyUsed ?? 0} / {quota.daily_video_limit}
                    </strong>
                  </div>
                  <div className="quota-stat">
                    <small>Video trong tháng</small>
                    <strong>
                      {usage?.monthlyUsed ?? 0} / {quota.monthly_video_limit}
                    </strong>
                  </div>
                  <div className="quota-stat">
                    <small>Thời lượng tối đa</small>
                    <strong>{quota.max_duration_sec} giây</strong>
                  </div>
                  <div className="quota-stat">
                    <small>Ảnh / sản phẩm</small>
                    <strong>{quota.max_images_per_product} ảnh</strong>
                  </div>
                </div>
              ) : (
                <p className="muted-copy">Đang tải hạn mức...</p>
              )}
            </section>
          )}

          <section className="panel-card" id="change-password">
            <button
              type="button"
              className="profile-password-toggle"
              aria-expanded={passwordSectionOpen}
              aria-controls="profile-password-content"
              onClick={() => setPasswordSectionOpen(open => !open)}
            >
              <span><KeyRound size={17} /> Đổi mật khẩu</span>
              <ChevronDown size={18} className={passwordSectionOpen ? 'chevron-rotated' : ''} />
            </button>
            {passwordSectionOpen && (
              <div id="profile-password-content" className="profile-password-content">
                <p className="muted-copy">Bắt buộc nhập đúng mật khẩu hiện tại để xác thực ở máy chủ trước khi cập nhật.</p>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    changePassword();
                  }}
                >
                  <label className="field-label">
                    Mật khẩu hiện tại *
                    <PasswordInput
                      value={currentPassword}
                      onValueChange={setCurrentPassword}
                      autoComplete="current-password"
                      placeholder="Nhập mật khẩu hiện tại"
                      clearAriaLabel="Xóa mật khẩu hiện tại"
                    />
                  </label>
                  <label className="field-label">
                    Mật khẩu mới *
                    <PasswordInput
                      value={newPassword}
                      onValueChange={setNewPassword}
                      autoComplete="new-password"
                      placeholder="Tối thiểu 12 ký tự"
                      clearAriaLabel="Xóa mật khẩu mới"
                    />
                  </label>
                  <label className="field-label">
                    Xác nhận mật khẩu mới *
                    <PasswordInput
                      value={confirmPassword}
                      onValueChange={setConfirmPassword}
                      autoComplete="new-password"
                      placeholder="Nhập lại mật khẩu mới"
                      clearAriaLabel="Xóa xác nhận mật khẩu mới"
                    />
                  </label>
                  {passwordTooShort && <p className="field-error-note">Mật khẩu mới cần tối thiểu 12 ký tự.</p>}
                  {passwordMismatch && <p className="field-error-note">Mật khẩu xác nhận chưa khớp với mật khẩu mới.</p>}
                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={busy || !currentPassword || newPassword.length < 12 || newPassword !== confirmPassword}
                  >
                    Xác nhận đổi mật khẩu
                  </button>
                </form>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
