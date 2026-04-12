const mockGet = jest.fn();
const mockSet = jest.fn();
const mockAdd = jest.fn();
const mockRunTransaction = jest.fn(async (fn) =>
  fn({
    get: jest.fn(async (ref) => ref.get()),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })
);
const mockQueryChain = { where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), get: mockGet };
const mockDocRef = { get: mockGet, set: mockSet, update: jest.fn(), delete: jest.fn(), id: "mock-doc-id" };
const mockCollectionRef = { add: mockAdd, doc: jest.fn(() => mockDocRef), where: mockQueryChain.where, limit: mockQueryChain.limit, orderBy: mockQueryChain.orderBy, get: mockGet };
const mockFirestore = { doc: jest.fn(() => mockDocRef), collection: jest.fn(() => mockCollectionRef), batch: jest.fn(() => ({ set: jest.fn(), update: jest.fn(), delete: jest.fn(), commit: jest.fn(() => Promise.resolve()) })), runTransaction: mockRunTransaction };
jest.mock("firebase-admin", () => { const a = { initializeApp: jest.fn(), firestore: jest.fn(() => mockFirestore), auth: jest.fn(() => ({ getUser: jest.fn(), deleteUser: jest.fn() })) }; a.firestore.FieldValue = { serverTimestamp: jest.fn(() => "TS"), delete: jest.fn(() => "DEL"), arrayRemove: jest.fn((v) => v), arrayUnion: jest.fn((v) => v) }; a.firestore.Timestamp = { now: jest.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) })), fromDate: jest.fn((d) => ({ toDate: () => d, toMillis: () => d.getTime(), seconds: Math.floor(d.getTime() / 1000) })) }; return a; });
jest.mock("firebase-functions/v2/https", () => ({ onCall: jest.fn((o, h) => typeof o === "function" ? o : h), onRequest: jest.fn((o, h) => h), HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } } }));
jest.mock("firebase-functions/v2/scheduler", () => ({ onSchedule: jest.fn((o, h) => h) }));
jest.mock("expo-server-sdk", () => ({ Expo: jest.fn(() => ({ sendPushNotificationsAsync: jest.fn(() => Promise.resolve([])), chunkPushNotifications: jest.fn((m) => [m]), isExpoPushToken: jest.fn(() => true) })) }));
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send: jest.fn(() => Promise.resolve({ id: "eid" })) } })) }));
jest.mock("../emailTemplates", () => ({ buildRecapHTML: jest.fn(() => "<html></html>") }));
module.exports = { mockFirestore, mockDocRef, mockCollectionRef, mockGet, mockSet, mockAdd, mockQueryChain, mockRunTransaction };
