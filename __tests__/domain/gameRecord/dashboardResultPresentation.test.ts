import {
  getTopDashboardPlayers,
  rankDashboardPlayers,
} from '../../../src/domain/gameRecord/dashboardResultPresentation';

const players = [
  { playerId: 'a', displayName: 'Ada', totalQ: 400 },
  { playerId: 'b', displayName: 'Ben', totalQ: 400 },
  { playerId: 'c', displayName: 'Chris', totalQ: -200 },
  { playerId: 'd', displayName: 'Dora', totalQ: -600 },
];

describe('dashboard result presentation', () => {
  it('uses deterministic competition ranks for unique, tied, and all-zero balances', () => {
    expect(rankDashboardPlayers([
      { playerId: 'a', displayName: 'Ada', totalQ: 400 },
      { playerId: 'b', displayName: 'Ben', totalQ: 200 },
      { playerId: 'c', displayName: 'Chris', totalQ: -100 },
      { playerId: 'd', displayName: 'Dora', totalQ: -500 },
    ]).map((player) => player.rank)).toEqual([1, 2, 3, 4]);
    expect(rankDashboardPlayers(players).map((player) => [player.displayName, player.rank, player.tied])).toEqual([
      ['Ada', 1, true], ['Ben', 1, true], ['Chris', 3, false], ['Dora', 4, false],
    ]);
    expect(rankDashboardPlayers(players.slice().reverse()).map((player) => player.playerId)).toEqual(['a', 'b', 'c', 'd']);
    expect(rankDashboardPlayers([
      { playerId: 'a', displayName: 'Ada', totalQ: 400 },
      { playerId: 'b', displayName: 'Ben', totalQ: 400 },
      { playerId: 'c', displayName: 'Chris', totalQ: 400 },
      { playerId: 'd', displayName: 'Dora', totalQ: -600 },
    ]).map((player) => player.rank)).toEqual([1, 1, 1, 4]);
    expect(rankDashboardPlayers(players.map((player) => ({ ...player, totalQ: 0 }))).map((player) => player.rank)).toEqual([1, 1, 1, 1]);
  });

  it('returns every tied leader and omits all-zero highlight categories', () => {
    expect(getTopDashboardPlayers(players, { a: 3, b: 3, c: 1, d: 0 })).toEqual({
      count: 3,
      players: [players[0], players[1]],
    });
    expect(getTopDashboardPlayers(players, { a: 0, b: 0, c: 0, d: 0 })).toBeNull();
  });
});
