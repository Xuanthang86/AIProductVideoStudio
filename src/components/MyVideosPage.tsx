import { useEffect, useState } from 'react';
import { Copy, Download, Edit3, Film, Plus, Search, Trash2 } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { api, formatBytes, formatDate, projectStatusLabel } from '../lib/api';
import type { VideoProject } from '../types';

interface Props {
  onEditProject: (projectId: string) => void;
  onNewVideo: () => void;
}

export default function MyVideosPage({ onEditProject, onNewVideo }: Props) {
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VideoProject | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (statusFilter) params.set('status', statusFilter);
      const res = await api<{ projects: VideoProject[] }>(`/api/projects?${params.toString()}`);
      setProjects(res.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách video.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const duplicate = async (id: string) => {
    try {
      await api(`/api/projects/${id}/duplicate`, 'POST', {});
      setMessage('Đã tạo bản sao dự án.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể nhân bản.');
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/projects/${id}`, 'DELETE');
      setMessage('Đã xóa dự án video.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể xóa dự án.');
    }
  };

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <span className="eyebrow">QUẢN LÝ VIDEO</span>
          <h1>Video & Dự án của tôi</h1>
          <p>Theo dõi trạng thái xử lý, mở lại trình chỉnh sửa, nhân bản dự án hoặc xuất lại MP4.</p>
        </div>
        <button className="primary-btn" onClick={onNewVideo}>
          <Plus size={16} /> Tạo video mới
        </button>
      </div>

      {(error || message) && <div className={error ? 'banner-alert error' : 'banner-alert'}>{error || message}</div>}

      <div className="filter-bar panel-card">
        <div className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Tìm theo tiêu đề, tên sản phẩm, ngành hàng..."
          />
          <button className="secondary-btn" onClick={load}>
            Tìm
          </button>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="DRAFT">Bản nháp</option>
          <option value="PENDING">Chờ xử lý</option>
          <option value="PROCESSING">Đang xử lý</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="FAILED">Thất bại</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
      </div>

      {loading ? (
        <div className="panel-card">Đang tải danh sách dự án...</div>
      ) : projects.length === 0 ? (
        <div className="panel-card empty-box">
          <Film size={32} />
          <p>Chưa có dự án video nào phù hợp.</p>
          <button className="primary-btn" onClick={onNewVideo}>
            Mở Video Studio
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map(p => (
            <article key={p.id} className="panel-card project-card">
              <div className="project-card-top">
                <span className={`status-pill status-${p.status.toLowerCase()}`}>
                  {projectStatusLabel[p.status] || p.status}
                </span>
                <span className="pill-badge">{p.aspectRatio} · {p.durationSec}s</span>
              </div>
              <h3>{p.title}</h3>
              <p className="muted-copy">
                {p.videoType} · {p.industry}
                {p.productName ? ` · SP: ${p.productName}` : ''}
              </p>
              {p.status === 'COMPLETED' && p.outputSizeBytes ? (
                <small className="output-meta">
                  Xuất {p.outputFormat?.toUpperCase()} ({p.outputResolution}) · {formatBytes(p.outputSizeBytes)}
                </small>
              ) : p.errorMessage ? (
                <small className="error-meta">{p.errorMessage}</small>
              ) : null}
              {p.outputFileUrl && p.status === 'COMPLETED' && (
                <a className="secondary-btn" href={p.outputFileUrl} target="_blank" rel="noreferrer" download>
                  <Download size={14} /> Tải video đã lưu
                </a>
              )}
              <small className="muted-copy">Cập nhật: {formatDate(p.updatedAt)}</small>
              <div className="project-card-actions">
                <button className="primary-btn" onClick={() => onEditProject(p.id)}>
                  <Edit3 size={14} /> Mở trong Studio
                </button>
                <button className="secondary-btn" title="Nhân bản" onClick={() => duplicate(p.id)}>
                  <Copy size={14} />
                </button>
                <button className="secondary-btn danger-outline" title="Xóa" onClick={() => setDeleteTarget(p)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {deleteTarget && (
        <ConfirmDialog title="Xóa dự án video?"
          message={`Bạn có chắc chắn muốn xóa dự án “${deleteTarget.title}” không? Các phân cảnh và bản duyệt liên quan cũng sẽ bị xóa.`}
          confirmLabel="Xóa dự án"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { const id = deleteTarget.id; setDeleteTarget(null); void remove(id); }}
        />
      )}
    </div>
  );
}
