// Lists.json 자동 갱신 스크립트
// 폴더 안의 파일이 변경되면 Lists.json을 자동 갱신합니다
// 실행 방법: node auto-update-lists.js

const fs = require('fs');
const path = require('path');
const folderPath = __dirname;
const outputFile = path.join(folderPath, 'Lists.json');

function updateListsJson() {
  try {
    const files = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.json') && f !== 'Lists.json')
      .sort();

    const templates = [];
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const name = typeof content?.name === 'string' && content.name.trim()
          ? content.name.trim()
          : file.replace(/\.json$/i, '');
        templates.push({ file, name, content });
      } catch (err) {
        console.log(`⚠  WARNING: Cannot read ${file}`);
      }
    }

    templates.sort((a, b) =>
      a.name.localeCompare(b.name, ['ko', 'en'], {
        numeric: true,
        sensitivity: 'base',
      }) || a.file.localeCompare(b.file, ['ko', 'en'], {
        numeric: true,
        sensitivity: 'base',
      })
    );

    const jsonArray = templates.map(template => template.content);

    // 들여쓰기 두 칸으로 정리하여 저장합니다
    fs.writeFileSync(outputFile, JSON.stringify(jsonArray, null, 2) + '\n', 'utf8');
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    console.log(`[${timestamp}] ✓ Lists.json updated (${files.length} files)`);
  } catch (err) {
    console.error('Error updating Lists.json:', err.message);
  }
}

// 최초 실행
updateListsJson();

// 파일 변경 감시
const watcher = fs.watch(folderPath, (eventType, filename) => {
  if (filename && filename.endsWith('.json') && filename !== 'Lists.json') {
    // 파일 쓰기가 끝나도록 500ms 대기한 뒤 처리합니다
    setTimeout(updateListsJson, 500);
  }
});

console.log('🔄 Monitoring started... (Ctrl+C to stop)\n');

process.on('SIGINT', () => {
  watcher.close();
  console.log('\nMonitoring stopped');
  process.exit(0);
});
