import { useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
}

/** Campo de senha com botão de mostrar/ocultar (ícone de olho). */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  minLength,
  maxLength,
  required,
  placeholder,
}: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative mt-1">
      <input
        className="input pr-11"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-md text-emerald-300/70 hover:text-emerald-100 hover:bg-emerald-500/10 transition"
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
            <path d="M1 1l22 22" />
            <path d="M6.61 6.61A13.5 13.5 0 002 12s3 8 10 8a9.7 9.7 0 005.39-1.61" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
