import { isDev } from './isDev';

export const DEBUG_FLAGS = {
  enableBreadcrumbs: isDev && false,
  enableScrollSpacer: isDev && false,
  enableSyncTestTools: isDev,
} as const;
