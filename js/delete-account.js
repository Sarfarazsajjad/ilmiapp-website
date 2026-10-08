// Parent account deletion (K131). The Firebase Auth web SDK from Google's CDN is
// the only third-party code on this page. Nothing here logs, stores or tracks.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyARAC7mEuSCODXhWr-EjDVeezRrkFQ3NNM",
  authDomain: "ilmi-e08cd.firebaseapp.com",
  projectId: "ilmi-e08cd",
  appId: "1:500046081203:web:a3c3eb030b0273367d54c6",
};

const ENABLE_APPLE = false;

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

function showSignedIn(user) {
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
  statusBox.innerHTML =
    '<span class="da-spinner"></span> Deleting your account. Please wait…';
  statusBox.className = "da-status";
  statusBox.hidden = false;
  $("daConfirm").disabled = true;
  $("daCancel").disabled = true;
  let outcome;
  try {
    const idToken = await auth.currentUser.getIdToken(true);
    const res = await fetch(`${API_BASE}/parents/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ idToken }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.status === "deleted") outcome = "deleted";
    else if (res.status === 404 && body.status === "not_found")
      outcome = "not_found";
    else if (res.status === 401 && body.code === "REAUTH_REQUIRED")
      outcome = "reauth";
    else outcome = "error";
  } catch {
    outcome = "error";
  }
  busy = false;
  $("daConfirm").disabled = false;
  $("daCancel").disabled = false;
  await endSession();
  if (outcome === "deleted") {
    say(
      "Your ILMI account and all of its data have been deleted, and you have been signed out of this page. If you have a subscription, please cancel it in Google Play.",
      "ok",
    );
  } else if (outcome === "not_found") {
    say(
      "We could not find an ILMI account for this sign-in. Nothing was deleted. Check that you used the same Google or Apple account as in the app.",
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
  if (ENABLE_APPLE) {
    $("daApple").hidden = false;
    $("daApple").addEventListener("click", () =>
      startSignIn(new OAuthProvider("apple.com")),
    );
  }
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
