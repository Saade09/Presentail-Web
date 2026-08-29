const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..", "..");

function durationMs(startedAt) {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
}

function logPhase(phase, startedAt, details = {}) {
  console.log(
    JSON.stringify({
      event: "mobile_build_phase",
      phase,
      durationMs: durationMs(startedAt),
      ...details,
    }),
  );
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const startedAt = process.hrtime.bigint();
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const succeeded = code === 0 && !signal;
      logPhase("typecheck", startedAt, {
        status: succeeded ? "complete" : "failed",
      });
      if (succeeded) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `Mobile typecheck terminated by ${signal}`
            : `Mobile typecheck exited with code ${code}`,
        ),
      );
    });
  });
}

async function main() {
  await run("pnpm", [
    "--filter",
    "@workspace/presentail",
    "run",
    "typecheck:artifact",
  ]);

  const startedAt = process.hrtime.bigint();
  const build = spawn("node", ["scripts/build.js"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  await new Promise((resolve, reject) => {
    build.once("error", reject);
    build.once("exit", (code, signal) => {
      if (code === 0 && !signal) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `Mobile build terminated by ${signal}`
            : `Mobile build exited with code ${code}`,
        ),
      );
    });
  });

  logPhase("publish-build", startedAt, { status: "complete" });
}

main().catch((error) => {
  console.error(`Mobile publish build failed: ${error.message}`);
  process.exit(1);
});