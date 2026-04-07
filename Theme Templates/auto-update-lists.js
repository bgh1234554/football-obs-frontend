// Auto-update script for Lists.json
// Automatically updates Lists.json whenever files in the folder change
// Run with: node auto-update-lists.js

const fs = require('fs');
const path = require('path');
const folderPath = __dirname;
const outputFile = path.join(folderPath, 'Lists.json');

function updateListsJson() {
  try {
    const files = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.json') && f !== 'Lists.json')
      .sort();

    const jsonArray = [];
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        jsonArray.push(content);
      } catch (err) {
        console.log(`⚠  WARNING: Cannot read ${file}`);
      }
    }

    // Write with clean formatting (2-space indent)
    fs.writeFileSync(outputFile, JSON.stringify(jsonArray, null, 2) + '\n', 'utf8');
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    console.log(`[${timestamp}] ✓ Lists.json updated (${files.length} files)`);
  } catch (err) {
    console.error('Error updating Lists.json:', err.message);
  }
}

// Initial run
updateListsJson();

// Watch for file changes
const watcher = fs.watch(folderPath, (eventType, filename) => {
  if (filename && filename.endsWith('.json') && filename !== 'Lists.json') {
    // Debounce: wait 500ms for file write to complete
    setTimeout(updateListsJson, 500);
  }
});

console.log('🔄 Monitoring started... (Ctrl+C to stop)\n');

process.on('SIGINT', () => {
  watcher.close();
  console.log('\nMonitoring stopped');
  process.exit(0);
});
