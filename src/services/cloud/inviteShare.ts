import type { InvitePayload } from './roomRepo';

export function buildInviteShareMessage(
  title: string,
  invite: InvitePayload,
): string {
  return [title, invite.deepLink].join('\n');
}
