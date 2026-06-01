const { spawn } = require("child_process");

const child = spawn("ts-node", ["-r", "tsconfig-paths/register", "src/server.ts"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    RESET_DATABASE: "true",
    RESET_DATABASE_ONLY: "true",
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("[db:reset] Failed to start reset command:", error);
  process.exit(1);
});
