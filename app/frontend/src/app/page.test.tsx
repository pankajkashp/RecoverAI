import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("frontend foundation", () => {
  it("exports the application entry page", () => {
    expect(HomePage).toBeTypeOf("function");
  });
});