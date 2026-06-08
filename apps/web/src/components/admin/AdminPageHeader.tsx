import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Botões / chips no canto direito (no mobile descem em flex-wrap). */
  actions?: ReactNode;
}

/**
 * Cabeçalho padrão das páginas /admin/*: título grande no esquerdo, ações
 * (botões, filtros) no direito. Em telas <sm o título e o subtítulo ficam
 * em uma coluna e as ações abaixo, em flex-wrap, evitando overflow.
 */
export function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps) {
  return (
    <header className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-display text-shimmer leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-emerald-200/70">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </header>
  );
}
