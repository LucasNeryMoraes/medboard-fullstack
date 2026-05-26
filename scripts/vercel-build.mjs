import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.DATABASE_URL) {
  run("prisma", ["migrate", "deploy"]);
}

run("prisma", ["generate"]);
run("next", ["build"]);
