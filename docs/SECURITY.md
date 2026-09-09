# Security

The trust model, what enforces it, and what is deliberately still open.

Decisions live in [ADR-0003](adr/0003-server-side-ai-and-polling.md) and
[ADR-0006](adr/0006-firestore-security-model.md). This file is the operational
view.

---

## 1. The two rules everything else follows from

1. **No secret ever reaches a client.** The Gemini key lives in Google Secret
   Manager, mounted into Cloud Run. It has never been in this repository and must
   never be compiled into an APK.
2. **The client is read-mostly.** It writes its own `users/{uid}` document and
   its own `interests`. Nothing else. Firestore rules enforce this and are tested
   in CI.

If a change requires breaking either, it is the wrong change.

---

## 2. What is a secret and what is not

| Thing | Secret? | Where it lives |
|---|---|---|
| **Gemini API key** | **Yes, absolutely** | Secret Manager → Cloud Run |
| Service account keys | **Yes** | Never in the repo; Workload Identity in production |
| Firebase **web** API key | No | `web/firebase-applet-config.json`, committed |
| `google-services.json` | No, but not committed | Per-environment config; see `SETUP.md` |
| Google **web** OAuth client id | No | A Gradle property, not the repo |

The Firebase web API key identifies the project — it is not a credential, and
Google publishes it in their own docs. **Security rules do the protecting**,
which is why those rules being correct matters far more than that key being
hidden.

The Gemini key is the opposite: it authorises billable calls and is a real
secret. The web app calls Gemini from frontend code, which works only because
AI Studio injects the key into a runtime it controls. That pattern does not
transfer to an APK — an APK is a zip archive, and `apktool` recovers string
constants, `BuildConfig` fields and resources in under a minute. Obfuscation
delays this; it does not prevent it.

---

## 3. Firestore trust model

| Collection | Client read | Client write |
|---|---|---|
| `users/{uid}` | own only | own, allow-listed fields only |
| `interests` | own only | own only, validated |
| `master_registry` | signed-in | **none** |
| `release_notes` | signed-in | **none** |
| `background_tasks` | own only | **none** |
| `system_learnings` | admin only | **none** |
| `admins` | signed-in (own role) | **none** |
| anything else | **none** | **none** |

The backend writes with the Admin SDK, which bypasses rules entirely — so
removing client write access costs the pipeline nothing.

### Why the write grants had to go

The inherited rules allowed any signed-in user to create `master_registry` and
`release_notes` documents. That existed so the browser could poll for itself.
It has three consequences that were never intended:

1. **Catalog poisoning.** Anyone could rewrite the entry every user reads.
2. **Forged release notes.** The notifier fans notes out to every subscriber, so
   a forged note is **push spam aimed at the entire user base** — the worst of
   the three by a distance.
3. **Fabricated task progress**, letting a client lie about pipeline state.

None of these need the app. The Firebase config is extractable from any APK and
the Firestore REST API accepts any authenticated request, so a script with a
throwaway Google account was sufficient.

---

## 4. What is tested

`firebase/test/firestore.rules.test.js` — 31 cases, run in CI on every change to
`firebase/`.

The deny suite is the **"Dirty Dozen"** from
[`security-spec-original.md`](security-spec-original.md). That document listed
these payloads; the inherited rules did not actually block several of them.

| # | Payload | Now |
|---|---|---|
| 1 | Read another user's profile | denied |
| 2 | Create an interest owned by someone else | denied |
| 3 | Privilege escalation via `role: 'admin'` | denied |
| 4 | Registry tampering by a non-admin | denied |
| 5 | Denial-of-wallet via a huge document id | denied |
| 6 | Resource exhaustion via an oversized field | denied |
| 7 | Shadow-field injection | denied |
| 8 | Enumerate all users | denied |
| 9 | Delete another user's interest | denied |
| 10 | Forge a release note | denied |
| 11 | Write pipeline task progress | denied |
| 12 | Self-grant admin | denied |

Plus eight further denials (anonymous access, changing your own email or uid,
reassigning an interest's owner, an interest claiming to be both software and
topic, unbounded token lists, unknown collections) and eleven allow cases
covering every operation the app performs — because rules that deny everything
are easy and useless.

**Changing `firestore.rules` without updating these tests is not acceptable.**
Untested security rules are guesses.

---

## 5. Admin access

Membership is the existence of `admins/{uid}`. No client can write that
collection.

The inherited rules hardcoded an email address inside `firestore.rules`:

```javascript
request.auth.token.email == "saurabh257@gmail.com"   // removed
```

That is a credential in a world-readable file, it breaks when the address
changes, and it cannot be revoked without a deploy. Membership as data can be
granted and revoked as an operation.

Bootstrapping the first admin is a deliberate manual console step — see
[`SETUP.md`](SETUP.md) §7. There is no in-app path to self-promote.

---

## 6. Known gaps

Recorded honestly. None is currently exploited; all are real.

| Gap | Risk | Fix |
|---|---|---|
| **No Firebase App Check** | Any client, modified or scripted, can hit Firestore with a valid token | Add Play Integrity App Check. Defence in depth — rules are the control, this raises the cost of scripted abuse |
| **No rate limiting on the `api` service** | Discovery spends Gemini money per call; a loop is a billing attack | Per-user quota in the `api` service before it ships. **Do this with the service, not after** |
| **Interest duplicates** | Old random-id documents let one user follow the same thing twice, doubling notifications | De-duplication pass; new writes already use deterministic ids |
| **No account deletion path** | GDPR/CCPA erasure requests cannot be served | Backend endpoint deleting `users/{uid}`, their `interests`, and their tokens |
| **`rawData` on release notes** | Stores 5 KB of scraped source text; low risk but it is untrusted third-party content kept indefinitely | Debug-only field. Consider a TTL policy |
| **No secret scanning in CI** | A key could be committed without anything noticing | Enable GitHub secret scanning and push protection |

---

## 7. If a key leaks

1. **Revoke first, investigate second.** Rotate the Gemini key in Google Cloud
   immediately; check billing for unexpected spend.
2. Rewriting git history does **not** un-leak a key. Anything pushed to GitHub
   should be considered public forever. Rotate, then optionally clean history.
3. For a service account: disable the key in IAM, then audit Cloud Audit Logs
   for what used it.

---

## 8. Reporting

This is a private project with no published disclosure process. If that changes,
add a `SECURITY.md` at the repository root with a contact address — GitHub
surfaces that file specifically.
