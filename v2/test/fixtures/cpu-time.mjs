// Preload: when the process exits, append the CPU time it used (user + system, ms) to CPU_TIME_FILE.
// The hook speed check reads it, so a busy machine does not count against the hook.
import fs from 'node:fs';
process.on('exit', () => {
  const u = process.cpuUsage();
  fs.appendFileSync(process.env.CPU_TIME_FILE, `${(u.user + u.system) / 1000}\n`);
});
