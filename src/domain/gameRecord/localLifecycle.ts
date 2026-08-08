import type { Game } from '../../models/db';

/**
 * A game can accept local record mutations only while it has not been terminally ended.
 * `draft` remains writable only for the first-hand setup path; user-visible correction
 * actions require `active` separately.
 */
export function isLocalGameMutable(game: Pick<Game, 'gameState' | 'endedAt'>): boolean {
  return game.endedAt == null && (game.gameState === 'draft' || game.gameState === 'active');
}
