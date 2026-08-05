import type { InvitePayload } from './roomRepo';

export function buildInviteShareMessage(
  title: string,
  roomCodeLabel: string,
  invite: InvitePayload,
): string {
  return [title, `${roomCodeLabel}: ${invite.roomId}`, invite.deepLink].join('\n');
}
