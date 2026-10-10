// Run: node check-delete-notice.mjs   (no dependencies)
import assert from "node:assert/strict";
import * as n from "./js/delete-notice.js";

const mk = () => {
  const d = {};
  return {
    d,
    setItem: (k, v) => (d[k] = String(v)),
    getItem: (k) => d[k] ?? null,
    removeItem: (k) => delete d[k],
  };
};
const broken = {
  setItem() {
    throw new Error("blocked");
  },
  getItem() {
    throw new Error("blocked");
  },
  removeItem() {
    throw new Error("blocked");
  },
};

// outcome mapping
assert.equal(n.normalizeOutcome("cancelled"), "revoked");
assert.equal(n.normalizeOutcome("revoked"), "revoked");
assert.equal(n.normalizeOutcome("no_reference"), "no_reference");
assert.equal(n.normalizeOutcome("failed"), "failed");
assert.equal(n.normalizeOutcome("not_subscribed"), "not_subscribed");
assert.equal(n.normalizeOutcome(undefined), "failed");
assert.equal(n.RESULTS.revoked.ok, true);
assert.equal(n.RESULTS.failed.ok, false);
assert.equal(n.RESULTS.no_reference.ok, false);

// localStorage path; survives "reload" (a second load call); only code + timestamp stored
let env = { localStorage: mk(), sessionStorage: mk() };
assert.equal(n.savePending("cancelled", env, 123), "local");
assert.deepEqual(n.loadPending(env), { outcome: "revoked", at: 123 });
assert.deepEqual(n.loadPending(env), { outcome: "revoked", at: 123 });
assert.deepEqual(Object.keys(JSON.parse(env.localStorage.d[n.KEY])).sort(), [
  "at",
  "outcome",
]);
n.clearPending(env);
assert.equal(n.loadPending(env), null);

// localStorage blocked -> sessionStorage
env = { localStorage: broken, sessionStorage: mk() };
assert.equal(n.savePending("failed", env, 1), "session");
assert.equal(n.loadPending(env).outcome, "failed");
n.clearPending(env);
assert.equal(n.loadPending(env), null);

// both blocked -> in-page memory
env = { localStorage: broken, sessionStorage: broken };
assert.equal(n.savePending("no_reference", env, 2), "memory");
assert.equal(n.loadPending(env).outcome, "no_reference");
n.clearPending(env);
assert.equal(n.loadPending(env), null);

// corrupt entry ignored; nothing stored -> null
env = { localStorage: mk(), sessionStorage: mk() };
env.localStorage.d[n.KEY] = "{not json";
assert.equal(n.loadPending(env), null);
console.log("delete-notice: all checks passed");
