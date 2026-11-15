import { useRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  clearAriaLabel?: string;
}

export default function PasswordInput({
  value,
  onValueChange,
  clearAriaLabel = 'Xóa mật khẩu',
  className,
  disabled,
  ...rest
}: PasswordInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [visible, setVisible] = useState(false);
  const showClear = value.length > 0 && !disabled;

  return (
    <div className={showClear ? 'password-field-wrap has-clear' : 'password-field-wrap'}>
      <input
        {...rest}
        ref={inputRef}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        value={value}
        className={className ? `password-field-input ${className}` : 'password-field-input'}
        onChange={e => onValueChange(e.target.value)}
      />
      <div className="password-field-actions">
        {showClear && (
          <button
            type="button"
            className="password-action-btn password-clear-btn"
            aria-label={clearAriaLabel}
            title="Xóa nhanh"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              onValueChange('');
              inputRef.current?.focus();
            }}
          >
            <X size={15} />
          </button>
        )}
        <button
          type="button"
          className="password-action-btn password-eye-btn"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          title={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
          disabled={disabled}
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            setVisible(prev => !prev);
            inputRef.current?.focus();
          }}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
