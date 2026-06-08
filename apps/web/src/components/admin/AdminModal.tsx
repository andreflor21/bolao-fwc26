import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Largura máxima do conteúdo no desktop. Default: md. */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  /** Rodapé fixo com ações (cancelar/confirmar). No mobile vira coluna. */
  footer?: ReactNode;
}

const WIDTHS: Record<NonNullable<AdminModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

/**
 * Modal responsivo padrão do admin. Substitui o `fixed inset-0 grid ...`
 * duplicado nas páginas. Fecha por backdrop click ou Esc; o conteúdo
 * tem scroll vertical quando excede 90vh.
 */
export function AdminModal({
  open,
  onClose,
  title,
  maxWidth = 'md',
  children,
  footer,
}: AdminModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // bloqueia scroll de fundo no mobile enquanto o modal está aberto
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`card-glow w-full ${WIDTHS[maxWidth]} max-h-[90vh] overflow-y-auto p-4 sm:p-6`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <h3 className="mb-3 text-lg sm:text-xl font-display text-emerald-100">{title}</h3>
        )}
        <div className="space-y-3">{children}</div>
        {footer && (
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
