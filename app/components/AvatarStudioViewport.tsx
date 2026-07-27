'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AvatarPartType } from '../lib/types';
import { DEFAULT_SKIN_COLOR } from '../lib/avatarItems';
import Avatar3DViewer from './Avatar3DViewer';
import { flattenLayersToDataUrl } from '../lib/avatarStudio';
import type { AvatarStudioLayer } from '../lib/types';

interface AvatarStudioViewportProps {
  targetPartType: AvatarPartType;
  layers: AvatarStudioLayer[];
  skinColor?: string;
  className?: string;
}

/**
 * Live 3D preview of the composed texture on a blank starter rig (MIE-37).
 * Reuses Avatar3DViewer draftTexture — no clothing equipped except the active slot.
 */
export default function AvatarStudioViewport({
  targetPartType,
  layers,
  skinColor = DEFAULT_SKIN_COLOR,
  className = '',
}: AvatarStudioViewportProps) {
  const [draftUrl, setDraftUrl] = useState<string | null>(null);

  // Re-flatten whenever layers change so the rig wears the latest composition.
  useEffect(() => {
    let cancelled = false;
    flattenLayersToDataUrl(layers)
      .then((url) => {
        if (!cancelled) setDraftUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDraftUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [layers]);

  const draftTexture = useMemo(
    () => (draftUrl ? { partType: targetPartType, textureUrl: draftUrl } : null),
    [draftUrl, targetPartType],
  );

  return (
    <div className={`bg-slate-900 rounded-xl overflow-hidden ${className}`}>
      <p className="text-xs text-slate-400 px-3 py-2 border-b border-slate-700">3D preview — blank rig</p>
      <Avatar3DViewer
        layers={{}}
        skinColor={skinColor}
        draftTexture={draftTexture}
        enableRotation
        className="w-full h-64 sm:h-80"
      />
    </div>
  );
}
