/**
 * Firestore security rules tests.
 *
 * The deny cases are taken from the "Dirty Dozen" payload list in
 * docs/security-spec-original.md. That document identified them; the inherited
 * rules did not actually block several of them. These tests are what turns the
 * list from an aspiration into a build gate.
 *
 * Run: npm run test:rules   (starts the Firestore emulator, runs this file)
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const fs = require('node:fs');
const path = require('node:path');

const {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where,
} = require('firebase/firestore');

const VICTIM = 'victim_uid';
const ATTACKER = 'attacker_uid';
const ADMIN = 'admin_uid';

let testEnv;

/** A signed-in, non-admin user. */
const asUser = (uid) => testEnv.authenticatedContext(uid).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'updatenotify-test',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Seed with rules disabled — this is the backend's Admin SDK view.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', ADMIN), {
      email: 'admin@example.com',
      seededAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'users', VICTIM), {
      uid: VICTIM,
      email: 'victim@example.com',
      displayName: 'Victim',
      photoURL: null,
      createdAt: new Date().toISOString(),
      settings: {
        notifyFeatures: true, notifySecurity: true,
        notifyFixes: true, notifyOptimizations: true,
      },
    });
    await setDoc(doc(db, 'master_registry', 'fl-studio'), {
      name: 'FL Studio', slug: 'fl-studio', type: 'software', active: true,
    });
    await setDoc(doc(db, 'release_notes', 'fl-studio-25-2-5'), {
      softwareId: 'fl-studio', softwareName: 'FL Studio', version: '25.2.5',
      category: 'New Features', summary: 'Things', isGenuineUpdate: true,
      createdAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'interests', `${VICTIM}_fl-studio`), {
      userId: VICTIM, softwareId: 'fl-studio', topic: null,
      softwareName: 'FL Studio', type: 'software', following: true,
      createdAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'background_tasks', 'task1'), {
      type: 'initial_poll', status: 'processing', softwareId: 'fl-studio',
      softwareName: 'FL Studio', progress: 40, message: 'Working',
      requestedBy: VICTIM,
    });
  });
});

// ---------------------------------------------------------------------------
// The Dirty Dozen — every one of these must be denied.
// ---------------------------------------------------------------------------

describe('Dirty Dozen deny cases', () => {
  it('1. an attacker cannot read another user profile', async () => {
    await assertFails(getDoc(doc(asUser(ATTACKER), 'users', VICTIM)));
  });

  it('2. an attacker cannot create an interest owned by someone else', async () => {
    await assertFails(setDoc(doc(asUser(ATTACKER), 'interests', 'forged'), {
      userId: VICTIM, softwareId: 'fl-studio', topic: null,
      softwareName: 'FL Studio', type: 'software', following: true,
      createdAt: new Date().toISOString(),
    }));
  });

  it('3. privilege escalation via a role field is rejected', async () => {
    await assertFails(setDoc(doc(asUser(ATTACKER), 'users', ATTACKER), {
      uid: ATTACKER, email: 'attacker@example.com',
      createdAt: new Date().toISOString(),
      role: 'admin',
    }));
  });

  it('4. a non-admin cannot tamper with the shared catalog', async () => {
    await assertFails(setDoc(doc(asUser(ATTACKER), 'master_registry', 'fl-studio'), {
      name: 'Hacked', slug: 'fl-studio', type: 'software', active: true,
    }));
  });

  it('5. an absurdly long document id is rejected', async () => {
    // "Denial of Wallet": huge keys cost storage and index space.
    const hugeId = 'A'.repeat(1500);
    await assertFails(setDoc(doc(asUser(ATTACKER), 'interests', hugeId), {
      userId: ATTACKER, softwareId: hugeId, topic: null,
      softwareName: 'x', type: 'software', following: true,
      createdAt: new Date().toISOString(),
    }));
  });

  it('6. an oversized field is rejected', async () => {
    await assertFails(setDoc(doc(asUser(ATTACKER), 'interests', `${ATTACKER}_topic_big`), {
      userId: ATTACKER, softwareId: null, topic: 'Long'.repeat(5000),
      softwareName: 'big', type: 'topic', following: true,
      createdAt: new Date().toISOString(),
    }));
  });

  it('7. a shadow field on a user profile is rejected', async () => {
    await assertFails(setDoc(doc(asUser(ATTACKER), 'users', ATTACKER), {
      uid: ATTACKER, email: 'attacker@example.com',
      createdAt: new Date().toISOString(),
      ghost_admin_field: true,
    }));
  });

  it('8. a non-admin cannot enumerate users', async () => {
    await assertFails(getDocs(collection(asUser(ATTACKER), 'users')));
  });

  it('9. an attacker cannot delete another user interest', async () => {
    await assertFails(deleteDoc(doc(asUser(ATTACKER), 'interests', `${VICTIM}_fl-studio`)));
  });

  it('10. a client cannot forge a release note', async () => {
    // The worst of the set: the notifier fans release notes out to every
    // subscriber, so a forged note is push spam aimed at the whole user base.
    await assertFails(setDoc(doc(asUser(ATTACKER), 'release_notes', 'fl-studio-99-0'), {
      softwareId: 'fl-studio', softwareName: 'FL Studio', version: '99.0',
      category: 'Security Patches', summary: 'Click here',
      isGenuineUpdate: true, createdAt: new Date().toISOString(),
    }));
  });

  it('11. a client cannot write pipeline task progress', async () => {
    await assertFails(updateDoc(doc(asUser(ATTACKER), 'background_tasks', 'task1'), {
      status: 'completed', progress: 100,
    }));
  });

  it('12. a client cannot grant itself admin', async () => {
    await assertFails(setDoc(doc(asUser(ATTACKER), 'admins', ATTACKER), {
      email: 'attacker@example.com', seededAt: new Date().toISOString(),
    }));
  });
});

