const documents = new Map();
let readCount = 0;

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function matchesPrefix(path, prefix) {
  return path.startsWith(`${prefix}/`) && path.slice(prefix.length + 1).split('/').length === 1;
}

function snapshot(path) {
  const value = documents.get(path);
  return { exists: () => value !== undefined, data: () => clone(value), ref: doc(path) };
}

function apply(path, value, merge) {
  const resolved = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry && entry.__increment !== undefined) {
      resolved[key] = (documents.get(path)?.[key] ?? 0) + entry.__increment;
    } else {
      resolved[key] = entry;
    }
  }
  documents.set(path, merge ? { ...(documents.get(path) ?? {}), ...clone(resolved) } : clone(resolved));
}

function doc(path) {
  return {
    get: async () => {
      readCount += 1;
      return snapshot(path);
    },
    set: async (value, options) => apply(path, value, options?.merge),
    update: async (value) => apply(path, value, true),
    delete: async () => documents.delete(path),
    collection: (name) => collection(`${path}/${name}`),
    onSnapshot: (next) => {
      next(snapshot(path));
      return () => {};
    },
  };
}

function matchesFilter(value, filter) {
  const actual = value[filter.field];
  if (filter.operator === '==') return actual === filter.value;
  if (filter.operator === '>') return actual > filter.value;
  if (filter.operator === '>=') return actual >= filter.value;
  if (filter.operator === '<') return actual < filter.value;
  if (filter.operator === '<=') return actual <= filter.value;
  return false;
}

function collection(path, options = {}) {
  const order = options.order ?? null;
  const filters = options.filters ?? [];
  const query = {
    doc: (id) => doc(`${path}/${id}`),
    where: (field, operator, value) => collection(path, {
      ...options,
      filters: [...filters, { field, operator, value }],
    }),
    orderBy: (field, direction = 'asc') => collection(path, {
      ...options,
      order: { field, direction },
    }),
    async get() {
      let docs = [...documents.entries()]
        .filter(([key]) => matchesPrefix(key, path))
        .filter(([, value]) => filters.every((filter) => matchesFilter(value, filter)))
        .map(([key, value]) => ({ id: key.split('/').pop(), ref: doc(key), data: () => clone(value) }));
      if (order) docs = docs.sort((a, b) => ((a.data()[order.field] ?? 0) - (b.data()[order.field] ?? 0)) * (order.direction === 'desc' ? -1 : 1));
      readCount += docs.length;
      return { docs, size: docs.length };
    },
    onSnapshot(next) {
      query.get().then(next);
      return () => {};
    },
  };
  return query;
}

function collectionGroup(name, filters = []) {
  const query = {
    where: (field, operator, value) => collectionGroup(name, [...filters, { field, operator, value }]),
    async get() {
      const docs = [...documents.entries()]
        .filter(([key]) => key.split('/').slice(-2, -1)[0] === name)
        .filter(([, value]) => filters.every((filter) => filter.operator === '==' && value[filter.field] === filter.value))
        .map(([key, value]) => ({ id: key.split('/').pop(), ref: doc(key), data: () => clone(value) }));
      readCount += docs.length;
      return { docs, size: docs.length };
    },
  };
  return query;
}

const db = {
  collection: (name) => collection(name),
  collectionGroup: (name) => collectionGroup(name),
  batch() {
    const actions = [];
    return {
      set: (reference, value, options) => actions.push(() => reference.set(value, options)),
      update: (reference, value) => actions.push(() => reference.update(value)),
      delete: (reference) => actions.push(() => reference.delete()),
      commit: async () => Promise.all(actions.map((action) => action())),
    };
  },
  async runTransaction(callback) {
    return callback({ get: (reference) => reference.get(), set: (reference, value) => reference.set(value), update: (reference, value) => reference.update(value), delete: (reference) => reference.delete() });
  },
};

function firestore() {
  return db;
}

firestore.FieldValue = {
  increment: (amount) => ({ __increment: amount }),
  serverTimestamp: () => ({ milliseconds: Date.now() }),
};
firestore.Timestamp = { fromMillis: (milliseconds) => ({ milliseconds }) };
firestore.__reset = () => {
  documents.clear();
  readCount = 0;
};
firestore.__resetReadCount = () => {
  readCount = 0;
};
firestore.__getReadCount = () => readCount;
module.exports = firestore;
