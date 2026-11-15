import { useState } from 'react';
import { KeyRound, ShieldCheck, User as UserIcon } from 'lucide-react';
import { api, formatDate, roleLabel, statusLabel } from '../lib/api';
import type { User, UserQuota, UserUsage } from '../types';

interface Props {
  user: User;
  quota: UserQuota | null;
  usage: UserUsage | null;
  onUserUpdated: (user: User) => void;
}

export default function ProfilePage({ user, quota, usage, onUserUpdated }: Props) {
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone || '');
  const [purpose, setPurpose] = useState(user.purpose || '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
          <p>Quản lý thông tin cá nhân, kiểm tra hạn mức sử dụng và đổi mật khẩu tài khoản.</p>
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
            <UserIcon size={16} /> Cập nhật thông tin
          </h3>
          <label className="field-label">
            Họ và tên
            <input value={fullName} onChange={e => setFullName(e.target.value)} />
          </label>
          <div className="form-grid-2">
            <label className="field-label">
              Email (cố định)
              <input value={user.email} disabled />
            </label>
            <label className="field-label">
              Tên đăng nhập
              <input value={user.username || 'Chưa đặt'} disabled />
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
          <button className="primary-btn" disabled={busy || fullName.trim().length < 2} onClick={saveProfile}>
            Lưu thông tin cá nhân
          </button>
        </section>

        <div className="profile-right-col">
          <section className="panel-card">
            <h3>
              <ShieldCheck size={16} /> Hạn mức tài khoản
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

          <section className="panel-card">
            <h3>
              <KeyRound size={16} /> Đổi mật khẩu
            </h3>
            <p className="muted-copy">Bắt buộc nhập đúng mật khẩu hiện tại để xác thực ở máy chủ trước khi cập nhật.</p>
            <label className="field-label">
              Mật khẩu hiện tại *
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label className="field-label">
              Mật khẩu mới *
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Tối thiểu 12 ký tự"
              />
            </label>
            <label className="field-label">
              Xác nhận mật khẩu mới *
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button
              className="primary-btn"
              disabled={busy || !currentPassword || newPassword.length < 12 || newPassword !== confirmPassword}
              onClick={changePassword}
            >
              Xác nhận đổi mật khẩu
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
