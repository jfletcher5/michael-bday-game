// Convert Firestore level documents into GameCanvas props (MIE-19).
// Re-exports shared virtual-world helpers for backward compatibility.

export {
  levelDocumentToPlatforms,
  levelDocumentToBombs,
  levelDocumentToSpikes,
  scrollDirectionMultiplier,
  LEVEL_WORLD_WIDTH,
  LEVEL_WORLD_HEIGHT,
  LEVEL_BOMB_RADIUS,
  LEVEL_SPIKE_WIDTH,
  MAX_LEVEL_SPIKES,
} from './levelWorld';
