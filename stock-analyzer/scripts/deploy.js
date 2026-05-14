const { execSync } = require('child_process');
const path = require('path');

const gitRoot = path.join(__dirname, '..', '..');
const d = new Date();
const msg = [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, '0'),
  String(d.getDate()).padStart(2, '0'),
].join('') + '_' + [
  String(d.getHours()).padStart(2, '0'),
  String(d.getMinutes()).padStart(2, '0'),
].join('');

const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: gitRoot });

run('git add .');
run(`git commit -m "${msg}"`);
run('git push');
