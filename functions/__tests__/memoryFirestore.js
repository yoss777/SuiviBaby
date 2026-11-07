/* global jest */
// In-memory Firestore for function tests: documents by full path, equality
// and comparison queries (dotted fields), add(), batches, transactions,
// sub-collections, FieldValue.delete() ("DEL" in setup.js).
//
// Stricter than a plain map, on purpose (revue ECC) :
// - une transaction qui lit après avoir écrit échoue, comme Firestore ;
// - orderBy écarte les documents sans le champ trié, comme Firestore ;
// - update({"a.b": x}) échoue si `a` existe mais n'est pas une map (null,
//   scalaire) : Firestore n'est pas garanti de le convertir, le code de
//   production doit écrire la map entière dans ce cas ;
// - option { txRetries, beforeRetry } : la transaction rejoue sa fonction
//   txRetries fois (écritures de la tentative écartées), beforeRetry(docs,
//   attempt, chemins écrits par la tentative) simulant une écriture concurrente entre deux tentatives.
const { mockFirestore, mockRunTransaction } = require("./setup");

const isPlainMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && typeof v.toMillis !== "function";

// ---------------------------------------------------------------------------
function memoryStore(initial, { txRetries = 0, beforeRetry } = {}) {
  let nextId = 0;
  const docs = new Map(Object.entries(initial));
  const field = (data, dotted) => dotted.split(".").reduce((o, k) => o?.[k], data);
  // Timestamps compare by their milliseconds, like Firestore.
  const comparable = (x) => (x && typeof x.toMillis === "function" ? x.toMillis() : x);
  const matches = (rawActual, op, rawV) => compare(comparable(rawActual), op, comparable(rawV));
  const compare = (actual, op, v) =>
    op === "==" ? actual === v
      : op === "in" ? Array.isArray(v) && v.includes(actual)
      : actual === undefined ? false
        : op === "<=" ? actual <= v
          : op === ">=" ? actual >= v
            : op === "<" ? actual < v
              : op === ">" ? actual > v
                : false;
  const applyPatch = (current, patch, strict = false) => {
    const next = { ...(current || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (k.includes(".")) {
        // update({"a.b": v}) sets a nested field, like Firestore.
        const [head, ...rest] = k.split(".");
        if (strict && next[head] !== undefined && !isPlainMap(next[head])) {
          throw Object.assign(new Error(`INVALID_ARGUMENT: "${head}" is not a map, cannot update "${k}"`), { code: 3 });
        }
        next[head] = applyPatch(next[head], { [rest.join(".")]: v }, strict);
      } else if (v === "DEL") delete next[k];
      else if (v && typeof v === "object" && "__increment" in v) next[k] = (Number(next[k]) || 0) + v.__increment;
      else next[k] = v;
    }
    return next;
  };
  const ref = (p) => ({
    path: p,
    id: p.split("/").pop(),
    get: async () => (docs.has(p) ? { exists: true, id: p.split("/").pop(), data: () => docs.get(p) } : { exists: false, data: () => undefined }),
    set: async (data, opts) => {
      if (opts?.mergeFields) {
        // Only the listed fields are written, each replaced as a whole (no deep merge).
        const picked = Object.fromEntries(opts.mergeFields.map((f) => [f, data[f]]));
        docs.set(p, { ...(docs.get(p) || {}), ...picked });
      } else docs.set(p, opts?.merge ? applyPatch(docs.get(p), data) : data);
    },
    update: async (data) => {
      // Like Firestore: update() fails on a missing document.
      if (!docs.has(p)) throw Object.assign(new Error(`NOT_FOUND: ${p}`), { code: 5 });
      docs.set(p, applyPatch(docs.get(p), data, true));
    },
    delete: async () => docs.delete(p),
    collection: (sub) => query(`${p}/${sub}`),
  });
  const query = (collPath, { group = false } = {}) => {
    const filters = [];
    const orders = [];
    let max = Infinity;
    let after = null;
    const q = {
      where: (field, op, value) => { filters.push([field, op, value]); return q; },
      limit: (n) => { max = n; return q; },
      // orderBy sorts (so limit(1) returns the latest); "__name__" sorts by path.
      orderBy: (f, dir = "asc") => { orders.push([f, dir]); return q; },
      startAfter: (snap) => { after = snap.ref.path; return q; },
      doc: (id) => ref(`${collPath}/${id ?? `auto${(nextId += 1)}`}`),
      add: async (data) => {
        const r = ref(`${collPath}/auto${(nextId += 1)}`);
        await r.set(data);
        return r;
      },
      get: async () => {
        const depth = collPath.split("/").length + 1;
        const inCollection = (p) => {
          const parts = p.split("/");
          return group
            ? parts.length % 2 === 0 && parts[parts.length - 2] === collPath
            : p.startsWith(`${collPath}/`) && parts.length === depth;
        };
        const sortKey = (p, data, f) => (f === "__name__" ? p : comparable(field(data, f)));
        const hits = [...docs.entries()]
          .filter(([p]) => inCollection(p))
          .filter(([p]) => after === null || p > after)
          // Firestore leaves out the documents that lack an orderBy field.
          .filter(([, data]) => orders.every(([f]) => f === "__name__" || field(data, f) !== undefined))
          .filter(([, data]) => filters.every(([f, op, v]) => matches(field(data, f), op, v)))
          .sort(([pa, a], [pb, b]) => {
            for (const [f, dir] of orders) {
              const x = sortKey(pa, a, f);
              const y = sortKey(pb, b, f);
              if (x === y) continue;
              return (x < y ? -1 : 1) * (dir === "desc" ? -1 : 1);
            }
            return 0;
          })
          .slice(0, max)
          .map(([p, data]) => ({ id: p.split("/").pop(), ref: ref(p), data: () => data }));
        return { empty: hits.length === 0, size: hits.length, docs: hits };
      },
    };
    return q;
  };
  mockFirestore.doc.mockImplementation((p) => ref(p));
  // Le vrai SDK lève si getAll() ne reçoit aucun document.
  mockFirestore.getAll.mockImplementation(async (...refs) => {
    if (refs.length === 0) throw new Error("Function Firestore.getAll() requires at least 1 argument, but was called with 0 arguments.");
    return Promise.all(refs.map((r) => r.get()));
  });
  mockFirestore.collection.mockImplementation((name) => query(name));
  mockFirestore.collectionGroup = jest.fn((name) => query(name, { group: true }));
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
  // fails on an existing document; a read after a write throws.
  mockRunTransaction.mockReset();
  mockRunTransaction.mockImplementation(async (fn) => {
    for (let attempt = 0; ; attempt += 1) {
      const ops = [];
      const paths = []; // documents écrits par cette tentative
      const guardRead = () => {
        if (ops.length > 0) {
          throw new Error("Firestore transactions require all reads to be executed before all writes.");
        }
      };
      const result = await fn({
        get: (r) => {
          guardRead();
          return typeof r.get === "function" ? r.get() : r;
        },
        create: (r, d) => {
          if (docs.has(r.path)) throw Object.assign(new Error("already exists"), { code: 6 });
          paths.push(r.path);
          ops.push(() => r.set(d));
        },
        set: (r, d, o) => { paths.push(r.path); ops.push(() => r.set(d, o)); },
        update: (r, d) => { paths.push(r.path); ops.push(() => r.update(d)); },
        delete: (r) => { paths.push(r.path); ops.push(() => r.delete()); },
      });
      if (attempt < txRetries) {
        // Contention: this attempt's writes are dropped and the function runs again.
        if (beforeRetry) await beforeRetry(docs, attempt, paths);
        continue;
      }
      for (const op of ops) await op();
      return result;
    }
  });
  return docs;
}


module.exports = { memoryStore };
