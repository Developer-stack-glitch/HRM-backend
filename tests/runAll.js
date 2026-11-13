const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const files = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.test.js'))
    .map(f => path.join(testDir, f));

console.log(`Discovered ${files.length} test suites.`);

let allPassed = true;
for (const file of files) {
    console.log(`\n▶ Running: ${path.basename(file)}`);
    try {
        execFileSync(process.execPath, ['--test', file], {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
    } catch (err) {
        allPassed = false;
        console.error(`✖ Test suite failed: ${path.basename(file)}`);
    }
}

if (!allPassed) {
    console.error('\n✖ One or more test suites failed.');
    process.exit(1);
}

console.log('\n✔ All HRMS test suites passed successfully!');
process.exit(0);
