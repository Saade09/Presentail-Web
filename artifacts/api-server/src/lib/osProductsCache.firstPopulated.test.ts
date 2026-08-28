import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetFirstPopulatedForTest,
  __triggerFirstPopulatedForTest,
  registerOnFirstPopulatedCallback,
} from "./osProductsCache";

describe("OS product first-populated callbacks", () => {
  afterEach(() => {
    __resetFirstPopulatedForTest();
  });

  it("fires every registered listener exactly once", () => {
    const first = vi.fn();
    const second = vi.fn();
    registerOnFirstPopulatedCallback(first);
    registerOnFirstPopulatedCallback(second);

    __triggerFirstPopulatedForTest();
    __triggerFirstPopulatedForTest();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("allows a shutting-down runtime to unregister a pending listener", () => {
    const listener = vi.fn();
    const unregister = registerOnFirstPopulatedCallback(listener);

    unregister();
    __triggerFirstPopulatedForTest();

    expect(listener).not.toHaveBeenCalled();
  });
});