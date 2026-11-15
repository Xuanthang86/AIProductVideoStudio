import { useMemo, useState } from 'react';
import { ArrowRight, Clock, Film, MonitorPlay } from 'lucide-react';
import type { Industry, VideoTemplate } from '../types';

interface Props {
  templates: VideoTemplate[];
  industries: Industry[];
  onUseTemplate: (template: VideoTemplate) => void;
}

export default function TemplatesPage({ templates, industries, onUseTemplate }: Props) {
  const [industryFilter, setIndustryFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const videoTypes = useMemo(() => {
    return Array.from(new Set(templates.map(t => t.videoType)));
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter(t => {
      if (industryFilter !== 'ALL' && t.industry !== industryFilter) return false;
      if (typeFilter !== 'ALL' && t.videoType !== typeFilter) return false;
      return true;
    });
  }, [templates, industryFilter, typeFilter]);

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <span className="eyebrow">THƯ VIỆN CHỦ ĐỀ VIDEO</span>
          <h1>Mẫu video đa ngành hàng</h1>
          <p>Hỗ trợ 12 phong cách truyền thông cho nhiều ngành hàng từ mỹ phẩm, thời trang, điện tử đến bất động sản.</p>
        </div>
      </div>

      <div className="filter-bar panel-card">
        <label className="filter-control">
          Ngành hàng
          <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}>
            <option value="ALL">Tất cả ngành hàng ({industries.length})</option>
            {industries.map(ind => (
              <option key={ind.id} value={ind.name}>
                {ind.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-control">
          Chủ đề video
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="ALL">Tất cả chủ đề ({videoTypes.length})</option>
            {videoTypes.map(vt => (
              <option key={vt} value={vt}>
                {vt}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="templates-grid">
        {filtered.map(tpl => (
          <article key={tpl.id} className="template-card">
            <div className="template-preview" style={{ background: `linear-gradient(135deg, ${tpl.previewAccent}, #101d36)` }}>
              <span className="template-type-badge">{tpl.videoType}</span>
              <div className="template-preview-center">
                <Film size={28} />
                <strong>{tpl.name}</strong>
              </div>
              <span className="template-industry-chip">{tpl.industry}</span>
            </div>
            <div className="template-body">
              <h3>{tpl.name}</h3>
              <p>{tpl.description}</p>
              {tpl.styleNotes && <small className="muted-copy">{tpl.styleNotes}</small>}
              <div className="template-specs">
                <span>
                  <Clock size={13} /> {tpl.suggestedDuration}s
                </span>
                <span>
                  <MonitorPlay size={13} /> {tpl.supportedRatios.join(' · ')}
                </span>
              </div>
              <button className="primary-btn full-width" onClick={() => onUseTemplate(tpl)}>
                Dùng mẫu này trong Studio <ArrowRight size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
