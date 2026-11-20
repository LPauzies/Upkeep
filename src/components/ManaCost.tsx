interface ManaCostProps {
  cost: string[];
  compact?: boolean;
}

const MANA_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  W: { bg: '#EAE3CE', fg: '#1A1813', label: 'Blanc' },
  U: { bg: '#3B74A8', fg: '#F4F7FA', label: 'Bleu' },
  B: { bg: '#2C2A32', fg: '#E4DFEE', label: 'Noir' },
  R: { bg: '#B94A3E', fg: '#FBF5F4', label: 'Rouge' },
  G: { bg: '#3C7A57', fg: '#F2FAF5', label: 'Vert' },
};

export function ManaCost({ cost, compact = false }: ManaCostProps) {
  if (cost.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 shrink-0" aria-label={`Coût de mana ${cost.join('')}`}>
      {cost.map((symbol, idx) => {
        const style = MANA_STYLES[symbol] ?? {
          bg: '#313746',
          fg: '#E6E2D8',
          label: `Incolore ${symbol}`,
        };
        return (
          <span
            key={`${symbol}-${idx}`}
            title={style.label}
            className={`inline-flex items-center justify-center rounded-full font-mono-tabular font-semibold leading-none ${
              compact ? 'w-4 h-4 text-[10px]' : 'w-5 h-5 text-[11px]'
            }`}
            style={{ backgroundColor: style.bg, color: style.fg }}
          >
            {symbol}
          </span>
        );
      })}
    </span>
  );
}
