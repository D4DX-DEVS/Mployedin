#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

let output = '';
try {
  output = execSync('npx tsc --noEmit --pretty 2>&1', { 
    cwd: process.cwd(),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });
} catch (error) {
  output = error.stdout ? error.stdout.toString() : '';
  if (error.stderr) output += error.stderr.toString();
}

const lines = output.split('\n');
console.log('=== FIRST 80 LINES ===');
lines.slice(0, 80).forEach((line, idx) => {
  console.log(line);
});
console.log('\n=== TOTAL LINES: ' + lines.length + ' ===');

// Check for specific files
const targetFiles = [
  'src/hooks/useJobs.ts',
  'src/hooks/useDebounce.ts',
  'src/app/[locale]/(dashboard)/employer/jobs/page.tsx'
];

console.log('\n=== CHECKING TARGET FILES ===');
targetFiles.forEach(file => {
  const matchingLines = lines.filter(line => line.includes(file));
  console.log(`\n${file}: ${matchingLines.length} errors`);
  if (matchingLines.length > 0) {
    matchingLines.forEach(line => console.log(line));
  }
});
