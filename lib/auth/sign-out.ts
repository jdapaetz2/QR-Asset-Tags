/**
 * Where signing out lands the user. Its own pure module because `lib/auth/actions.ts` is a
 * `"use server"` module (every export there must be an async server action, so it can't export a
 * plain constant). The `signOut` action redirects here; route protection then keeps a signed-out
 * user on the public side.
 */
export const SIGN_OUT_REDIRECT_PATH = "/login";
