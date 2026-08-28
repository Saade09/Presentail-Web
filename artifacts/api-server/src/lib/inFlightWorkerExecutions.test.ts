import { describe, expect, it } from "vitest";
import {
  getInFlightWorkerExecutions,
  trackWorkerExecution,
  waitForInFlightWorkerExecutions,
} from "./inFlightWorkerExecutions";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("in-flight worker execution registry", () => {
  it("exposes active legacy monitor and Woo sync executions", async () => {
    const monitor = deferred();
    const woo = deferred();

    trackWorkerExecution("checkout-login-funnel", monitor.promise);
    trackWorkerExecution("woo-sync", woo.promise);

    expect(
      getInFlightWorkerExecutions().map(({ name }) => name).sort(),
    ).toEqual(["checkout-login-funnel", "woo-sync"]);

    monitor.resolve();
    woo.resolve();
    await Promise.all([monitor.promise, woo.promise]);
    await Promise.resolve();
    expect(getInFlightWorkerExecutions()).toEqual([]);
  });

  it("waits for settlement and reports a bounded timeout", async () => {
    const completing = deferred();
    trackWorkerExecution("product-metrics-sync", completing.promise);

    const drain = waitForInFlightWorkerExecutions(1_000);
    let settled = false;
    void drain.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    completing.resolve();
    await expect(drain).resolves.toEqual({ drained: true, remaining: [] });

    const stuck = deferred();
    trackWorkerExecution("woo-sync", stuck.promise);
    const timedOut = await waitForInFlightWorkerExecutions(10);
    expect(timedOut.drained).toBe(false);
    expect(timedOut.remaining.map(({ name }) => name)).toEqual(["woo-sync"]);

    stuck.resolve();
    await stuck.promise;
    await Promise.resolve();
  });
});