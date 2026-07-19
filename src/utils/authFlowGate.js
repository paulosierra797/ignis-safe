// Module-level flag so UserContext's onAuthStateChange listener can
// deterministically ignore SIGNED_IN events that fire mid-login-decision —
// e.g. the event supabase.auth.signInWithPassword raises before we've
// decided whether this device can skip OTP or must complete it. Without
// this, the listener could sync currentUser (and grant ProtectedRoute
// access) from a password-only session before OTP/trust is verified.
let gated = false;

export const setAuthFlowGated = (value) => {
  gated = Boolean(value);
};

export const isAuthFlowGated = () => gated;
