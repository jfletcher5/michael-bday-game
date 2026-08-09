'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BossHudState, GameState, Controls, PlayerIdentity, User, Bomb, Spike } from '../lib/types';
import { awardAuroraShard, getUserData, startGameSession, submitScoreViaFunction, updateUserStats, useExtraBall as consumeExtraBall, GameSession, subscribeToAvatarItems, getLevelDocument, incrementLevelPlayCount, subscribeToRaceChallenge, updateRaceProgress } from '../lib/firestore';
import { levelDocumentToPlatforms, levelDocumentToBombs, levelDocumentToSpikes, scrollDirectionMultiplier } from '../lib/levelUtils';
import type { LevelDocument } from '../lib/types';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import { getBallTypeById, getDefaultBallType } from '../lib/ballTypes';
import { hasDoubleCash } from '../lib/gamepasses';
import { AURORA_SHARD_GOAL } from '../lib/aurora';
import { mergeAvatarCatalog, getEquippedAvatarItems, EMOTE_COOLDOWN_MS } from '../lib/avatarItems';
import type { AvatarItem } from '../lib/types';
import EmoteOverlay from '../components/EmoteOverlay';
import ControlsComponent from './components/Controls';
import TouchControls from './components/TouchControls';
import GameCanvas from './components/GameCanvas';
import { usePlayerSettings } from '../components/PlayerSettingsProvider';
import { DEFAULT_GAME_HREF } from '../lib/games';

// Stable empty arrays prevent GameCanvas re-init loops when HUD state updates (~250ms).
const EMPTY_CUSTOM_PLATFORMS: [] = [];
const EMPTY_CUSTOM_BOMBS: Bomb[] = [];
const EMPTY_CUSTOM_SPIKES: Spike[] = [];
const DEFAULT_SCROLL_VECTOR = { x: 0, y: 1 };

/**
 * Game Page Component
 * Wraps the actual game in Suspense for useSearchParams
 */
export default function GamePage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black flex items-center justify-center text-white">Loading...</div>}>
      <Game />
    </Suspense>
  );
}

/**
 * Game Component
 * Main game page with 2D platform scroller - infinite mode
 * Uses Cloud Functions for secure score submission with anti-cheat validation
 */
