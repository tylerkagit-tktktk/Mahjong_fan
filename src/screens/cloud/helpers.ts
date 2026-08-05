import type { HandLog, RoomLineup, SeatKey } from '../../models/cloud';

export const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];
export const SEAT_GLYPHS = ['東', '南', '西', '北'] as const;

export function formatMessage(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), template);
}

export function getSeatPlayerIds(lineup: RoomLineup | null): Array<string | null> {
  return SEAT_KEYS.map((seatKey) => lineup?.seats[seatKey] ?? null);
}

export function getDealerSeatIndexAfterHand(
  dealerSeatIndex: number,
  hand: HandLog,
  lineup: RoomLineup | null,
): number {
  if (hand.type === 'draw') {
    return hand.dealerAction === 'pass' ? (dealerSeatIndex + 1) % 4 : dealerSeatIndex;
  }

  const winnerSeatIndex = getSeatPlayerIds(lineup).findIndex((playerId) => playerId === hand.winnerPlayerId);
  if (winnerSeatIndex < 0 || winnerSeatIndex === dealerSeatIndex) {
    return dealerSeatIndex;
  }
  return (dealerSeatIndex + 1) % 4;
}

export function getCloudRoundLabel(roundIndex: number, dealerSeatIndex: number): string {
  const roundWind = SEAT_GLYPHS[(roundIndex - 1) % SEAT_GLYPHS.length] ?? '東';
  const dealerWind = SEAT_GLYPHS[dealerSeatIndex] ?? '東';
  return `${roundWind}風${dealerWind}局`;
}

export function getLineupForHand(lineups: RoomLineup[], hand: HandLog): RoomLineup | null {
  return (
    lineups.find((lineup) => lineup.lineupVersion === hand.lineupVersion) ??
    [...lineups]
      .reverse()
      .find((lineup) => lineup.effectiveFromHandIndex <= hand.handIndex) ??
    lineups[0] ??
    null
  );
}
