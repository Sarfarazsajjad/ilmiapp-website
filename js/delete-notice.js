// Pending "account deleted" notice. Pure logic, no DOM, so Node can test it
// (see check-delete-notice.mjs). Stores ONLY an outcome code and a timestamp:
// never an email, token or any personal data.
export const KEY = "ilmiDeletePending";
export const OUTCOMES = ["revoked", "no_reference", "failed", "not_subscribed"];

// Server field `subscriptionCancellation`. 'cancelled' and 'revoked' both mean success.
// Anything unknown or missing is treated as 'failed' (tells the user to cancel themselves).
export function normalizeOutcome(v) {
  if (v === "revoked" || v === "cancelled") return "revoked";
  if (v === "no_reference") return "no_reference";
  if (v === "not_subscribed") return "not_subscribed";
  return "failed";
}

const memory = { value: null }; // last resort when no storage works
function stores(env) {
  const out = [];
  for (const name of ["localStorage", "sessionStorage"]) {
    try {
      if (env[name]) out.push(env[name]);
    } catch {
      /* accessing the property can throw */
    }
  }
  return out;
}

// Returns where it was saved: "local" | "session" | "memory".
export function savePending(outcome, env = globalThis, now = Date.now()) {
  const raw = JSON.stringify({ outcome: normalizeOutcome(outcome), at: now });
  const names = ["local", "session"];
  const list = stores(env);
  for (let i = 0; i < list.length; i++) {
    try {
      list[i].setItem(KEY, raw);
      if (list[i].getItem(KEY) === raw) return names[i];
    } catch {
      /* quota / blocked: try the next store */
    }
  }
  memory.value = raw;
  return "memory";
}

// Returns {outcome, at} or null. Looks in every store, then memory.
export function loadPending(env = globalThis) {
  const raws = [];
  for (const s of stores(env)) {
    try {
      raws.push(s.getItem(KEY));
    } catch {
      /* ignore */
    }
  }
  raws.push(memory.value);
  for (const raw of raws) {
    if (!raw) continue;
    try {
      const o = JSON.parse(raw);
      if (OUTCOMES.includes(o.outcome)) return { outcome: o.outcome, at: o.at };
    } catch {
      /* corrupt entry: ignore */
    }
  }
  return null;
}

// Only call from the explicit "I have read this" click.
export function clearPending(env = globalThis) {
  memory.value = null;
  for (const s of stores(env)) {
    try {
      s.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

const NOTICE_BOLD = "Refunds are handled by Google Play, not by us.";
const STEPS =
  "To cancel yourself: open Google Play → profile icon → Payments & subscriptions → Subscriptions → ilmi → Cancel subscription.";

// ok = styled as success. bold + rest together form the refund notice.
export const RESULTS = {
  // No subscription on the account: nothing to say about subscriptions or refunds.
  not_subscribed: {
    ok: true,
    title: "Your account has been deleted",
    text: "Your ILMI account and all of its data have been deleted, and you have been signed out of this page.",
    bold: "",
    rest: "",
    steps: false,
  },
  revoked: {
    ok: true,
    title: "Your account has been deleted",
    text: "Your ILMI account and all of its data have been deleted, and you have been signed out of this page. Your subscription has been revoked: access ended immediately and it will not renew.",
    bold: NOTICE_BOLD,
    rest: " Deleting your account ends your subscription immediately and Google Play refunds your latest payment. If you have not received it or have questions, contact Google Play support.",
    steps: false,
  },
  no_reference: {
    ok: false,
    title: "Your account has been deleted, but check your subscription",
    text: "Your ILMI account and all of its data have been deleted, and you have been signed out of this page. We could not find a subscription linked to this account, so nothing was revoked. If you have one, please cancel it yourself in Google Play.",
    bold: NOTICE_BOLD,
    rest: " Contact Google Play support about any refund.",
    steps: STEPS,
  },
  failed: {
    ok: false,
    title:
      "Your account has been deleted, but your subscription was not revoked",
    text: "Your ILMI account and all of its data have been deleted, and you have been signed out of this page. We could not revoke your Google Play subscription, so it may still renew. Please cancel it yourself in Google Play now.",
    bold: NOTICE_BOLD,
    rest: " Contact Google Play support about any refund.",
    steps: STEPS,
  },
};
