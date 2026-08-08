import { isLocalGameMutable } from '../../../src/domain/gameRecord/localLifecycle';

describe('local terminal lifecycle', () => {
  it('allows only setup/active local games to mutate records', () => {
    expect(isLocalGameMutable({ gameState: 'draft', endedAt: null })).toBe(true);
    expect(isLocalGameMutable({ gameState: 'active', endedAt: null })).toBe(true);
    expect(isLocalGameMutable({ gameState: 'ended', endedAt: 1 })).toBe(false);
    expect(isLocalGameMutable({ gameState: 'abandoned', endedAt: 1 })).toBe(false);
  });
});
