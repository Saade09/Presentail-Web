export type InFlightWorkerExecution = {
  id: number;
  name: string;
};

export type WorkerExecutionDrainResult = {
  drained: boolean;
  remaining: InFlightWorkerExecution[];
};

const inFlight = new Map<number, string>();
const drainListeners = new Set<() => void>();
let nextId = 1;

/**
 * Registers an already-admitted worker execution until its promise settles.
 * The original promise is returned so callers retain their existing error
 * handling.
 */
export function trackWorkerExecution<T>(
  name: string,
  execution: Promise<T>,
): Promise<T> {
  const id = nextId++;
  inFlight.set(id, name);

  const remove = () => {
    if (!inFlight.delete(id)) return;
    for (const listener of drainListeners) listener();
  };
  execution.then(remove, remove);
  return execution;
}

export function getInFlightWorkerExecutions(): InFlightWorkerExecution[] {
  return Array.from(inFlight, ([id, name]) => ({ id, name }));
}

/**
 * Waits for the shared-owner legacy workers that were admitted before stop to
 * settle, without allowing shutdown to wait forever.
 */
export async function waitForInFlightWorkerExecutions(
  timeoutMs: number,
): Promise<WorkerExecutionDrainResult> {
  if (inFlight.size === 0) return { drained: true, remaining: [] };
  if (timeoutMs <= 0) {
    return { drained: false, remaining: getInFlightWorkerExecutions() };
  }

  let timeout: NodeJS.Timeout | null = null;
  await new Promise<void>((resolve) => {
    const onSettlement = () => {
      if (inFlight.size !== 0) return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      drainListeners.delete(onSettlement);
      if (timeout) clearTimeout(timeout);
    };

    drainListeners.add(onSettlement);
    timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    timeout.unref?.();

    // Close the gap between the initial size check and listener registration.
    onSettlement();
  });

  const remaining = getInFlightWorkerExecutions();
  return { drained: remaining.length === 0, remaining };
}