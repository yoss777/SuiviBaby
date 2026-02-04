/**
 * Seed des utilisateurs dans l'émulateur Firestore.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   OWNER_UID=... OWNER_EMAIL=... OWNER_NAME="Owner" \
 *   GUEST_UID=... GUEST_EMAIL=... GUEST_NAME="Guest" \
 *   node scripts/seedUsers.mjs
 */

import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBJUP-b3NPExx-4RfWFLvrbAM5pEfHvAOg",
  authDomain: "samaye-53723.firebaseapp.com",
  databaseURL: "https://samaye-53723-default-rtdb.firebaseio.com",
  projectId: "samaye-53723",
  storageBucket: "samaye-53723.firebasestorage.app",
  messagingSenderId: "222899144223",
  appId: "1:222899144223:web:bdec5b5754d15fc987372a",
  measurementId: "G-SN50WE00WE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
if (emulatorHost) {
  const [host, port] = emulatorHost.split(':');
  connectFirestoreEmulator(db, host, Number(port));
} else {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

const owner = {
  uid: process.env.OWNER_UID,
  email: process.env.OWNER_EMAIL,
  name: process.env.OWNER_NAME ?? 'Owner',
};

const guest = {
  uid: process.env.GUEST_UID,
  email: process.env.GUEST_EMAIL,
  name: process.env.GUEST_NAME ?? 'Guest',
};

function validate(user, label) {
  if (!user.uid || !user.email) {
    throw new Error(`${label} missing OWNER_UID/EMAIL or GUEST_UID/EMAIL`);
  }
}

async function seedUser(user) {
  await setDoc(doc(db, 'users', user.uid), {
    userName: user.name,
    email: user.email,
    createdAt: serverTimestamp(),
  }, { merge: true });
}

async function main() {
  validate(owner, 'OWNER');
  validate(guest, 'GUEST');

  await seedUser(owner);
  await seedUser(guest);

  console.log('✅ Seed users done:', owner.uid, guest.uid);
}

main().catch((err) => {
  console.error('❌ Seed users failed:', err);
  process.exit(1);
});
