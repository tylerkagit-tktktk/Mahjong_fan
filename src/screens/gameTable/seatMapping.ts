import { GameBundle, Player } from '../../models/db';
import { getEffectivePlayersBySeat, normalizeSeatRotationOffset } from '../../models/seatRotation';
import { TranslationKey } from '../../i18n/types';

const SEAT_KEYS: Array<TranslationKey> = ['seat.east', 'seat.south', 'seat.west', 'seat.north'];

export function buildPlayersBySeat(
  bundle: GameBundle | null,
  seatRotationOffset?: number,
): Record<number, Player | undefined> {
  if (!bundle) {
    return {};
  }
  return getEffectivePlayersBySeat(
    bundle.players,
    normalizeSeatRotationOffset(seatRotationOffset ?? bundle.game.seatRotationOffset ?? 0),
  );
}

export function formatSeatLabel(
  t: (key: TranslationKey) => string,
  seatIndex: number,
  isDealer: boolean,
): string {
  const base = t(SEAT_KEYS[seatIndex] ?? 'seat.east');
  if (!isDealer) {
    return base;
  }
  return `${base} · ${t('newGame.dealerBadge')}`;
}
