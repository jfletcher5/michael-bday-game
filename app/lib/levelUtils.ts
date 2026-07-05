// Convert Firestore level documents into GameCanvas props (MIE-19).
// Re-exports shared virtual-world helpers for backward compatibility.

export {
  levelDocumentToPlatforms,
  levelDocumentToBombs,
  scrollDirectionMultiplier,
  LEVEL_WORLD_WIDTH,
  LEVEL_WORLD_HEIGHT,
  LEVEL_BOMB_RADIUS,
} from './levelWorld';
