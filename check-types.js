const { execSync } = require('child_process');

try {
  const output = execSync('npx tsc --noEmit 2>&1', { 
    cwd: process.cwd(),
    encoding: 'utf-8'
  });
  
  const lines = output.split('\n');
  const targetFiles = [
    'JobFeedCard.tsx',
    'JobFeedSidebar.tsx',
    'JobFeedPage.tsx',
    'job-seeker/page.tsx',
    'job-seeker/layout.tsx',
    'recommended/route.ts'
  ];
  
  const filtered = lines.filter(line => {
    return targetFiles.some(file => line.includes(file));
  });
  
  if (filtered.length > 0) {
    console.log(filtered.join('\n'));
  } else {
    console.log('No type errors found in target files');
  }
} catch (error) {
  const output = error.stdout ? error.stdout.toString() : '';
  const stderr = error.stderr ? error.stderr.toString() : '';
  
  const allOutput = output + stderr;
  const lines = allOutput.split('\n');
  const targetFiles = [
    'JobFeedCard.tsx',
    'JobFeedSidebar.tsx',
    'JobFeedPage.tsx',
    'job-seeker/page.tsx',
    'job-seeker/layout.tsx',
    'recommended/route.ts'
  ];
  
  const filtered = lines.filter(line => {
    return targetFiles.some(file => line.includes(file));
  });
  
  if (filtered.length > 0) {
    console.log(filtered.join('\n'));
  } else {
    console.log('No type errors found in target files');
  }
}
