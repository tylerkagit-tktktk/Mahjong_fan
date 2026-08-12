import { APP_DEEP_LINK_SCHEME } from './linking';

export type ParsedInviteLink = {
  roomId: string;
  token: string;
};

export type InviteLinkParseResult =
  | { ok: true; invite: ParsedInviteLink }
  | { ok: false };

export function parseInviteLink(value: string): InviteLinkParseResult {
  const input = value.trim();
  if (!input) return { ok: false };

  try {
    const url = new URL(input);
    const expectedProtocol = `${APP_DEEP_LINK_SCHEME}:`;
    const isJoinRoute = url.hostname.toLowerCase() === 'join' && (url.pathname === '' || url.pathname === '/');
    if (url.protocol.toLowerCase() !== expectedProtocol || !isJoinRoute) {
      return { ok: false };
    }

    const roomId = url.searchParams.get('roomId')?.trim() ?? '';
    const token = url.searchParams.get('token')?.trim() ?? '';
    if (!roomId || !token) return { ok: false };

    return { ok: true, invite: { roomId, token } };
  } catch {
    return { ok: false };
  }
}
