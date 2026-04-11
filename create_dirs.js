const fs = require('fs');
const path = require('path');

const baseDir = 'c:/Users/moham/OneDrive/Desktop/Mployedin/mployedin';

const directories = [
  'src/app/api/super-agent/approvals/[id]',
  'src/app/[locale]/(dashboard)/agent/candidates',
  'src/lib/agents'
];

directories.forEach(dir => {
  const fullPath = path.join(baseDir, dir);
  fs.mkdirSync(fullPath, { recursive: true });
  console.log(`Created: ${fullPath}`);
});

console.log('All directories created successfully!');