// ---------------------------------------------------------------------------
// Additional denials
// ---------------------------------------------------------------------------

describe('additional deny cases', () => {
  it('anonymous users get nothing', async () => {
    await assertFails(getDoc(doc(asAnon(), 'master_registry', 'fl-studio')));
    await assertFails(getDoc(doc(asAnon(), 'release_notes', 'fl-studio-25-2-5')));
  });

  it('a user cannot change their own email or uid', async () => {
    await assertFails(updateDoc(doc(asUser(VICTIM), 'users', VICTIM), {
      email: 'someone-else@example.com',
    }));
    await assertFails(updateDoc(doc(asUser(VICTIM), 'users', VICTIM), { uid: ATTACKER }));
  });

  it('an interest cannot claim to be both software and topic', async () => {
    await assertFails(setDoc(doc(asUser(ATTACKER), 'interests', `${ATTACKER}_both`), {
      userId: ATTACKER, softwareId: 'fl-studio', topic: 'also a topic',
      softwareName: 'x', type: 'software', following: true,
      createdAt: new Date().toISOString(),
    }));
  });

  it('an interest owner cannot be reassigned by update', async () => {
    await assertFails(updateDoc(doc(asUser(ATTACKER), 'interests', `${VICTIM}_fl-studio`), {
      userId: ATTACKER,
    }));
  });

  it('a user cannot read another user pipeline task', async () => {
    await assertFails(getDoc(doc(asUser(ATTACKER), 'background_tasks', 'task1')));
  });

  it('a non-admin cannot read the self-correction audit log', async () => {
    await assertFails(getDocs(collection(asUser(ATTACKER), 'system_learnings')));
  });

  it('an unknown collection is denied by the default rule', async () => {
    await assertFails(setDoc(doc(asUser(ATTACKER), 'not_a_real_collection', 'x'), { a: 1 }));
  });

  it('an unbounded fcmTokens list is rejected', async () => {
    await assertFails(updateDoc(doc(asUser(VICTIM), 'users', VICTIM), {
      fcmTokens: Array.from({ length: 50 }, (_, i) => `token${i}`),
    }));
  });
});

// ---------------------------------------------------------------------------
// The app must still work. Rules that deny everything are easy and useless.
// ---------------------------------------------------------------------------

describe('allow cases the app depends on', () => {
  it('a user reads their own profile', async () => {
    await assertSucceeds(getDoc(doc(asUser(VICTIM), 'users', VICTIM)));
  });

  it('a user updates their own notification settings', async () => {
    await assertSucceeds(updateDoc(doc(asUser(VICTIM), 'users', VICTIM), {
      settings: {
        notifyFeatures: false, notifySecurity: true,
        notifyFixes: true, notifyOptimizations: false,
      },
    }));
  });

  it('a user registers a push token', async () => {
    await assertSucceeds(updateDoc(doc(asUser(VICTIM), 'users', VICTIM), {
      fcmTokens: ['device-token-1'],
    }));
  });

  it('a user follows software with a deterministic id', async () => {
    await assertSucceeds(setDoc(doc(asUser(ATTACKER), 'interests', `${ATTACKER}_fl-studio`), {
      userId: ATTACKER, softwareId: 'fl-studio', topic: null,
      softwareName: 'FL Studio', type: 'software', following: true,
      createdAt: new Date().toISOString(),
    }));
  });

  it('a user follows a free-text topic', async () => {
    await assertSucceeds(setDoc(doc(asUser(ATTACKER), 'interests', `${ATTACKER}_topic_macos`), {
      userId: ATTACKER, softwareId: null, topic: 'macOS',
      softwareName: 'macOS', type: 'topic', following: true,
      createdAt: new Date().toISOString(),
    }));
  });

  it('a user unfollows their own interest', async () => {
    await assertSucceeds(deleteDoc(doc(asUser(VICTIM), 'interests', `${VICTIM}_fl-studio`)));
  });

  it('any signed-in user reads the catalog and release notes', async () => {
    await assertSucceeds(getDoc(doc(asUser(ATTACKER), 'master_registry', 'fl-studio')));
    await assertSucceeds(getDoc(doc(asUser(ATTACKER), 'release_notes', 'fl-studio-25-2-5')));
  });

  it('a user lists only their own interests', async () => {
    const db = asUser(VICTIM);
    await assertSucceeds(
      getDocs(query(collection(db, 'interests'), where('userId', '==', VICTIM))),
    );
  });

  it('a user watches a pipeline job they requested', async () => {
    await assertSucceeds(getDoc(doc(asUser(VICTIM), 'background_tasks', 'task1')));
  });

  it('a client resolves its own admin role', async () => {
    await assertSucceeds(getDoc(doc(asUser(ATTACKER), 'admins', ATTACKER)));
  });

  it('an admin reads any profile and the audit log', async () => {
    await assertSucceeds(getDoc(doc(asUser(ADMIN), 'users', VICTIM)));
    await assertSucceeds(getDocs(collection(asUser(ADMIN), 'system_learnings')));
  });
});
