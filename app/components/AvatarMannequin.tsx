'use client';

import Image from 'next/image';
import type { AvatarItem, AvatarPartType } from '../lib/types';
import { AVATAR_PART_TYPES } from '../lib/avatarItems';

/** Layer positions on the dummy for each body slot (percent-based). */
const SLOT_STYLE: Record<AvatarPartType, React.CSSProperties> = {
  hair: { top: '2%', left: '50%', width: '38%', height: '18%', transform: 'translateX(-50%)' },
  shirt: { top: '24%', left: '50%', width: '42%', height: '28%', transform: 'translateX(-50%)' },
  accessory: { top: '20%', left: '68%', width: '16%', height: '16%' },
  arm: { top: '28%', left: '8%', width: '18%', height: '22%' },
  pants: { top: '50%', left: '50%', width: '38%', height: '22%', transform: 'translateX(-50%)' },
  leg: { top: '68%', left: '28%', width: '18%', height: '24%' },
  sock: { top: '82%', left: '28%', width: '16%', height: '12%' },
  foot: { top: '88%', left: '26%', width: '20%', height: '10%' },
  hand: { top: '42%', left: '6%', width: '14%', height: '14%' },
  emote: { top: '6%', left: '6%', width: '20%', height: '20%' },
};

interface AvatarMannequinProps {
  layers: Partial<Record<AvatarPartType, AvatarItem>>;
  emoteActive?: boolean;
  className?: string;
}

/**
 * Dummy mannequin with layered equipped item previews (MIE-15).
 */
export default function AvatarMannequin({ layers, emoteActive, className = '' }: AvatarMannequinProps) {
  return (
    <div
      className={`relative mx-auto w-40 h-64 sm:w-48 sm:h-72 ${emoteActive ? 'animate-bounce' : ''} ${className}`}
    >
      <Image
        src="/starter-avatar-dummy.svg"
        alt="Avatar dummy"
        fill
        className="object-contain"
        unoptimized
      />
      {AVATAR_PART_TYPES.map((partType) => {
        const item = layers[partType];
        if (!item?.previewImageUrl) return null;
        return (
          <div
            key={partType}
            className="absolute pointer-events-none overflow-hidden rounded-md"
            style={SLOT_STYLE[partType]}
          >
            <Image
              src={item.previewImageUrl}
              alt={item.name}
              width={80}
              height={80}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>
        );
      })}
    </div>
  );
}
