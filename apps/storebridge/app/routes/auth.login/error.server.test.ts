import { describe, expect, it } from "vitest";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";
import { loginErrorMessage } from "./error.server";

describe("loginErrorMessage", () => {
  it("maps a missing shop domain to a friendly message", () => {
    expect(loginErrorMessage({ shop: LoginErrorType.MissingShop })).toEqual({
      shop: "Please enter your shop domain to log in",
    });
  });

  it("maps an invalid shop domain to a friendly message", () => {
    expect(loginErrorMessage({ shop: LoginErrorType.InvalidShop })).toEqual({
      shop: "Please enter a valid shop domain to log in",
    });
  });

  it("returns no errors when login succeeded", () => {
    expect(loginErrorMessage({})).toEqual({});
  });
});
