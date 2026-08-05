import { isDev } from './isDev';

export const DEBUG_FLAGS = {
  enableBreadcrumbs: isDev,
  enableSyncTestTools: isDev,
} as const;
