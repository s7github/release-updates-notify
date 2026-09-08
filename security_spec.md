# Security Specification: UpdateNotify PWA

## Data Invariants
1. **User Ownership**: All user-specific data (interests, profiles) must belong to the authenticated user.
2. **Admin Authority**: Only verified admins can modify the master registry and release notes.
3. **Immutability**: Core identity fields (softwareId, version) remain unchanged.

## The "Dirty Dozen" Payloads (Deny Test Cases)
1. **Unauthorized Profile Read**: `GET /users/victim_uid` by `attacker_uid`.
2. **Unauthorized Interest Write**: `POST /interests { userId: 'victim_uid', softwareId: 'node' }` by `attacker_uid`.
3. **Privilege Escalation**: `POST /users/attacker_uid { role: 'admin' }`.
4. **Registry Tampering**: `POST /master_registry { name: 'Hacked' }` by non-admin.
5. **Denial of Wallet (Large ID)**: `GET /master_registry/` + `A * 10000`.
6. **Resource Exhaustion**: `POST /interests { topic: 'Long' * 5000, userId: '...' }`.
7. **Shadow Field Injection**: `POST /users/uid { email: '...', ghost_admin_field: true }`.
8. **PII Leak**: `LIST /users` by any non-admin user.
9. **Cross-Tenant Interest Delete**: `DELETE /interests/int_456` where owner is `user_A`.

## Firestore Rules Draft (Phase 1-3 Helpers)
```javascript
function isSignedIn() { return request.auth != null; }
function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
function isAdmin() { return isSignedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid)); }
function incoming() { return request.resource.data; }
function existing() { return resource.data; }
function isValidId(id) { return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$'); }

function isValidUser(data) {
  return data.uid == request.auth.uid &&
         data.email is string && data.email.size() <= 256 &&
         data.keys().hasAll(['uid', 'email', 'createdAt']) &&
         data.keys().size() <= 10;
}
```
