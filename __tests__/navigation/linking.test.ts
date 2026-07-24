import { APP_DEEP_LINK_PREFIX, linking } from '../../src/navigation/linking';

describe('navigation deep linking', () => {
  it('routes mahjongfan join URLs to JoinInvite with the invite query params', () => {
    expect(APP_DEEP_LINK_PREFIX).toBe('mahjongfan://');
    expect(linking.prefixes).toContain(APP_DEEP_LINK_PREFIX);
    expect(linking.config).toEqual({
      screens: {
        JoinInvite: 'join',
      },
    });
  });
});
