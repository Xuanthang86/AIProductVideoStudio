import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Xác nhận xóa', busy = false, onCancel, onConfirm }: Props) {
  return (
    <div className="confirm-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <h3 id="confirm-dialog-title"><AlertTriangle size={19} /> {title}</h3>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="secondary-btn" disabled={busy} onClick={onCancel}>Hủy</button>
          <button type="button" className="danger-confirm-btn" disabled={busy} onClick={onConfirm}>{busy ? 'Đang xử lý…' : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
