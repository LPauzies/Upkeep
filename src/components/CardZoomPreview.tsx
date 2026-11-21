import { useState } from 'react';
import type { MtgCard } from '../extension/types';
import { ManaCost } from './ManaCost';

interface CardZoomPreviewProps {
  card: MtgCard | null;
  scale: number;
}

export function CardZoomPreview({ card, scale }: CardZoomPreviewProps) {
  const [imgError, setImgError] = useState(false);

  if (!card) return null;

  const widthPx = Math.round(236 * Math.min(1.75, Math.max(1.1, scale / 1.3)));

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-[304px] z-50 rounded-none border border-[#C9A45C]/60 bg-[#151922] shadow-2xl overflow-hidden transition-opacity duration-150"
      style={{ width: `${widthPx}px` }}
      role="tooltip"
      aria-label={`Aperçu de ${card.name}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[rgba(242,238,230,0.09)] bg-[#1C222E]">
        <span className="font-display text-sm font-semibold text-[#F2EEE6] truncate">
          {card.name}
        </span>
        <ManaCost cost={card.manaCost} />
      </div>

      <div className="relative aspect-[4/3] w-full bg-[#0E1116] overflow-hidden">
        {!imgError ? (
          <img
            src={card.artUrl}
            alt={card.name}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#181E29] text-xs text-[#9CA3B2] px-4 text-center">
            {card.name}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-y border-[rgba(242,238,230,0.08)] bg-[#131720] flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#C9A45C] truncate">{card.typeLine}</span>
        {card.stats && (
          <span className="font-mono-tabular text-xs font-bold text-[#F2EEE6] shrink-0">
            {card.stats}
          </span>
        )}
      </div>

      <div className="px-3 py-2.5 text-xs leading-relaxed text-[#D8D3C9]">
        {card.rulesText}
      </div>
    </div>
  );
}
