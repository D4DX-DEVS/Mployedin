const fs = require('fs');
const dirs = [
  'src/app/api/super-agent/approvals/[id]',
  'src/lib/agents'
];
dirs.forEach(d => {
  fs.mkdirSync(d, {recursive: true});
  console.log('Created:', d);
});
