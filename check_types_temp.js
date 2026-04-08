const { execSync } = require('child_process');

let output = '';
try {
  output = execSync('npx tsc --noEmit 2>&1', { 
    cwd: process.cwd(),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });
} catch (error) {
  output = error.stdout ? error.stdout.toString() : '';
  if (error.stderr) output += error.stderr.toString();
}

const lines = output.split('\n');
const targetFiles = [
  'src/hooks/usePlacements.ts',
  'src/hooks/useScorecards.ts',
  'src/hooks/useTraining.ts',
  'src/hooks/useMatchingWeights.ts',
  'src/hooks/useWorkflow.ts',
  'src/app/[locale]/(dashboard)/employer/placements/page.tsx',
  'src/app/[locale]/(dashboard)/employer/scorecards/page.tsx',
  'src/app/[locale]/(dashboard)/employer/training/page.tsx',
  'src/app/[locale]/(dashboard)/employer/matching-weights/page.tsx',
  'src/app/[locale]/(dashboard)/employer/workflow/page.tsx'
];

const filtered = lines.filter(line => {
  return targetFiles.some(file => line.includes(file));
});

if (filtered.length > 0) {
  console.log(filtered.join('\n'));
} else {
  console.log('No errors in migrated files.');
}
