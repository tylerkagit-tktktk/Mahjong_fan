import fs from 'fs';
import path from 'path';

const rootNavigatorSource = fs.readFileSync(path.resolve(__dirname, '../../src/navigation/RootNavigator.tsx'), 'utf8');
const navigationTypesSource = fs.readFileSync(path.resolve(__dirname, '../../src/navigation/types.ts'), 'utf8');

const formalRoutes = [
  'Home',
  'NewGameStepper',
  'GameTable',
  'GameDashboard',
  'History',
  'JoinLanding',
  'JoinInvite',
  'RoomLobby',
  'MultiplayerGameTable',
  'CloudArchiveDetail',
] as const;

describe('root navigation route inventory', () => {
  it('removes legacy AddHand/Summary and keeps the formal routes registered', () => {
    expect(rootNavigatorSource).not.toContain('name="AddHand"');
    expect(rootNavigatorSource).not.toContain('name="Summary"');
    expect(navigationTypesSource).not.toMatch(/^\s*(AddHand|Summary):/m);

    formalRoutes.forEach((route) => {
      expect(rootNavigatorSource).toContain(`name="${route}"`);
      expect(navigationTypesSource).toMatch(new RegExp(`^\\s*${route}:`, 'm'));
    });
  });
});
