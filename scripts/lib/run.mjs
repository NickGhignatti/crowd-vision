//
// Cross-platform parallel task runner.
//
// Generalizes the buffered-parallel pattern from scripts/test/test-run.mjs so
// install / audit / deps-check can all share one runner. Each task is:
//
//   { name, cwd, cmd, optional? }
//
//   name      label shown in the banner + summary
//   cwd       directory to run in (relative to repo root)
//   cmd       shell command string (quoting stays intact per-shell)
//   optional  if true, a missing executable (ENOENT) is reported as "skipped"
//             instead of failing the whole run — used for tools like cargo-audit
//             that a contributor may not have installed.
//
// Output from each task is buffered and flushed as one block on completion so
// parallel runs don't interleave. A concurrency cap (default 4, override via the
// JOBS env var) keeps us from spawning a dozen heavy installs at once.
//

import { spawn } from 'node:child_process';

const banner = (name, cwd) => `\n━━━ ${String(name).padEnd(22)} (${cwd}) ━━━\n`;

export const concurrencyFromEnv = (fallback = 4) => {
  const n = Number.parseInt(process.env.JOBS ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

function runOne(task) {
  return new Promise((resolve) => {
    const buffer = [];
    let spawnError = null;

    const child = spawn(task.cmd, { cwd: task.cwd, shell: true });

    child.stdout.on('data', (d) => buffer.push(d.toString()));
    child.stderr.on('data', (d) => buffer.push(d.toString()));

    // A missing binary surfaces as an 'error' event, not a non-zero close code.
    child.on('error', (err) => {
      spawnError = err;
    });

    child.on('close', (code) => {
      const missingTool = spawnError && spawnError.code === 'ENOENT';
      const skipped = Boolean(task.optional && missingTool);

      let status;
      if (skipped) status = 'skipped';
      else if (spawnError || code !== 0) status = 'failed';
      else status = 'ok';

      if (skipped) {
        buffer.push(`\n(skipped — '${task.cmd.split(' ')[0]}' not installed)\n`);
      } else if (spawnError) {
        buffer.push(`\n${spawnError.message}\n`);
      }

      process.stdout.write(banner(task.name, task.cwd) + buffer.join(''));
      resolve({ name: task.name, status });
    });
  });
}

// Run tasks with a bounded concurrency pool. Returns the list of results.
async function runPool(tasks, concurrency) {
  const results = [];
  const queue = [...tasks];

  const worker = async () => {
    let task;
    while ((task = queue.shift())) {
      results.push(await runOne(task));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker),
  );
  return results;
}

//
// Run all tasks, print a summary, and exit the process with the right code:
//   0  every task ok or skipped
//   1  at least one task failed
//
export async function runTasks(tasks, { concurrency = concurrencyFromEnv(), label = 'task' } = {}) {
  if (tasks.length === 0) {
    console.error('No tasks to run.');
    process.exit(1);
  }

  const start = Date.now();
  const results = await runPool(tasks, concurrency);
  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  const failed = results.filter((r) => r.status === 'failed');
  const skipped = results.filter((r) => r.status === 'skipped');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const skipNote = skipped.length ? ` (${skipped.length} skipped: ${skipped.map((s) => s.name).join(', ')})` : '';

  if (failed.length === 0) {
    console.log(`OK  -  ${results.length} ${label}(s) passed in ${seconds}s${skipNote}`);
    process.exit(0);
  } else {
    console.log(
      `FAIL  -  ${failed.length}/${results.length} ${label}(s) failed (${seconds}s): ${failed.map((f) => f.name).join(', ')}${skipNote}`,
    );
    process.exit(1);
  }
}
