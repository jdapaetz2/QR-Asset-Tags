import { describe, expect, it } from "vitest";

import { SIGN_OUT_REDIRECT_PATH } from "./sign-out";

describe("SIGN_OUT_REDIRECT_PATH", () => {
  it("sends a signed-out user to the login page", () => {
    expect(SIGN_OUT_REDIRECT_PATH).toBe("/login");
  });
});
