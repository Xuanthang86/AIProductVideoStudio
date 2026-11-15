import { useRef, type InputHTMLAttributes } from 'react';
import { X } from 'lucide-react';

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
  const showClear = value.length > 0 && !disabled;

  return (
    <div className="password-field-wrap">
      <input
        {...rest}
        ref={inputRef}
        type="password"
        disabled={disabled}
        value={value}
        className={className ? `password-field-input ${className}` : 'password-field-input'}
        onChange={e => onValueChange(e.target.value)}
      />
      {showClear && (
        <button
          type="button"
          className="password-clear-btn"
          aria-label={clearAriaLabel}
          title="Xóa nhanh"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            onValueChange('');
            inputRef.current?.focus();
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