function Game() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const levelId = searchParams.get('levelId');
  const returnTo = searchParams.get('returnTo');
  const raceId = searchParams.get('raceId');
  const { settings } = usePlayerSettings();
  
  // Game state
  const [gameState, setGameState] = useState<GameState>('playing');
  const [controls, setControls] = useState<Controls>({
    left: false,
    right: false,
    jump: false,
  });
  
  // Game metrics — refs hold the live values; state is throttled for HUD display.
  const distanceRef = useRef(0);
  const coinsEarnedRef = useRef(0);
  const gemsEarnedRef = useRef(0);
  const [displayDistance, setDisplayDistance] = useState(0);
  const [displayCoins, setDisplayCoins] = useState(0);
  const [displayGems, setDisplayGems] = useState(0);
  const [bossHud, setBossHud] = useState<BossHudState | null>(null);
  const hudTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Player identity (loaded from localStorage)
  const playerIdentityRef = useRef<PlayerIdentity | null>(null);

  // Current user (if logged in)
  const currentUserRef = useRef<User | null>(null);
  const [userSnapshot, setUserSnapshot] = useState<User | null>(null);
  const [avatarCatalog, setAvatarCatalog] = useState<AvatarItem[]>([]);
  const [playingEmote, setPlayingEmote] = useState<AvatarItem | null>(null);
  const emoteCooldownUntilRef = useRef(0);
  const [emoteOnCooldown, setEmoteOnCooldown] = useState(false);
  const [auroraProgress, setAuroraProgress] = useState({ shards: 0, unlocked: false });

  // Track last distance milestone for coin calculation (every 50m = 20 coins, 40 with 2x Cash)
  const lastCoinMilestoneRef = useRef(0);
  // Gems: 20 per 100 meters traveled during the run
  const lastGemMilestoneRef = useRef(0);
  
  // Score save status for the game over modal
  const [scoreSaved, setScoreSaved] = useState(true);

  // Extra ball revival: signal to GameCanvas to reposition ball
  const reviveSignalRef = useRef(false);

  // Game session for anti-cheat (from Cloud Function) - REQUIRED for score submission
  const gameSessionRef = useRef<GameSession | null>(null);
  // Surface session failures in the HUD so players know score submit may be disabled.
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [levelData, setLevelData] = useState<LevelDocument | null>(null);
  const [levelLoadState, setLevelLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [raceOpponentMeters, setRaceOpponentMeters] = useState(0);
  const isLevelRun = !!levelId;
  const isLevelReady = isLevelRun && levelLoadState === 'ready' && !!levelData;

  const syncCurrentUser = useCallback((updatedUser: User) => {
    currentUserRef.current = updatedUser;
    setUserSnapshot(updatedUser);
    playerIdentityRef.current = {
      avatarId: updatedUser.avatarId,
      initials: updatedUser.username,
    };
    setCurrentUser(updatedUser);

    // Older users default to zero shards and locked Aurora Ball until Firestore says otherwise.
    const shards = Math.min(updatedUser.auroraShards ?? 0, AURORA_SHARD_GOAL);
    setAuroraProgress({
      shards,
      unlocked: updatedUser.auroraBallUnlocked === true || shards >= AURORA_SHARD_GOAL,
    });
  }, []);

  // Lock body scroll while on the game page so the canvas stays pinned.
  useEffect(() => {
    document.body.classList.add('game-page');
    return () => {
      document.body.classList.remove('game-page');
    };
  }, []);

  // Load player identity and start game session on mount
  // Cloud Functions are REQUIRED - no fallback to prevent cheating
  // Login is REQUIRED - no guest mode
  useEffect(() => {
    const user = getCurrentUser();
    
    // Require login to play
    if (!user) {
      router.push('/login');
      return;
    }
    
    syncCurrentUser(user);

    // Refresh the cached user so Aurora progress survives reloads and cross-device play.
    getUserData(user.username).then((fresh) => {
      if (fresh) syncCurrentUser(fresh);
    });

    const unsubAvatars = subscribeToAvatarItems((items) => {
      setAvatarCatalog(mergeAvatarCatalog(items));
    });
    
    // Start a secure game session via Cloud Function
    // This is REQUIRED for anti-cheat protection
    const initSession = async () => {
      setSessionLoading(true); // Mark as loading
      try {
        const session = await startGameSession();
        gameSessionRef.current = session;
        setSessionError(null);
        console.log('Game session initialized via Cloud Function');
      } catch (error) {
        console.error('Failed to initialize game session (Cloud Functions required):', error);
        setSessionError('Unable to start secure game session. Score submission will be disabled.');
        gameSessionRef.current = null;
      } finally {
        setSessionLoading(false); // Mark as done loading (success or failure)
      }
    };
    
    initSession();

    return () => unsubAvatars();
  }, [router, syncCurrentUser]);
  
  // Throttle HUD state updates to ~4 times per second instead of every frame.
  useEffect(() => {
    if (gameState === 'playing') {
      hudTimerRef.current = setInterval(() => {
        setDisplayDistance(distanceRef.current);
        setDisplayCoins(coinsEarnedRef.current);
        setDisplayGems(gemsEarnedRef.current);
      }, 250);
    } else {
      // Flush final values when game ends.
      setDisplayDistance(distanceRef.current);
      setDisplayCoins(coinsEarnedRef.current);
      setDisplayGems(gemsEarnedRef.current);
      if (hudTimerRef.current) {
        clearInterval(hudTimerRef.current);
        hudTimerRef.current = null;
      }
    }
    return () => {
      if (hudTimerRef.current) {
        clearInterval(hudTimerRef.current);
        hudTimerRef.current = null;
      }
    };
  }, [gameState]);

  // Get the selected ball type for the current user
  const getSelectedBallType = () => {
    const user = currentUserRef.current;
    if (user && user.selectedBall) {
      return getBallTypeById(user.selectedBall);
    }
    return getDefaultBallType();
  };

  // Handle distance updates from game canvas — stores in refs (no re-render).
  // Coins are derived from distance milestones.
  const handleDistanceUpdate = useCallback((newDistance: number) => {
    distanceRef.current = newDistance;

    if (raceId && currentUserRef.current) {
      updateRaceProgress(raceId, currentUserRef.current.username, newDistance).catch(() => {});
    }

    // Level runs do not accrue infinite-mode economy rewards (MIE-19).
    if (isLevelRun) return;

    // Coins: 20 per 50m (40 with 2x Cash gamepass)
    const coinPerMilestone = hasDoubleCash(currentUserRef.current) ? 40 : 20;
    const newCoinMilestone = Math.floor(newDistance / 50);
    if (newCoinMilestone > lastCoinMilestoneRef.current) {
      const milestonesReached = newCoinMilestone - lastCoinMilestoneRef.current;
      coinsEarnedRef.current += milestonesReached * coinPerMilestone;
      lastCoinMilestoneRef.current = newCoinMilestone;
    }

    // Gems: 20 per 100m milestone
    const newGemMilestone = Math.floor(newDistance / 100);
    if (newGemMilestone > lastGemMilestoneRef.current) {
      const gemMilestonesReached = newGemMilestone - lastGemMilestoneRef.current;
      gemsEarnedRef.current += gemMilestonesReached * 20;
      lastGemMilestoneRef.current = newGemMilestone;
    }
  }, [raceId, isLevelRun]);

  const handleAuroraShardAward = useCallback(async () => {
    const user = currentUserRef.current;
    if (!user) return null;

    const result = await awardAuroraShard(user.username);
    syncCurrentUser(result.user);
    return result;
  }, [syncCurrentUser]);

  useEffect(() => {
    if (!levelId) {
      setLevelLoadState('idle');
      setLevelData(null);
      return;
    }
    const user = getCurrentUser();
    setLevelLoadState('loading');
    getLevelDocument(levelId, user)
      .then((lvl) => {
        if (!lvl) {
          setLevelLoadState('error');
          setLevelData(null);
          return;
        }
        setLevelData(lvl);
        setLevelLoadState('ready');
        if (user && lvl.authorUsername !== user.username) {
          incrementLevelPlayCount(levelId, user).catch(() => {});
        }
      })
      .catch(() => {
        setLevelLoadState('error');
        setLevelData(null);
      });
  }, [levelId]);

  useEffect(() => {
    if (!raceId) return;
    return subscribeToRaceChallenge(raceId, (race) => {
      if (!race || !currentUserRef.current) return;
      const me = currentUserRef.current.username;
      const opp = race.challenger === me ? race.opponent : race.challenger;
      setRaceOpponentMeters(race.liveProgress?.[opp] ?? 0);
    });
  }, [raceId]);

  // Handle game over — check for extra balls, then auto-save stats and score
  const handleGameOver = async () => {
    // Hide boss UI immediately when the run ends.
    setBossHud(null);
    // Flush latest values for display
    setDisplayDistance(distanceRef.current);
    setDisplayCoins(coinsEarnedRef.current);

    setDisplayGems(gemsEarnedRef.current);

    const extraBalls = currentUserRef.current?.extraBalls ?? 0;
    if (extraBalls > 0 && !isLevelRun) {
      setGameState('revivePrompt');
      return;
    }

    setGameState('gameOver');
    await autoSaveRun();
  };

  // Shared auto-save logic used by game over and decline-revive paths.
  const autoSaveRun = async () => {
    if (isLevelRun) {
      setScoreSaved(false);
      return;
    }
    const user = currentUserRef.current;
    const session = gameSessionRef.current;
    const identity = getIdentity();
    let success = true;

    if (user) {
      try {
        const updatedUser = await updateUserStats(
          user.username,
          distanceRef.current,
          coinsEarnedRef.current,
          gemsEarnedRef.current,
        );
        if (updatedUser) {
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
        }
      } catch {
        success = false;
      }
    }

    if (session) {
      try {
        await submitScoreViaFunction(session, {
          avatarId: identity.avatarId,
          initials: identity.initials,
          distance: distanceRef.current,
          date: new Date().toISOString(),
        });
      } catch {
        // Anti-cheat can reject very short runs; still show the user their local stats.
        success = false;
      }
    }

    setScoreSaved(success);
  };

  // Handle revival with an extra ball
  const handleRevive = async () => {
    const user = currentUserRef.current;
    if (!user) return;
    try {
      const updated = await consumeExtraBall(user.username);
      currentUserRef.current = updated;
      setCurrentUser(updated);
      reviveSignalRef.current = true;
      setGameState('playing');
    } catch (err) {
      console.error('Failed to use extra ball:', err);
      setGameState('gameOver');
    }
  };

  // Decline revival — auto-save and proceed to game over
  const handleDeclineRevive = async () => {
    setGameState('gameOver');
    await autoSaveRun();
  };

  // Get player identity - user must be logged in
  const getIdentity = (): PlayerIdentity => {
    if (playerIdentityRef.current) {
      return playerIdentityRef.current;
    }
    // Fallback should not happen if login check works, but provide defaults
    return { avatarId: 1, initials: 'AAA' };
  };

  // Handle finishing game - save score via Cloud Function ONLY (anti-cheat protection)
  const handleFinish = async () => {
    setBossHud(null);

    // Custom level completion — no stats or leaderboard writes (MIE-19).
    if (isLevelRun) {
      setGameState('finished');
      return;
    }

    setGameState('finished');
    
    const identity = getIdentity();
    const session = gameSessionRef.current;
    const user = currentUserRef.current;
    
    // Update user stats if logged in
    if (user) {
      try {
        const updatedUser = await updateUserStats(
          user.username,
          distanceRef.current,
          coinsEarnedRef.current,
          gemsEarnedRef.current,
        );
        if (updatedUser) {
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          console.log(`Stats updated: +${distanceRef.current}m, +${coinsEarnedRef.current} coins`);
        }
      } catch (error) {
        console.error('Failed to update user stats:', error);
      }
    }

    if (!session) {
      console.error('Cannot save score: Game session not initialized. Cloud Functions required.');
      return;
    }

    try {
      await submitScoreViaFunction(session, {
        avatarId: identity.avatarId,
        initials: identity.initials,
        distance: distanceRef.current,
        date: new Date().toISOString(),
      });
      console.log('Game completion score saved via Cloud Function');
    } catch (error) {
      console.error('Failed to save score:', error);
    }
  };

  // Return to main menu
  const handleReturnToMenu = () => {
    router.push(DEFAULT_GAME_HREF);
  };

  // Restart game - also reinitialize session for new game
  const handleRestart = async () => {
    setGameState('playing');
    distanceRef.current = 0;
    coinsEarnedRef.current = 0;
    gemsEarnedRef.current = 0;
    setDisplayDistance(0);
    setDisplayCoins(0);
    setDisplayGems(0);
    setScoreSaved(true);
    reviveSignalRef.current = false;
    // Reset any prior boss meter for the new run.
    setBossHud(null);
    lastCoinMilestoneRef.current = 0;
    lastGemMilestoneRef.current = 0;
    setControls({
      left: false,
      right: false,
      jump: false,
    });
    
    // Reinitialize game session for the new game
    setSessionLoading(true);
    try {
      const session = await startGameSession();
      gameSessionRef.current = session;
      setSessionError(null);
      console.log('Game session reinitialized for new game');
    } catch (error) {
      console.error('Failed to reinitialize game session:', error);
      setSessionError('Unable to start secure game session. Score submission will be disabled.');
      gameSessionRef.current = null;
    } finally {
      setSessionLoading(false);
    }
  };
  
  // Get the current ball type for rendering
  const ballType = getSelectedBallType();
  // Memoize level geometry so HUD ticks don't recreate arrays and re-init the world (MIE-26/28/29).
  const levelPlatforms = useMemo(
    () => (isLevelReady && levelData ? levelDocumentToPlatforms(levelData) : EMPTY_CUSTOM_PLATFORMS),
    [isLevelReady, levelData],
  );
  const levelBombs = useMemo(
    () => (isLevelReady && levelData ? levelDocumentToBombs(levelData) : EMPTY_CUSTOM_BOMBS),
    [isLevelReady, levelData],
  );
  // Memoize Studio spikes so HUD ticks don't re-init the world (MIE-30).
  const levelSpikes = useMemo(
    () => (isLevelReady && levelData ? levelDocumentToSpikes(levelData) : EMPTY_CUSTOM_SPIKES),
    [isLevelReady, levelData],
  );
  const levelScrollVector = useMemo(
    () => (isLevelReady && levelData ? scrollDirectionMultiplier(levelData.screenScroll) : DEFAULT_SCROLL_VECTOR),
    [isLevelReady, levelData],
  );

  const equippedLayers = userSnapshot
    ? getEquippedAvatarItems(userSnapshot, avatarCatalog)
    : {};
  const equippedEmote = equippedLayers.emote ?? null;

  /** Trigger equipped emote during gameplay — respects cooldown and no stacking (MIE-17). */
  const handlePlayEmote = () => {
    if (!equippedEmote || playingEmote || emoteOnCooldown) return;
    setPlayingEmote(equippedEmote);
    emoteCooldownUntilRef.current = Date.now() + EMOTE_COOLDOWN_MS;
    setEmoteOnCooldown(true);
    window.setTimeout(() => {
      if (Date.now() >= emoteCooldownUntilRef.current) {
        setEmoteOnCooldown(false);
      }
    }, EMOTE_COOLDOWN_MS);
  };

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-black">
      {/* Loading overlay - show while session is initializing */}
      {sessionLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-white text-base sm:text-xl font-semibold mb-4 px-4">Initializing secure game session…</div>
            <div className="text-gray-400 text-sm">Please wait</div>
          </div>
        </div>
      )}

      {!sessionLoading && sessionError && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-md w-[90%] bg-amber-500/95 text-black text-sm font-medium px-3 py-2 rounded-xl text-center"
          role="status"
          aria-live="polite"
        >
          {sessionError}
        </div>
      )}

      {isLevelRun && levelLoadState === 'loading' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center text-white">
            <p className="text-lg font-semibold mb-2">Loading level…</p>
          </div>
        </div>
      )}

      {isLevelRun && levelLoadState === 'error' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md text-center">
            <h2 className="text-xl font-bold text-red-600 mb-2">Level Not Found</h2>
            <p className="text-gray-600 mb-4">This level is missing, private, or archived.</p>
            <button type="button" onClick={() => router.push(returnTo === 'studio' ? '/studio' : '/levels')} className="px-4 py-2 bg-purple-600 text-white rounded-lg">
              Back
            </button>
          </div>
        </div>
      )}
      
      {/* 2D Game Canvas */}
      {(!isLevelRun || isLevelReady) && (
      <GameCanvas
        controls={controls}
        onDistanceUpdate={handleDistanceUpdate}
        onGameOver={handleGameOver}
        onFinish={handleFinish}
        onBossHudUpdate={setBossHud}
        isPlaying={gameState === 'playing' && !sessionLoading && (!isLevelRun || isLevelReady)}
        reviveSignalRef={reviveSignalRef}
        mode={isLevelReady ? 'level' : 'infinite'}
        customPlatforms={isLevelReady ? levelPlatforms : EMPTY_CUSTOM_PLATFORMS}
        customBombs={isLevelReady ? levelBombs : EMPTY_CUSTOM_BOMBS}
        customSpikes={isLevelReady ? levelSpikes : EMPTY_CUSTOM_SPIKES}
        levelSkyColor={levelData?.skyColor}
        levelScrollVector={levelScrollVector}
        fixedLevelWorld={isLevelReady}
        ballStartPosition={levelData?.ballSpawner ?? undefined}
        ballColor={ballType.color}
        ballStrokeColor={ballType.strokeColor}
        ballImageUrl={ballType.imageUrl}
        ballImageFilter={ballType.imageFilter}
        zoom={settings.zoom}
        auroraShardCount={auroraProgress.shards}
        auroraBallUnlocked={auroraProgress.unlocked}
        onAuroraShardAward={handleAuroraShardAward}
      />
      )}

      {raceId && (
        <div className="absolute top-20 right-4 z-20 bg-black/70 text-white px-3 py-2 rounded-lg text-sm">
          Opponent: {raceOpponentMeters}m
        </div>
      )}

      {/* Keyboard Controls Handler */}
      <ControlsComponent
        controls={controls}
        setControls={setControls}
        disabled={gameState !== 'playing' || sessionLoading}
      />

      {/* Touch Controls for Tablets/Mobile */}
      <TouchControls
        controls={controls}
        setControls={setControls}
        disabled={gameState !== 'playing' || sessionLoading}
      />

      {/* In-game emote playback — visual only, physics keep running (MIE-17) */}
      <EmoteOverlay
        item={playingEmote}
        variant="hud"
        onDone={() => setPlayingEmote(null)}
      />
      {gameState === 'playing' && equippedEmote && (
        <button
          type="button"
          onClick={handlePlayEmote}
          disabled={!!playingEmote || emoteOnCooldown}
          className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-10 min-h-[44px] min-w-[44px] px-3 rounded-lg bg-purple-600/80 text-white text-xs font-semibold backdrop-blur-sm border border-white/30 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Play emote"
        >
          {emoteOnCooldown ? '⏳' : '✨'} Emote
        </button>
      )}

      {/* HUD - Display current stats */}
      {gameState === 'playing' && (
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 bg-black/50 text-white px-3 py-2 sm:px-6 sm:py-3 rounded-lg backdrop-blur-sm">
          <div className="text-xs sm:text-sm font-semibold">Distance: {displayDistance}m</div>
          <div className="text-xs sm:text-sm font-semibold flex items-center gap-1 mt-0.5 sm:mt-1">
            <span className="text-yellow-300">🪙</span> {displayCoins} coins
          </div>
          <div className="text-xs sm:text-sm font-semibold flex items-center gap-1 mt-0.5">
            <span className="text-cyan-200">💎</span> {displayGems} gems
          </div>
        </div>
      )}

      {/* Boss Health Meter - shown only during active boss encounters */}
      {gameState === 'playing' && bossHud?.visible && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[min(560px,70vw)] rounded-xl border border-white/30 bg-black/60 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between text-white text-sm font-semibold">
            <span>{bossHud.name}</span>
            <span>{bossHud.hp}/{bossHud.maxHp} HP</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded bg-gray-800">
            <div
              className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 transition-all duration-150"
              style={{ width: `${Math.max(0, Math.min(100, (bossHud.hp / Math.max(1, bossHud.maxHp)) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* Extra Ball Revival Prompt */}
      {gameState === 'revivePrompt' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-purple-600 mb-2">🔮 Use Extra Ball?</h2>
            <p className="text-gray-600 mb-2">You have <span className="font-bold text-purple-600">{currentUserRef.current?.extraBalls ?? 0}</span> extra ball{(currentUserRef.current?.extraBalls ?? 0) !== 1 ? 's' : ''}</p>
            <p className="text-sm text-gray-500 mb-6">Revive and continue from where you left off!</p>

            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">{displayDistance}m</div>
                  <div className="text-sm text-gray-600">Distance</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                    <span>🪙</span> {displayCoins}
                  </div>
                  <div className="text-sm text-gray-600">Coins Earned</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleRevive}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
              >
                🔮 Revive! (1 Extra Ball)
              </button>
              <button
                onClick={handleDeclineRevive}
                className="w-full bg-white text-gray-600 font-semibold py-2 px-6 rounded-lg hover:bg-gray-100 transition-all border border-gray-300"
              >
                No, End Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState === 'gameOver' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-red-600 mb-4">{isLevelRun ? 'Level Failed' : 'Game Over!'}</h2>
            <p className="text-gray-600 mb-6">{isLevelRun ? 'Try again or return to the studio.' : 'You fell off the platforms!'}</p>
            
            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">
                    {displayDistance}m
                  </div>
                  <div className="text-sm text-gray-600">
                    Distance
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                    <span>🪙</span> {displayCoins}
                  </div>
                  <div className="text-sm text-gray-600">
                    Coins Earned
                  </div>
                </div>
              </div>
            </div>

            {!isLevelRun && (
              scoreSaved ? (
                <p className="text-sm text-green-600 mb-4">Score saved automatically</p>
              ) : (
                <p className="text-sm text-gray-400 mb-4">Run too short to save to leaderboard</p>
              )
            )}

            <div className="space-y-3">
              <button
                onClick={handleRestart}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold min-h-[48px] py-3 px-6 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 shadow-lg"
              >
                ▶ {isLevelRun ? 'Retry Level' : 'Play Again'}
              </button>
              {!isLevelRun && (
                <button
                  onClick={() => router.push('/leaderboard')}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold min-h-[48px] py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
                >
                  View Leaderboard
                </button>
              )}
              {isLevelRun && (
                <button
                  onClick={() => router.push(returnTo === 'studio' && levelId ? `/studio?id=${levelId}` : '/levels')}
                  className="w-full bg-white text-gray-600 font-semibold min-h-[44px] py-2 px-6 rounded-lg hover:bg-gray-100 transition-all border border-gray-300"
                >
                  {returnTo === 'studio' ? 'Back to Studio' : 'Back to Levels'}
                </button>
              )}
              {!isLevelRun && (
                <button
                  onClick={handleReturnToMenu}
                  className="w-full bg-white text-gray-600 font-semibold min-h-[44px] py-2 px-6 rounded-lg hover:bg-gray-100 transition-all border border-gray-300"
                >
                  Main Menu
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Game Complete Modal */}
      {gameState === 'finished' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-green-600 mb-4">{isLevelRun ? 'Level Complete!' : '🎉 Great Run!'}</h2>
            <p className="text-gray-600 mb-2">{isLevelRun ? 'You reached the finish.' : 'Amazing performance!'}</p>
            {!isLevelRun && <p className="text-sm text-green-600 mb-6">✓ Score saved to leaderboard</p>}
            {isLevelRun && <p className="text-sm text-gray-500 mb-6">Custom levels do not affect your main stats.</p>}
            
            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">
                    {displayDistance}m
                  </div>
                  <div className="text-sm text-gray-600">
                    Distance
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                    <span>🪙</span> {displayCoins}
                  </div>
                  <div className="text-sm text-gray-600">
                    Coins Earned
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {isLevelRun ? (
                <>
                  <button
                    onClick={handleRestart}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={() => router.push(returnTo === 'studio' && levelId ? `/studio?id=${levelId}` : '/levels')}
                    className="w-full bg-white text-gray-600 font-semibold py-2 px-6 rounded-lg border border-gray-300"
                  >
                    {returnTo === 'studio' ? 'Back to Studio' : 'Back to Levels'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => router.push('/leaderboard')}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
                  >
                    View Leaderboard
                  </button>
                  <button
                    onClick={handleReturnToMenu}
                    className="w-full bg-white text-gray-600 font-semibold py-2 px-6 rounded-lg hover:bg-gray-100 transition-all border border-gray-300"
                  >
                    Main Menu
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Instructions overlay (shown briefly at start) */}
      {gameState === 'playing' && displayDistance < 5 && !isLevelRun && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-black/70 text-white px-4 sm:px-8 py-3 sm:py-4 rounded-lg backdrop-blur-sm text-center pointer-events-none max-w-[90vw]">
          <p className="text-sm sm:text-xl font-semibold">Use arrow keys to move and jump!</p>
          <p className="text-xs sm:text-sm mt-1 sm:mt-2">Land on platforms and survive as long as you can</p>
        </div>
      )}

      {gameState === 'playing' && isLevelReady && displayDistance < 5 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-black/70 text-white px-4 sm:px-8 py-3 sm:py-4 rounded-lg backdrop-blur-sm text-center pointer-events-none max-w-[90vw]">
          <p className="text-sm sm:text-xl font-semibold">Reach the finish platform!</p>
        </div>
      )}
    </div>
  );
}
