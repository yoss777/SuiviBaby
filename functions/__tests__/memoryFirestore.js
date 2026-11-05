/* global jest */
// In-memory Firestore for function tests: documents by full path, equality
// and comparison queries (dotted fields), add(), batches, transactions,
// sub-collections, FieldValue.delete() ("DEL" in setup.js).
const { mockFirestore, mockRunTransaction } = require("./setup");

// ---------------------------------------------------------------------------
function memoryStore(initial) {
  let nextId = 0;
  const docs = new Map(Object.entries(initial));
  const field = (data, dotted) => dotted.split(".").reduce((o, k) => o?.[k], data);
  // Timestamps compare by their milliseconds, like Firestore.
  const comparable = (x) => (x && typeof x.toMillis === "function" ? x.toMillis() : x);
  const matches = (rawActual, op, rawV) => compare(comparable(rawActual), op, comparable(rawV));
  const compare = (actual, op, v) =>
    op === "==" ? actual === v
      : actual === undefined ? false
        : op === "<=" ? actual <= v
          : op === ">=" ? actual >= v
            : op === "<" ? actual < v
              : op === ">" ? actual > v
                : false;
  const applyPatch = (current, patch) => {
    const next = { ...(current || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (k.includes(".")) {
        // update({"a.b": v}) sets a nested field, like Firestore.
        const [head, ...rest] = k.split(".");
        next[head] = applyPatch(next[head], { [rest.join(".")]: v });
      } else if (v === "DEL") delete next[k];
      else next[k] = v;
    }
    return next;
  };
  const ref = (p) => ({
    path: p,
    id: p.split("/").pop(),
    get: async () => (docs.has(p) ? { exists: true, id: p.split("/").pop(), data: () => docs.get(p) } : { exists: false, data: () => undefined }),
    set: async (data, opts) => docs.set(p, opts?.merge ? applyPatch(docs.get(p), data) : data),
    update: async (data) => docs.set(p, applyPatch(docs.get(p), data)),
    delete: async () => docs.delete(p),
    collection: (sub) => query(`${p}/${sub}`),
  });
  const query = (collPath) => {
    const filters = [];
    let max = Infinity;
    const q = {
      where: (field, op, value) => { filters.push([field, op, value]); return q; },
      limit: (n) => { max = n; return q; },
      orderBy: () => q,
      doc: (id) => ref(`${collPath}/${id ?? `auto${(nextId += 1)}`}`),
      add: async (data) => {
        const r = ref(`${collPath}/auto${(nextId += 1)}`);
        await r.set(data);
        return r;
      },
      get: async () => {
        const depth = collPath.split("/").length + 1;
        const hits = [...docs.entries()]
          .filter(([p]) => p.startsWith(`${collPath}/`) && p.split("/").length === depth)
          .filter(([, data]) => filters.every(([f, op, v]) => matches(field(data, f), op, v)))
          .slice(0, max)
          .map(([p, data]) => ({ id: p.split("/").pop(), ref: ref(p), data: () => data }));
        return { empty: hits.length === 0, size: hits.length, docs: hits };
      },
    };
    return q;
  };
  mockFirestore.doc.mockImplementation((p) => ref(p));
  mockFirestore.collection.mockImplementation((name) => query(name));
  mockFirestore.batch.mockImplementation(() => {
    const ops = [];
    return {
      set: (r, d, o) => ops.push(() => r.set(d, o)),
      update: (r, d) => ops.push(() => r.update(d)),
      delete: (r) => ops.push(() => r.delete()),
      commit: async () => { for (const op of ops) await op(); },
    };
  });
  // Transactions: reads see committed data, writes apply at the end; create()
  // fails on an existing document.
  mockRunTransaction.mockReset();
  mockRunTransaction.mockImplementation(async (fn) => {
    const ops = [];
    const result = await fn({
      get: (r) => (typeof r.get === "function" ? r.get() : r),
      create: (r, d) => {
        if (docs.has(r.path)) throw Object.assign(new Error("already exists"), { code: 6 });
        ops.push(() => r.set(d));
      },
      set: (r, d, o) => ops.push(() => r.set(d, o)),
      update: (r, d) => ops.push(() => r.update(d)),
      delete: (r) => ops.push(() => r.delete()),
    });
    for (const op of ops) await op();
    return result;
  });
  return docs;
}


module.exports = { memoryStore };
