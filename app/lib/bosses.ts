import { BossEncounterConfig } from './types';

/**
 * Explicit boss encounters for infinite mode progression.
 * Add new entries here to introduce future bosses and tuning.
 */
export const BOSS_ENCOUNTERS: BossEncounterConfig[] = [
  {
    id: 'gigaball-600',
    levelMeters: 600,
    bossId: 'gigaball',
    name: 'Gigaball',
    hp: 1000,
    contactDamageAmount: 50,
    sizeMultiplier: 3,
    arenaYSpawnOffset: 220,
    arenaSegments: [
      // Three segments create two holes for fall-through gameplay.
      { widthRatio: 0.28, centerXRatio: 0.17 },
      { widthRatio: 0.28, centerXRatio: 0.50 },
      { widthRatio: 0.28, centerXRatio: 0.83 },
    ],
    // Small automatic jumps tuned with the requested 1-2 force range.
    jumpForceRange: { min: 1, max: 2 },
    jumpCooldownRangeMs: { min: 550, max: 850 },
    contactDamageCooldownMs: 350,
    defeatBlinkDurationMs: 1200,
    defeatBlinkIntervalMs: 110,
  },
  {
    id: 'gigaball-900',
    levelMeters: 1200,
    bossId: 'gigaball',
    name: 'Gigaball',
    hp: 2000,
    contactDamageAmount: 50,
    sizeMultiplier: 3,
    arenaYSpawnOffset: 220,
    arenaSegments: [
      // Slightly narrower center segment to vary hole spacing.
      { widthRatio: 0.30, centerXRatio: 0.18 },
      { widthRatio: 0.22, centerXRatio: 0.50 },
      { widthRatio: 0.30, centerXRatio: 0.82 },
    ],
    jumpForceRange: { min: 1, max: 2 },
    jumpCooldownRangeMs: { min: 500, max: 780 },
    contactDamageCooldownMs: 300,
    defeatBlinkDurationMs: 1300,
    defeatBlinkIntervalMs: 100,
  },
];

