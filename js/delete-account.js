// Parent account deletion (K131). The Firebase Auth web SDK from Google's CDN is
// the only third-party code on this page. Nothing here logs, stores or tracks.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  normalizeOutcome,
  savePending,
  loadPending,
  clearPending,
  RESULTS,
} from "./delete-notice.js";

// Firebase WEB config. Safe to publish: Firebase documents these values as public identifiers,
// not secrets (https://firebase.google.com/docs/projects/api-keys). They only tell the SDK which
// project to talk to; access is enforced by Firebase Auth and by our server, never by hiding them.
//   apiKey     - identifies this project to Firebase's public Auth endpoints. NOT an
//                authorization credential; restrict it to this site in Google Cloud Console.
//   authDomain - domain that hosts the Google sign-in popup/redirect handler.
//   projectId  - the Firebase project's unique id.
//   appId      - identifies this web app registration inside the project.
// Never put here: a service-account JSON, a private key or any server secret.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyARAC7mEuSCODXhWr-EjDVeezRrkFQ3NNM",
  authDomain: "ilmi-e08cd.firebaseapp.com",
  projectId: "ilmi-e08cd",
  appId: "1:500046081203:web:a3c3eb030b0273367d54c6",
};

const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8000/api"
    : "https://api.ilmiapp.com";

const $ = (id) => document.getElementById(id);
const statusBox = $("daStatus");
const configured = !Object.values(FIREBASE_CONFIG).some((v) =>
  v.startsWith("REPLACE_"),
);

function say(text, kind = "") {
  statusBox.textContent = text;
  statusBox.className = "da-status" + (kind ? ` da-${kind}` : "");
  statusBox.hidden = !text;
}

let auth = null;
let busy = false;

function syncDeleteButton() {
  $("daDelete").disabled =
    busy || !($("daAck").checked && $("daType").value === "DELETE");
}

// True while the post-deletion notice is on screen. While true, nothing may
// bring back the sign-in or confirm views (the user is signed out after deletion).
let pendingShown = false;

function showPending(p) {
  const r = RESULTS[p.outcome];
  pendingShown = true;
  $("daMain").hidden = true;
  $("daResult").hidden = false;
  $("daResultTitle").textContent = r.title;
  $("daResultBox").className = "da-status " + (r.ok ? "da-ok" : "da-error");
  $("daResultText").textContent = r.text;
  const n = $("daResultNotice");
  n.textContent = "";
  const b = document.createElement("strong");
  b.textContent = r.bold;
  n.append(b, r.rest);
  n.hidden = !r.bold;
  $("daResultSteps").hidden = !r.steps;
  $("daResultSteps").textContent = r.steps || "";
}

function showSignedIn(user) {
  if (pendingShown) return;
  $("daStepSignIn").hidden = !!user;
  $("daStepConfirm").hidden = !user;
  const email = user ? user.email || "(no email on this account)" : "";
  $("daEmail").textContent = email;
  $("daDialogEmail").textContent = email;
  $("daAck").checked = false;
  $("daType").value = "";
  syncDeleteButton();
}

async function endSession() {
  try {
    await signOut(auth);
  } catch {
    /* nothing useful to do */
  }
  showSignedIn(null);
}

// signInWithPopup MUST be the very first await in this function.
// Any await before it breaks the browser's user-gesture chain and the popup is blocked.
async function startSignIn(provider) {
  say("");
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = e && e.code;
    if (
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, provider);
    } else if (
      code !== "auth/popup-closed-by-user" &&
      code !== "auth/cancelled-popup-request"
    ) {
      say("Sign-in did not work. Please try again.", "error");
    }
  }
}

async function deleteAccount() {
  if (busy) return;
  busy = true;
  syncDeleteButton();
  $("daDialog").close();
  $("daBusy").hidden = false; // full-page loader until the server answers
  statusBox.innerHTML =
    '<span class="da-spinner"></span> Deleting your account. Please wait…';
  statusBox.className = "da-status";
  statusBox.hidden = false;
  $("daConfirm").disabled = true;
  $("daCancel").disabled = true;
  let outcome;
  let cancellation;
  try {
    const idToken = await auth.currentUser.getIdToken(true);
    const res = await fetch(`${API_BASE}/parents/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ idToken }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.status === "deleted") {
      outcome = "deleted";
      // Persist the moment the response arrives, before anything else can fail.
      cancellation = normalizeOutcome(body.subscriptionCancellation);
      savePending(cancellation);
    } else if (res.status === 404 && body.status === "not_found")
      outcome = "not_found";
    else if (res.status === 401 && body.code === "REAUTH_REQUIRED")
      outcome = "reauth";
    else outcome = "error";
  } catch {
    outcome = "error";
  }
  busy = false;
  $("daBusy").hidden = true;
  $("daConfirm").disabled = false;
  $("daCancel").disabled = false;
  if (outcome === "deleted") {
    showPending({ outcome: cancellation });
    say("");
    await endSession();
    return;
  }
  await endSession();
  if (outcome === "not_found") {
    say(
      "We could not find an ILMI account for this sign-in. Nothing was deleted. Check that you used the same Google account as in the app.",
      "error",
    );
  } else if (outcome === "reauth") {
    say(
      "For your safety, please sign in again and then delete straight away.",
      "error",
    );
  } else {
    say(
      "Something went wrong and your account may not be deleted. Please try again, or email info@itretina.com.",
      "error",
    );
  }
}

async function init() {
  // FIRST: a pending result must show on every load until acknowledged, before
  // any sign-in view and even if Firebase is not configured or fails to load.
  const pending = loadPending();
  if (pending) showPending(pending);
  $("daResultAck").addEventListener("click", () => {
    clearPending(); // the ONLY place a pending notice is cleared
    pendingShown = false;
    $("daResult").hidden = true;
    $("daMain").hidden = false;
    showSignedIn(auth ? auth.currentUser : null);
  });

  if (!configured) {
    say(
      "Account deletion on this page is not available yet. Please use the app (Profile \u2192 Settings \u2192 Delete Account) or email info@itretina.com.",
      "error",
    );
    $("daGoogle").disabled = true;
    return;
  }

  auth = getAuth(initializeApp(FIREBASE_CONFIG));

  // Attach listeners immediately — before any awaits — so clicks are never missed.
  // auth is assigned above (synchronously) so it is safe to reference in the handlers.
  $("daGoogle").addEventListener("click", () =>
    startSignIn(new GoogleAuthProvider()),
  );
  $("daSwitch").addEventListener("click", endSession);
  $("daAck").addEventListener("change", syncDeleteButton);
  $("daType").addEventListener("input", syncDeleteButton);
  $("daStepConfirm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!$("daDelete").disabled) $("daDialog").showModal();
  });
  $("daCancel").addEventListener("click", () => $("daDialog").close());
  $("daConfirm").addEventListener("click", deleteAccount);

  // Now do the async setup. If setPersistence fails the page still works
  // because Firebase falls back to in-memory persistence automatically.
  try {
    await setPersistence(auth, browserSessionPersistence);
    await getRedirectResult(auth);
  } catch {
    say("Sign-in did not work. Please try again.", "error");
  }

  onAuthStateChanged(auth, (user) => {
    if (!busy) showSignedIn(user);
  });
}

init();
