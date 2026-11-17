import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Package,
  Plus,
  Sparkles,
  Star,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { api, formatBytes, readImageFile } from '../lib/api';
import ConfirmDialog from './ConfirmDialog';
import type { Industry, Product, UserQuota } from '../types';

interface Props {
  industries: Industry[];
  quota: UserQuota | null;
  onStartVideo: (productId: string) => void;
}

export default function ProductsPage({ industries, quota, onStartVideo }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'product' | 'image'; product: Product; imageId?: string } | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [industry, setIndustry] = useState('Mỹ phẩm');
  const [description, setDescription] = useState('');
  const [highlightsText, setHighlightsText] = useState('');
  const [extraInfo, setExtraInfo] = useState('');

  const selected = products.find(p => p.id === selectedId) || null;
  const maxImages = quota?.max_images_per_product || 10;

  const loadProducts = async (keepSelection?: string) => {
    setLoading(true);
    try {
      const res = await api<{ products: Product[] }>('/api/products');
      setProducts(res.products);
      const targetId = keepSelection || selectedId;
      if (targetId && res.products.some(p => p.id === targetId)) {
        setSelectedId(targetId);
      } else if (res.products.length > 0 && !editingId) {
        setSelectedId(res.products[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách sản phẩm.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setBrand('');
    setIndustry(industries[0]?.name || 'Mỹ phẩm');
    setDescription('');
    setHighlightsText('');
    setExtraInfo('');
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    setBrand(product.brand);
    setIndustry(product.industry);
    setDescription(product.description);
    setHighlightsText(product.highlights.join('\n'));
    setExtraInfo(product.extraInfo);
    setError('');
    setMessage('');
  };

  const saveProduct = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const highlights = highlightsText
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      if (editingId) {
        await api(`/api/products/${editingId}`, 'PUT', {
          name,
          brand,
          industry,
          description,
          highlights,
          extraInfo,
        });
        await loadProducts(editingId);
        setEditingId(null);
        setMessage('Đã cập nhật thông tin sản phẩm.');
      } else {
        const res = await api<{ product: Product }>('/api/products', 'POST', {
          name,
          brand,
          industry,
          description,
          highlights,
          extraInfo,
        });
        resetForm();
        await loadProducts(res.product.id);
        setSelectedId(res.product.id);
        setMessage('Đã tạo sản phẩm mới. Hãy tải lên 1–10 hình ảnh sản phẩm.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  const deleteProduct = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/products/${id}`, 'DELETE');
      if (selectedId === id) setSelectedId('');
      if (editingId === id) resetForm();
      await loadProducts();
      setMessage('Đã xóa sản phẩm.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFiles = async (product: Product, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const remaining = maxImages - product.images.length;
      if (remaining <= 0) {
        throw new Error(`Sản phẩm đã đạt tối đa ${maxImages} ảnh.`);
      }
      const list = Array.from(files).slice(0, remaining);
      for (const file of list) {
        const parsed = await readImageFile(file);
        await api(`/api/products/${product.id}/images`, 'POST', {
          fileName: file.name,
          mimeType: parsed.mimeType || file.type,
          base64: parsed.base64,
          width: parsed.width,
          height: parsed.height,
        });
      }
      await loadProducts(product.id);
      setMessage(`Đã tải lên ${list.length} hình ảnh sản phẩm.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải ảnh.');
    } finally {
      setBusy(false);
    }
  };

  const reorderImage = async (product: Product, index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= product.images.length) return;
    const ids = product.images.map(im => im.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIdx, 0, moved);
    setBusy(true);
    try {
      await api(`/api/products/${product.id}/images/reorder`, 'PATCH', { orderedIds: ids });
      await loadProducts(product.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đổi thứ tự ảnh.');
    } finally {
      setBusy(false);
    }
  };

  const setPrimaryImage = async (product: Product, imageId: string) => {
    setBusy(true);
    try {
      await api(`/api/products/${product.id}/images/reorder`, 'PATCH', {
        orderedIds: product.images.map(im => im.id),
        primaryId: imageId,
      });
      await loadProducts(product.id);
      setMessage('Đã đặt ảnh đại diện.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đặt ảnh đại diện.');
    } finally {
      setBusy(false);
    }
  };

  const deleteImage = async (product: Product, imageId: string) => {
    setBusy(true);
    try {
      await api(`/api/products/${product.id}/images/${imageId}`, 'DELETE');
      await loadProducts(product.id);
      setMessage('Đã xóa hình ảnh.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể xóa ảnh.');
    } finally {
      setBusy(false);
    }
  };

  const runAiAnalysis = async (product: Product) => {
    setAnalyzing(true);
    setError('');
    setMessage('');
    try {
      await api('/api/ai/analyze-product', 'POST', { productId: product.id });
      await loadProducts(product.id);
      setMessage('Đã hoàn tất phân tích sản phẩm.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể phân tích sản phẩm.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <span className="eyebrow">QUẢN LÝ SẢN PHẨM</span>
          <h1>Kho sản phẩm & Hình ảnh gốc</h1>
          <p>Tải 1–10 ảnh sản phẩm (JPG, PNG, WEBP tối đa 5MB), phân tích AI và tái sử dụng cho nhiều video.</p>
        </div>
        <button
          className="primary-btn"
          onClick={() => {
            resetForm();
            setSelectedId('');
          }}
        >
          <Plus size={16} /> Thêm sản phẩm mới
        </button>
      </div>

      {(error || message) && (
        <div className={error ? 'banner-alert error' : 'banner-alert'}>{error || message}</div>
      )}

      <div className="products-layout">
        <aside className="panel-card products-sidebar">
          <div className="panel-card-head">
            <strong>Sản phẩm đã lưu ({products.length})</strong>
          </div>
          {loading ? (
            <p className="muted-copy">Đang tải sản phẩm...</p>
          ) : products.length === 0 ? (
            <p className="muted-copy">Chưa có sản phẩm nào. Hãy tạo sản phẩm đầu tiên bên phải.</p>
          ) : (
            <div className="product-list">
              {products.map(p => {
                const thumb = p.images.find(im => im.isPrimary) || p.images[0];
                return (
                  <button
                    key={p.id}
                    className={selectedId === p.id && !editingId ? 'product-list-item active' : 'product-list-item'}
                    onClick={() => {
                      setEditingId(null);
                      setSelectedId(p.id);
                    }}
                  >
                    <div className="product-thumb-mini">
                      {thumb ? <img src={thumb.imageUrl} alt={p.name} /> : <Package size={18} />}
                    </div>
                    <div className="product-list-meta">
                      <strong>{p.name}</strong>
                      <small>
                        {p.industry} · {p.images.length} ảnh
                      </small>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div className="products-main">
          {!selected || editingId ? (
            <section className="panel-card">
              <div className="panel-card-head">
                <h2>{editingId ? 'Chỉnh sửa thông tin sản phẩm' : 'Tạo sản phẩm mới'}</h2>
                {editingId && (
                  <button className="secondary-btn" onClick={() => setEditingId(null)}>
                    Hủy chỉnh sửa
                  </button>
                )}
              </div>

              <div className="form-grid-2">
                <label className="field-label">
                  Tên sản phẩm *
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Serum Vitamin C Dưỡng Sáng" />
                </label>
                <label className="field-label">
                  Thương hiệu
                  <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="VD: Pure Essence" />
                </label>
              </div>

              <label className="field-label">
                Ngành hàng *
                <select value={industry} onChange={e => setIndustry(e.target.value)}>
                  {(industries.length > 0
                    ? industries
                    : [
                        { id: '1', name: 'Mỹ phẩm' },
                        { id: '2', name: 'Thời trang' },
                        { id: '3', name: 'Điện tử' },
                        { id: '4', name: 'Đồ gia dụng' },
                      ]
                  ).map(ind => (
                    <option key={ind.id} value={ind.name}>
                      {ind.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                Mô tả sản phẩm
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Mô tả công dụng, chất liệu, đối tượng phù hợp từ thông tin thực tế..."
                />
              </label>

              <label className="field-label">
                Đặc điểm nổi bật (mỗi dòng một ý)
                <textarea
                  rows={3}
                  value={highlightsText}
                  onChange={e => setHighlightsText(e.target.value)}
                  placeholder={'Kết cấu mỏng nhẹ thấm nhanh\nPhù hợp da nhạy cảm\nDung tích 30ml nhỏ gọn'}
                />
              </label>

              <label className="field-label">
                Thông tin bổ sung (xuất xứ, hướng dẫn bảo quản, ưu đãi...)
                <input value={extraInfo} onChange={e => setExtraInfo(e.target.value)} placeholder="Thông tin xác thực từ nhà cung cấp" />
              </label>

              <div className="form-actions-row">
                <button className="primary-btn" disabled={busy || name.trim().length < 2} onClick={saveProduct}>
                  {editingId ? 'Lưu thay đổi' : 'Lưu sản phẩm'}
                </button>
              </div>
            </section>
          ) : (
            <>
              <section className="panel-card">
                <div className="panel-card-head wrap">
                  <div>
                    <span className="pill-badge">{selected.industry}</span>
                    <h2>{selected.name}</h2>
                    {selected.brand && <p className="muted-copy">Thương hiệu: {selected.brand}</p>}
                  </div>
                  <div className="btn-row">
                    <button className="secondary-btn" onClick={() => startEdit(selected)}>
                      Sửa thông tin
                    </button>
                    <button className="secondary-btn danger-outline" onClick={() => setPendingDelete({ kind: 'product', product: selected })}>
                      <Trash2 size={14} /> Xóa
                    </button>
                    <button className="primary-btn" onClick={() => onStartVideo(selected.id)}>
                      <WandSparkles size={15} /> Tạo video từ sản phẩm này
                    </button>
                  </div>
                </div>

                {selected.description && <p className="body-copy">{selected.description}</p>}
                {selected.highlights.length > 0 && (
                  <ul className="highlight-list">
                    {selected.highlights.map((h, i) => (
                      <li key={i}>
                        <CheckCircle2 size={14} /> {h}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel-card">
                <div className="panel-card-head wrap">
                  <div>
                    <h3>Hình ảnh sản phẩm gốc ({selected.images.length}/{maxImages})</h3>
                    <small className="muted-copy">Ảnh gốc luôn được bảo toàn, không bị ghi đè bởi AI hay quá trình dựng video.</small>
                  </div>
                  <label className="primary-btn upload-label">
                    <ImagePlus size={15} /> Tải ảnh lên
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      hidden
                      disabled={busy || selected.images.length >= maxImages}
                      onChange={e => {
                        handleUploadFiles(selected, e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {selected.images.length === 0 ? (
                  <div className="empty-box">
                    <ImagePlus size={28} />
                    <p>Chưa có ảnh nào. Hãy tải 1–10 ảnh JPG, PNG hoặc WEBP (tối đa 5MB/ảnh).</p>
                  </div>
                ) : (
                  <div className="image-gallery-grid">
                    {selected.images.map((im, idx) => (
                      <div key={im.id} className={im.isPrimary ? 'gallery-card primary' : 'gallery-card'}>
                        <div className="gallery-thumb">
                          <img src={im.imageUrl} alt={im.fileName} />
                          {im.isPrimary && <span className="primary-tag">Ảnh đại diện</span>}
                        </div>
                        <div className="gallery-meta">
                          <strong title={im.fileName}>{im.fileName}</strong>
                          <small>
                            {im.width && im.height ? `${im.width}×${im.height} · ` : ''}
                            {formatBytes(im.sizeBytes)} · {im.storageProvider === 'imagekit' ? 'ImageKit' : 'Nội bộ'}
                          </small>
                        </div>
                        <div className="gallery-actions">
                          <button title="Sang trái" disabled={idx === 0 || busy} onClick={() => reorderImage(selected, idx, -1)}>
                            <ArrowLeft size={14} />
                          </button>
                          <button
                            title="Sang phải"
                            disabled={idx === selected.images.length - 1 || busy}
                            onClick={() => reorderImage(selected, idx, 1)}
                          >
                            <ArrowRight size={14} />
                          </button>
                          <button
                            title="Chọn làm ảnh đại diện"
                            disabled={im.isPrimary || busy}
                            onClick={() => setPrimaryImage(selected, im.id)}
                          >
                            <Star size={14} />
                          </button>
                          <button title="Xóa ảnh" disabled={busy} onClick={() => setPendingDelete({ kind: 'image', product: selected, imageId: im.id })}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel-card">
                <div className="panel-card-head wrap">
                  <div>
                    <h3>AI Phân tích sản phẩm</h3>
                    <small className="muted-copy">
                      Tổng hợp dữ liệu xác thực từ người dùng và gợi ý điểm bán hàng (USP) phục vụ viết kịch bản.
                    </small>
                  </div>
                  <button className="primary-btn" disabled={analyzing} onClick={() => runAiAnalysis(selected)}>
                    <Sparkles size={15} /> {analyzing ? 'Đang phân tích...' : selected.aiAnalysis ? 'Phân tích lại' : 'Phân tích bằng AI'}
                  </button>
                </div>

                {selected.aiAnalysis ? (
                  <div className="analysis-result">
                    <div className="analysis-mode-bar">
                      <span>
                        Chế độ: <b>{selected.aiAnalysis.mode === 'gemini' ? `Gemini (${selected.aiAnalysis.model})` : 'Phân tích cấu trúc miễn phí'}</b>
                      </span>
                      <small>{selected.aiAnalysis.disclaimer}</small>
                    </div>
                    <div className="analysis-columns">
                      <div className="analysis-box confirmed">
                        <h4>Thông tin xác nhận từ người dùng</h4>
                        <ul>
                          {selected.aiAnalysis.confirmedFacts.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="analysis-box suggested">
                        <h4>Đề xuất sáng tạo (AI Suggestions)</h4>
                        <p>
                          <b>Tóm tắt thị giác:</b> {selected.aiAnalysis.visualSummary}
                        </p>
                        <p>
                          <b>Màu sắc & Chất liệu:</b> {selected.aiAnalysis.aiSuggestions.colorsAndMaterials}
                        </p>
                        <p>
                          <b>Gợi ý USP:</b> {selected.aiAnalysis.aiSuggestions.uspIdeas.join(' · ')}
                        </p>
                        <p>
                          <b>Khách hàng mục tiêu:</b> {selected.aiAnalysis.aiSuggestions.targetAudiences.join(' · ')}
                        </p>
                        <p>
                          <b>Định dạng video khuyên dùng:</b> {selected.aiAnalysis.aiSuggestions.recommendedVideoTypes.join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="muted-copy">Nhấn "Phân tích bằng AI" để tổng hợp USP và gợi ý kịch bản cho sản phẩm này.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === 'product' ? 'Xóa sản phẩm?' : 'Xóa hình ảnh?'}
          message={pendingDelete.kind === 'product'
            ? `Bạn có chắc chắn muốn xóa sản phẩm “${pendingDelete.product.name}” và các hình ảnh liên quan không?`
            : `Bạn có chắc chắn muốn xóa hình ảnh này khỏi sản phẩm “${pendingDelete.product.name}” không?`}
          confirmLabel={pendingDelete.kind === 'product' ? 'Xóa sản phẩm' : 'Xóa hình ảnh'}
          busy={busy}
          onCancel={() => { if (!busy) setPendingDelete(null); }}
          onConfirm={async () => {
            const target = pendingDelete;
            try {
              if (target.kind === 'product') await deleteProduct(target.product.id);
              else if (target.imageId) await deleteImage(target.product, target.imageId);
            } finally {
              setPendingDelete(null);
            }
          }}
        />
      )}
    </div>
  );
}
