import type { ReactNode } from 'react';

interface ResponsiveTableProps {
  /** Largura mínima da tabela em px — força scroll horizontal quando o container é menor. */
  minWidth?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Container de tabela admin: card com scroll horizontal no mobile e
 * largura mínima fixa para a `<table>` interna não colapsar colunas.
 */
export function ResponsiveTable({
  minWidth = 640,
  className = '',
  children,
}: ResponsiveTableProps) {
  return (
    <div className={`card overflow-x-auto ${className}`.trim()}>
      <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
        {children}
      </table>
    </div>
  );
}
