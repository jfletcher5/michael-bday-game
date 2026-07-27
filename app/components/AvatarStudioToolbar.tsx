'use client';

import type { AvatarPartType } from '../lib/types';
import { AVATAR_PART_LABELS, UGC_TEXTURE_PART_TYPES } from '../lib/avatarItems';
import type { AvatarStudioTool } from '../lib/avatarStudio';

interface AvatarStudioToolbarProps {
  tool: AvatarStudioTool;
  onToolChange: (tool: AvatarStudioTool) => void;
  targetPartType: AvatarPartType;
  onPartTypeChange: (part: AvatarPartType) => void;
  onUploadImage: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  disabled?: boolean;
}

const TOOL_BUTTONS: { id: AvatarStudioTool; label: string; icon: string }[] = [
  { id: 'select', label: 'Select', icon: '↖' },
  { id: 'square', label: 'Square', icon: '⬜' },
  { id: 'circle', label: 'Circle', icon: '⚪' },
  { id: 'triangle', label: 'Triangle', icon: '△' },
  { id: 'star', label: 'Star', icon: '★' },
  { id: 'image', label: 'Image', icon: '🖼' },
];

/**
 * Tool palette + body-slot picker for Avatar Item Studio (MIE-37).
 */
export default function AvatarStudioToolbar({
  tool,
  onToolChange,
  targetPartType,
  onPartTypeChange,
  onUploadImage,
  onDeleteSelected,
  hasSelection,
  disabled,
}: AvatarStudioToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-slate-400 block mb-1">Body slot</label>
        <select
          value={targetPartType}
          onChange={(e) => onPartTypeChange(e.target.value as AvatarPartType)}
          disabled={disabled}
          className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-2 py-2 text-sm"
        >
          {UGC_TEXTURE_PART_TYPES.map((part) => (
            <option key={part} value={part}>
              {AVATAR_PART_LABELS[part]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1">Tools</p>
        <div className="flex flex-wrap gap-1">
          {TOOL_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              type="button"
              aria-pressed={tool === btn.id}
              disabled={disabled}
              onClick={() => {
                if (btn.id === 'image') onUploadImage();
                else onToolChange(btn.id);
              }}
              className={`min-h-[36px] px-2 rounded-lg text-xs font-medium transition-colors ${
                tool === btn.id ? 'bg-amber-500 text-black' : 'bg-slate-800 text-white hover:bg-slate-700'
              } disabled:opacity-50`}
              title={btn.label}
            >
              <span className="mr-1">{btn.icon}</span>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onDeleteSelected}
        disabled={disabled || !hasSelection}
        className="min-h-[36px] px-3 rounded-lg bg-red-600/80 text-white text-xs font-medium disabled:opacity-40"
      >
        Delete selected
      </button>
    </div>
  );
}
