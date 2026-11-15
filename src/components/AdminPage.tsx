import { useEffect, useState } from 'react';
import {
  Activity,
  Ban,
  BarChart3,
  Check,
  Cpu,
  Database,
  Download,
  Film,
  KeyRound,
  LayoutTemplate,
  Lock,
  Package,
  Plus,
  Settings,
  Sliders,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import PasswordInput from './PasswordInput';
import { api, formatDate, projectStatusLabel, roleLabel, statusLabel } from '../lib/api';
import type { AICapabilityModule, Industry, User, VideoTemplate, VideoTopic } from '../types';

interface Props {
  actor: User;
  topics: VideoTopic[];
  onRefreshCatalog: () => void;
}

interface AdminUserRow extends User {
  quota: {
    dailyVideoLimit: number;
    monthlyVideoLimit: number;
    maxDurationSec: number;
    maxImagesPerProduct: number;
    canUseAiVideo: boolean;
    canUseVoice: boolean;
    canUseAdvancedModels: boolean;
  };
}

interface DashboardStats {
  totalUsers: number;
  pendingUsers: number;
  activeUsers: number;
  lockedUsers: number;
  totalProducts: number;
  totalVideos: number;
  completedVideos: number;
  failedVideos: number;
  dailyVideos: number;
  weeklyVideos: number;
  monthlyVideos: number;
}

type TabKey = 'dashboard' | 'users' | 'products' | 'videos' | 'catalog' | 'ai' | 'logs' | 'system';

export default function AdminPage({ actor, topics, onRefreshCatalog }: Props) {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [aiUsage, setAiUsage] = useState<Array<{ module_key: string; calls: number; tokens: number; cost: number }>>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([]);
  const [projects, setProjects] = useState<Array<Record<string, unknown>>>([]);
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [aiModules, setAiModules] = useState<AICapabilityModule[]>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  // Inline modals state (no window.prompt / window.confirm)
  const [quotaTarget, setQuotaTarget] = useState<AdminUserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [resetPass, setResetPass] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);

  // Catalog form
  const [newTplName, setNewTplName] = useState('');
  const [newTplType, setNewTplType] = useState('Advertisement');
  const [newTplIndustry, setNewTplIndustry] = useState('Mỹ phẩm');
  const [newTplDesc, setNewTplDesc] = useState('');
  const [newIndName, setNewIndName] = useState('');
  const [newTopicName, setNewTopicName] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const isSuperAdmin = actor.role === 'SUPER_ADMIN';

  const loadTab = async (activeTab: TabKey) => {
    setError('');
    try {
      if (activeTab === 'dashboard') {
        const res = await api<{ stats: DashboardStats; aiUsage: typeof aiUsage }>('/api/admin/dashboard');
        setStats(res.stats);
        setAiUsage(res.aiUsage);
      } else if (activeTab === 'users') {
        const res = await api<{ users: AdminUserRow[] }>('/api/admin/users');
        setUsers(res.users);
      } else if (activeTab === 'products') {
        const res = await api<{ products: Array<Record<string, unknown>> }>('/api/admin/products');
        setProducts(res.products);
      } else if (activeTab === 'videos') {
        const res = await api<{ projects: Array<Record<string, unknown>> }>('/api/admin/projects');
        setProjects(res.projects);
      } else if (activeTab === 'catalog') {
        const [tRes, iRes] = await Promise.all([
          api<{ templates: VideoTemplate[] }>('/api/templates'),
          api<{ industries: Industry[] }>('/api/industries'),
        ]);
        setTemplates(tRes.templates);
        setIndustries(iRes.industries);
      } else if (activeTab === 'ai') {
        const res = await api<{ modules: AICapabilityModule[] }>('/api/ai/capabilities');
        setAiModules(res.modules);
      } else if (activeTab === 'logs') {
        const res = await api<{ logs: Array<Record<string, unknown>> }>('/api/admin/audit-logs');
        setLogs(res.logs);
      } else if (activeTab === 'system') {
        const res = await api<{ settings: Record<string, unknown> }>('/api/admin/settings');
        setSettings(res.settings);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu quản trị.');
    }
  };

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  const canManage = (target: AdminUserRow) =>
    isSuperAdmin || (actor.role === 'ADMIN' && ['EDITOR', 'USER'].includes(target.role));

  const userAction = async (id: string, verb: string, payload?: unknown) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/admin/users/${id}/${verb}`, 'POST', payload || {});
      setResetTarget(null);
      setResetPass('');
      setDeleteTarget(null);
      setQuotaTarget(null);
      setMessage('Đã thực hiện thao tác quản trị tài khoản.');
      await loadTab('users');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thao tác thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAiModule = async (mod: AICapabilityModule, patch: Partial<AICapabilityModule>) => {
    if (!isSuperAdmin) {
      setError('Chỉ Super Admin mới có quyền thay đổi cấu hình công cụ AI.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/ai-configs/${mod.moduleKey}`, 'PUT', {
        isEnabled: patch.isEnabled ?? mod.isEnabled,
        isPaid: patch.isPaid ?? mod.isPaid,
        modelName: patch.modelName ?? mod.modelName,
        fallbackMode: patch.fallbackMode ?? mod.fallbackMode,
        dailyLimit: patch.dailyLimit ?? mod.dailyLimit,
        monthlyLimit: patch.monthlyLimit ?? mod.monthlyLimit,
      });
      setMessage(`Đã cập nhật cấu hình ${mod.displayName}.`);
      await loadTab('ai');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể cập nhật AI.');
    } finally {
      setBusy(false);
    }
  };

  const createTemplate = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/templates', 'POST', {
        name: newTplName,
        videoType: newTplType,
        industry: newTplIndustry,
        description: newTplDesc,
      });
      setNewTplName('');
      setNewTplDesc('');
      setMessage('Đã thêm mẫu video.');
      await loadTab('catalog');
      onRefreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể thêm mẫu.');
    } finally {
      setBusy(false);
    }
  };

  const toggleTemplateActive = async (tpl: VideoTemplate) => {
    setBusy(true);
    try {
      await api(`/api/admin/templates/${tpl.id}`, 'PUT', { isActive: !tpl.isActive });
      await loadTab('catalog');
      onRefreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi cập nhật mẫu.');
    } finally {
      setBusy(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/admin/templates/${id}`, 'DELETE');
      await loadTab('catalog');
      onRefreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi xóa mẫu.');
    } finally {
      setBusy(false);
    }
  };

  const createIndustry = async () => {
    if (!newIndName.trim()) return;
    setBusy(true);
    try {
      await api('/api/admin/industries', 'POST', { name: newIndName });
      setNewIndName('');
      await loadTab('catalog');
      onRefreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi thêm ngành hàng.');
    } finally {
      setBusy(false);
    }
  };

  const createTopic = async () => {
    const name = newTopicName.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/api/admin/topics', 'POST', { name });
      setNewTopicName('');
      setMessage('Đã thêm chủ đề video.');
      await onRefreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi thêm chủ đề video.');
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async () => {
    setError('');
    try {
      const data = await api('/api/admin/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aivideo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Đã tải bản sao lưu dữ liệu JSON.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể sao lưu.');
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api('/api/admin/settings', 'PUT', settings);
      setMessage('Đã lưu cấu hình hệ thống.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi lưu cấu hình.');
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: JSX.Element }> = [
    { key: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={16} /> },
    { key: 'users', label: 'Người dùng', icon: <Users size={16} /> },
    { key: 'products', label: 'Sản phẩm', icon: <Package size={16} /> },
    { key: 'videos', label: 'Video & Tác vụ', icon: <Film size={16} /> },
    { key: 'catalog', label: 'Mẫu & Ngành hàng', icon: <LayoutTemplate size={16} /> },
    { key: 'ai', label: 'Công cụ AI', icon: <Cpu size={16} /> },
    { key: 'logs', label: 'Nhật ký', icon: <Activity size={16} /> },
    { key: 'system', label: 'Sao lưu & Cấu hình', icon: <Settings size={16} /> },
  ];

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <span className="eyebrow">HỆ THỐNG QUẢN TRỊ</span>
          <h1>Bảng điều khiển quản trị viên</h1>
          <p>
            Đăng nhập với vai trò <b>{roleLabel[actor.role]}</b>. Tài khoản Super Admin được bảo vệ tuyệt đối ở máy chủ và cơ sở dữ liệu.
          </p>
        </div>
      </div>

      {(error || message) && <div className={error ? 'banner-alert error' : 'banner-alert'}>{error || message}</div>}

      <div className="admin-shell">
        <aside className="admin-sidebar panel-card">
          {tabs.map(t => (
            <button key={t.key} className={tab === t.key ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab(t.key)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </aside>

        <div className="admin-content">
          {tab === 'dashboard' && stats && (
            <>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <small>Tổng người dùng</small>
                  <strong>{stats.totalUsers}</strong>
                  <span>
                    Chờ duyệt: {stats.pendingUsers} · Hoạt động: {stats.activeUsers} · Khóa: {stats.lockedUsers}
                  </span>
                </div>
                <div className="kpi-card">
                  <small>Tổng sản phẩm</small>
                  <strong>{stats.totalProducts}</strong>
                  <span>Sản phẩm lưu trữ trong hệ thống</span>
                </div>
                <div className="kpi-card">
                  <small>Tổng dự án video</small>
                  <strong>{stats.totalVideos}</strong>
                  <span>
                    Hoàn thành: {stats.completedVideos} · Thất bại: {stats.failedVideos}
                  </span>
                </div>
                <div className="kpi-card">
                  <small>Lượt tạo video</small>
                  <strong>{stats.monthlyVideos}</strong>
                  <span>
                    Hôm nay: {stats.dailyVideos} · 7 ngày: {stats.weeklyVideos} · Tháng: {stats.monthlyVideos}
                  </span>
                </div>
              </div>

              <section className="panel-card">
                <h3>Thống kê sử dụng công cụ AI (dữ liệu thực tế)</h3>
                {aiUsage.length === 0 ? (
                  <p className="muted-copy">Chưa có lượt gọi AI nào được ghi nhận.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Module</th>
                          <th>Số lượt gọi</th>
                          <th>Tokens / Ký tự</th>
                          <th>Chi phí ước tính ($)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiUsage.map(row => (
                          <tr key={row.module_key}>
                            <td>{row.module_key}</td>
                            <td>{row.calls}</td>
                            <td>{row.tokens}</td>
                            <td>${Number(row.cost || 0).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'users' && (
            <section className="panel-card">
              <div className="panel-card-head">
                <h3>Quản lý tài khoản & phê duyệt ({users.length})</h3>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Người dùng</th>
                      <th>Vai trò</th>
                      <th>Trạng thái</th>
                      <th>Hạn mức</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.fullName}</strong>
                          <div className="muted-copy">{u.email}{u.username ? ` · @${u.username}` : ''}</div>
                          {u.purpose && <div className="muted-copy">Mục đích: {u.purpose}</div>}
                        </td>
                        <td>
                          {u.role === 'SUPER_ADMIN' ? (
                            <span className="role-protected-tag">
                              <Lock size={13} /> Super Admin (Bảo vệ)
                            </span>
                          ) : canManage(u) ? (
                            <select value={u.role} onChange={e => userAction(u.id, 'role', { role: e.target.value })}>
                              {(isSuperAdmin ? ['ADMIN', 'EDITOR', 'USER'] : ['EDITOR', 'USER']).map(r => (
                                <option key={r} value={r}>
                                  {roleLabel[r]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            roleLabel[u.role]
                          )}
                        </td>
                        <td>
                          <span className={`status-pill status-${u.status.toLowerCase()}`}>
                            {statusLabel[u.status] || u.status}
                          </span>
                        </td>
                        <td>
                          <small>
                            {u.quota.dailyVideoLimit}/ngày · {u.quota.monthlyVideoLimit}/tháng · {u.quota.maxDurationSec}s
                          </small>
                        </td>
                        <td>
                          {u.role === 'SUPER_ADMIN' ? (
                            <span className="muted-copy">Không thể tác động</span>
                          ) : canManage(u) ? (
                            <div className="admin-row-btns">
                              {u.status === 'PENDING_APPROVAL' && (
                                <>
                                  <button title="Phê duyệt" onClick={() => userAction(u.id, 'approve')}>
                                    <Check size={14} />
                                  </button>
                                  <button title="Từ chối" onClick={() => userAction(u.id, 'reject')}>
                                    <X size={14} />
                                  </button>
                                </>
                              )}
                              {u.status === 'APPROVED' ? (
                                <button title="Khóa tài khoản" onClick={() => userAction(u.id, 'disable')}>
                                  <Ban size={14} />
                                </button>
                              ) : (
                                u.status !== 'PENDING_APPROVAL' && (
                                  <button title="Mở khóa / Kích hoạt" onClick={() => userAction(u.id, 'enable')}>
                                    <Check size={14} />
                                  </button>
                                )
                              )}
                              <button title="Điều chỉnh hạn mức" onClick={() => setQuotaTarget(u)}>
                                <Sliders size={14} />
                              </button>
                              {isSuperAdmin && (
                                <>
                                  <button
                                    title="Đặt lại mật khẩu"
                                    onClick={() => {
                                      setResetTarget(u);
                                      setResetPass('');
                                    }}
                                  >
                                    <KeyRound size={14} />
                                  </button>
                                  <button title="Xóa tài khoản" onClick={() => setDeleteTarget(u)}>
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="muted-copy">Ngoài phạm vi</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {quotaTarget && (
                <div className="inline-confirm-box">
                  <h4>Điều chỉnh hạn mức cho {quotaTarget.email}</h4>
                  <div className="form-grid-4">
                    <label className="field-label">
                      Video/ngày
                      <input
                        type="number"
                        value={quotaTarget.quota.dailyVideoLimit}
                        onChange={e =>
                          setQuotaTarget({
                            ...quotaTarget,
                            quota: { ...quotaTarget.quota, dailyVideoLimit: Number(e.target.value) || 1 },
                          })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Video/tháng
                      <input
                        type="number"
                        value={quotaTarget.quota.monthlyVideoLimit}
                        onChange={e =>
                          setQuotaTarget({
                            ...quotaTarget,
                            quota: { ...quotaTarget.quota, monthlyVideoLimit: Number(e.target.value) || 1 },
                          })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Thời lượng tối đa (s)
                      <input
                        type="number"
                        value={quotaTarget.quota.maxDurationSec}
                        onChange={e =>
                          setQuotaTarget({
                            ...quotaTarget,
                            quota: { ...quotaTarget.quota, maxDurationSec: Number(e.target.value) || 30 },
                          })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Ảnh/sản phẩm
                      <input
                        type="number"
                        value={quotaTarget.quota.maxImagesPerProduct}
                        onChange={e =>
                          setQuotaTarget({
                            ...quotaTarget,
                            quota: { ...quotaTarget.quota, maxImagesPerProduct: Number(e.target.value) || 10 },
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="inline-confirm-actions">
                    <button
                      className="primary-btn"
                      disabled={busy}
                      onClick={() => userAction(quotaTarget.id, 'quota', quotaTarget.quota)}
                    >
                      Lưu hạn mức
                    </button>
                    <button className="secondary-btn" onClick={() => setQuotaTarget(null)}>
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {resetTarget && (
                <div className="inline-confirm-box">
                  <p>
                    Đặt lại mật khẩu mới cho <b>{resetTarget.email}</b> (thao tác Super Admin, sẽ đăng xuất mọi phiên hiện tại):
                  </p>
                  <PasswordInput
                    value={resetPass}
                    onValueChange={setResetPass}
                    autoComplete="new-password"
                    placeholder="Nhập mật khẩu mới tối thiểu 12 ký tự"
                    clearAriaLabel="Xóa mật khẩu đặt lại"
                  />
                  <div className="inline-confirm-actions">
                    <button
                      className="primary-btn"
                      disabled={busy || resetPass.length < 12}
                      onClick={() => userAction(resetTarget.id, 'reset-password', { newPassword: resetPass })}
                    >
                      Xác nhận đặt lại
                    </button>
                    <button className="secondary-btn" onClick={() => setResetTarget(null)}>
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {deleteTarget && (
                <div className="inline-confirm-box danger">
                  <p>
                    Xác nhận xóa vĩnh viễn tài khoản <b>{deleteTarget.email}</b> cùng toàn bộ dữ liệu liên quan?
                  </p>
                  <div className="inline-confirm-actions">
                    <button className="auth-logout" onClick={() => userAction(deleteTarget.id, 'delete')}>
                      Xác nhận xóa
                    </button>
                    <button className="secondary-btn" onClick={() => setDeleteTarget(null)}>
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === 'products' && (
            <section className="panel-card">
              <h3>Quản lý sản phẩm toàn hệ thống ({products.length})</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Ngành hàng</th>
                      <th>Chủ sở hữu</th>
                      <th>Số ảnh</th>
                      <th>Cập nhật</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={String(p.id)}>
                        <td>
                          <strong>{String(p.name)}</strong>
                        </td>
                        <td>{String(p.industry)}</td>
                        <td>{String(p.owner_email)}</td>
                        <td>{String(p.image_count)}</td>
                        <td>{formatDate(String(p.updated_at))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'videos' && (
            <section className="panel-card">
              <h3>Quản lý dự án video ({projects.length})</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tiêu đề</th>
                      <th>Chủ sở hữu</th>
                      <th>Loại / Tỷ lệ</th>
                      <th>Trạng thái</th>
                      <th>Cập nhật</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(p => (
                      <tr key={String(p.id)}>
                        <td>
                          <strong>{String(p.title)}</strong>
                        </td>
                        <td>{String(p.owner_email)}</td>
                        <td>
                          {String(p.video_type)} · {String(p.aspect_ratio)} · {String(p.duration_sec)}s
                        </td>
                        <td>
                          <span className={`status-pill status-${String(p.status).toLowerCase()}`}>
                            {projectStatusLabel[String(p.status)] || String(p.status)}
                          </span>
                        </td>
                        <td>{formatDate(String(p.updated_at))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'catalog' && (
            <>
              <section className="panel-card">
                <h3>Thêm mẫu video mới</h3>
                <div className="form-grid-2">
                  <label className="field-label">
                    Tên mẫu
                    <input value={newTplName} onChange={e => setNewTplName(e.target.value)} placeholder="VD: Flash Sale TikTok" />
                  </label>
                  <label className="field-label">
                    Chủ đề video
                    <input value={newTplType} onChange={e => setNewTplType(e.target.value)} />
                  </label>
                  <label className="field-label">
                    Ngành hàng
                    <select value={newTplIndustry} onChange={e => setNewTplIndustry(e.target.value)}>
                      {industries.map(i => (
                        <option key={i.id} value={i.name}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Mô tả ngắn
                    <input value={newTplDesc} onChange={e => setNewTplDesc(e.target.value)} />
                  </label>
                </div>
                <button className="primary-btn" disabled={busy || !newTplName || !newTplDesc} onClick={createTemplate}>
                  <Plus size={15} /> Thêm mẫu video
                </button>
              </section>

              <section className="panel-card">
                <h3>Danh sách mẫu video ({templates.length})</h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tên mẫu</th>
                        <th>Chủ đề</th>
                        <th>Ngành hàng</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map(t => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.name}</strong>
                          </td>
                          <td>{t.videoType}</td>
                          <td>{t.industry}</td>
                          <td>{t.isActive ? 'Đang hiện' : 'Đang ẩn'}</td>
                          <td>
                            <div className="admin-row-btns">
                              <button className="secondary-btn" onClick={() => toggleTemplateActive(t)}>
                                {t.isActive ? 'Ẩn' : 'Hiện'}
                              </button>
                              <button title="Xóa" onClick={() => deleteTemplate(t.id)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel-card">
                <h3>Ngành hàng ({industries.length})</h3>
                <div className="search-box">
                  <input value={newIndName} onChange={e => setNewIndName(e.target.value)} placeholder="Tên ngành hàng mới..." />
                  <button className="primary-btn" disabled={busy || !newIndName.trim()} onClick={createIndustry}>
                    Thêm ngành
                  </button>
                </div>
              </section>

              <section className="panel-card">
                <h3>Chủ đề video ({topics.length})</h3>
                <p className="muted-copy">Danh mục chủ đề dùng chung trong Studio và bộ lọc thư viện mẫu video.</p>
                <div className="search-box">
                  <input
                    value={newTopicName}
                    onChange={e => setNewTopicName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createTopic(); }}
                    placeholder="Tên chủ đề video mới..."
                    maxLength={80}
                  />
                  <button className="primary-btn" disabled={busy || !newTopicName.trim()} onClick={createTopic}>
                    <Plus size={15} /> Thêm chủ đề
                  </button>
                </div>
                <div className="chip-list">
                  {topics.map(topic => <span className="pill-badge" key={topic.id}>{topic.name}</span>)}
                </div>
              </section>
            </>
          )}

          {tab === 'ai' && (
            <section className="panel-card">
              <h3>Quản lý công cụ AI & Hạn mức (Free-First)</h3>
              <p className="muted-copy">
                Các mô-đun hoạt động độc lập. Khóa API (GEMINI_API_KEY, IMAGEKIT_PRIVATE_KEY, KOKORO_TTS_URL) được quản lý an toàn trong biến môi trường máy chủ, không lưu trong giao diện.
              </p>
              <div className="ai-modules-grid">
                {aiModules.map(mod => (
                  <div key={mod.moduleKey} className="ai-module-card">
                    <div className="ai-module-head">
                      <div>
                        <strong>{mod.displayName}</strong>
                        <small>
                          {mod.provider} · {mod.modelName}
                        </small>
                      </div>
                      <label className="switch-inline">
                        <input
                          type="checkbox"
                          disabled={!isSuperAdmin || busy}
                          checked={mod.isEnabled}
                          onChange={e => toggleAiModule(mod, { isEnabled: e.target.checked })}
                        />
                        <span>{mod.isEnabled ? 'Bật' : 'Tắt'}</span>
                      </label>
                    </div>
                    <div className="ai-module-meta">
                      <span>Trạng thái cấu hình env: <b>{mod.runtimeReady ? 'Sẵn sàng' : 'Chưa gắn dịch vụ / Dùng phương án miễn phí'}</b></span>
                      <span>Phương án dự phòng: <b>{mod.fallbackMode}</b></span>
                      <span>Hạn mức: {mod.dailyLimit}/ngày · {mod.monthlyLimit}/tháng</span>
                      {mod.lastError && <span className="error-meta">Lỗi gần nhất: {mod.lastError}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === 'logs' && (
            <section className="panel-card">
              <h3>Nhật ký hoạt động & bảo mật ({logs.length})</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Hành động</th>
                      <th>Người thực hiện</th>
                      <th>Đối tượng</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={String(l.id)}>
                        <td>{formatDate(String(l.created_at))}</td>
                        <td>
                          <strong>{String(l.action)}</strong>
                        </td>
                        <td>{String(l.actor_email || 'Hệ thống')}</td>
                        <td>{String(l.target_email || '—')}</td>
                        <td>
                          <small>{String(l.details || '—')}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'system' && (
            <div className="profile-grid">
              <section className="panel-card">
                <h3>
                  <Database size={16} /> Sao lưu dữ liệu (Super Admin)
                </h3>
                <p className="muted-copy">
                  Xuất bản sao lưu JSON toàn bộ dữ liệu sản phẩm, dự án video, phân cảnh, mẫu và danh sách tài khoản (loại trừ mật khẩu băm và phiên đăng nhập).
                </p>
                <button className="primary-btn" disabled={!isSuperAdmin} onClick={downloadBackup}>
                  <Download size={15} /> Tải xuống bản sao lưu JSON
                </button>
              </section>

              <section className="panel-card">
                <h3>
                  <Settings size={16} /> Cấu hình hệ thống
                </h3>
                <label className="field-label">
                  Tên nền tảng
                  <input
                    value={String(settings.siteName || 'AI Product Video Studio')}
                    onChange={e => setSettings({ ...settings, siteName: e.target.value })}
                    disabled={!isSuperAdmin}
                  />
                </label>
                <label className="field-label">
                  Tên miền chính thức
                  <input
                    value={String(settings.domain || 'aivideo.xuanthang.io.vn')}
                    onChange={e => setSettings({ ...settings, domain: e.target.value })}
                    disabled={!isSuperAdmin}
                  />
                </label>
                <button className="primary-btn" disabled={!isSuperAdmin || busy} onClick={saveSettings}>
                  Lưu cấu hình
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
