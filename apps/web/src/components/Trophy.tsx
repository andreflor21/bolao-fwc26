interface TrophyProps {
  className?: string;
  variant?: 'white' | 'dark';
}

export function Trophy({ className, variant = 'white' }: TrophyProps) {
  const src = variant === 'white' ? '/fifa-world-cup-2026-white.png' : '/fifa-world-cup-2026.png';
  return (
    <img
      src={src}
      alt="FIFA World Cup 2026"
      className={'object-contain ' + (className ?? '')}
      draggable={false}
    />
  );
}
