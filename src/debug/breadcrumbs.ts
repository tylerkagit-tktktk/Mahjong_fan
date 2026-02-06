import { DEBUG_FLAGS } from './debugFlags';

type Breadcrumb = {
  ts: number;
  label: string;
  data?: unknown;
};

const MAX_ITEMS = 20;
const breadcrumbs: Breadcrumb[] = [];

function toSerializable(data: unknown): unknown {
  if (data === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return String(data);
  }
}

export function setBreadcrumb(label: string, data?: unknown) {
  if (!DEBUG_FLAGS.enableBreadcrumbs) {
    return;
  }
  breadcrumbs.push({ ts: Date.now(), label, data: toSerializable(data) });
  if (breadcrumbs.length > MAX_ITEMS) {
    breadcrumbs.shift();
  }
}

export function dumpBreadcrumbs(limit = 10) {
  const slice = breadcrumbs.slice(-limit);
  return slice.map((item) => ({
    ...item,
    ts: new Date(item.ts).toISOString(),
  }));
}

export function getLastBreadcrumb() {
  return breadcrumbs[breadcrumbs.length - 1];
}

export function getLastSqlBreadcrumb() {
  for (let i = breadcrumbs.length - 1; i >= 0; i -= 1) {
    const item = breadcrumbs[i];
    if (item.label.startsWith('SQL')) {
      return item;
    }
  }
  return undefined;
}
