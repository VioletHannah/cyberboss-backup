const {
  rootDir,
  listenUrl,
  bridgePidFile,
  bridgeLogFile,
  ensureLogDir,
  ensureSharedAppServer,
  isPidAlive,
  readPidFile,
  removePidFileIfMatches,
  spawnDetachedCommand,
  writePidFile,
} = require("./shared-common");

const STOP_TIMEOUT_MS = 8_000;

async function main() {
  const replacePid = parseReplacePid(process.argv);
  const runtime = process.env.CYBERBOSS_RUNTIME || "codex";

  ensureLogDir();
  await stopExistingBridge(replacePid || readPidFile(bridgePidFile));

  const appServer = await ensureSharedAppServer();
  const childEnv = {};
  if (runtime === "codex") {
    childEnv.CYBERBOSS_CODEX_ENDPOINT = listenUrl;
  }
  const pid = spawnDetachedCommand(process.execPath, ["./bin/cyberboss.js", "start", "--checkin"], {
    cwd: rootDir,
    env: childEnv,
    logFile: bridgeLogFile,
  });
  writePidFile(bridgePidFile, pid);

  const appLabel = appServer.pid ? ` appServerPid=${appServer.pid}` : "";
  console.log(`shared cyberboss restarted pid=${pid}${appLabel}`);
}

async function stopExistingBridge(pid) {
  if (!pid || !isPidAlive(pid)) {
    if (pid) {
      removePidFileIfMatches(bridgePidFile, pid);
    }
    return;
  }

  process.kill(pid, "SIGTERM");
  const stopped = await waitUntilStopped(pid, STOP_TIMEOUT_MS);
  if (!stopped && isPidAlive(pid)) {
    process.kill(pid, "SIGKILL");
    await waitUntilStopped(pid, 2_000);
  }
  removePidFileIfMatches(bridgePidFile, pid);
}

async function waitUntilStopped(pid, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isPidAlive(pid)) {
      return true;
    }
    await sleep(250);
  }
  return !isPidAlive(pid);
}

function parseReplacePid(argv) {
  const index = argv.indexOf("--replace-pid");
  if (index === -1) {
    return 0;
  }
  const parsed = Number.parseInt(argv[index + 1] || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
