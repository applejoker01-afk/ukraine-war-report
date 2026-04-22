const fs = require('fs');
const path = require('path');

// アーカイブフォルダのパス
const archiveDir = path.join(__dirname, '..', 'archive');

// アーカイブ一覧HTMLを生成
function buildArchiveIndex() {
  // アーカイブフォルダが存在しない場合は作成
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
  
  // アーカイブファイル一覧を取得
  const files = fs.readdirSync(archiveDir)
    .filter(file => file.endsWith('.html') && file !== 'index.html')
    .sort()
    .reverse(); // 新しい順
  
  // HTML生成
  let html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ウクライナ戦争レポート - アーカイブ</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif;
            line-height: 1.8;
            color: #333;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            padding: 20px;
        }
        
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 60px 40px;
        }
        
        h1 {
            font-size: 2.5em;
            color: #005BBB;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 4px solid #FFD500;
        }
        
        .back-link {
            display: inline-block;
            margin-bottom: 30px;
            padding: 10px 20px;
            background: #005BBB;
            color: white;
            text-decoration: none;
            border-radius: 25px;
            transition: all 0.3s;
        }
        
        .back-link:hover {
            background: #2a5298;
            transform: translateY(-2px);
        }
        
        .archive-list {
            list-style: none;
        }
        
        .archive-item {
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
            transition: all 0.3s;
        }
        
        .archive-item:hover {
            background: #e9ecef;
            transform: translateX(5px);
        }
        
        .archive-link {
            color: #005BBB;
            text-decoration: none;
            font-size: 1.2em;
            font-weight: 600;
        }
        
        .archive-link:hover {
            text-decoration: underline;
        }
        
        .archive-date {
            color: #666;
            font-size: 0.9em;
            margin-top: 5px;
        }
        
        .no-archives {
            text-align: center;
            padding: 40px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="../index.html" class="back-link">← 最新レポートに戻る</a>
        
        <h1>📚 アーカイブ - 過去のレポート</h1>
        
        <p style="margin-bottom: 30px;">過去に公開されたウクライナ戦争レポートのアーカイブです。日付をクリックすると、その日のレポートを閲覧できます。</p>
`;

  if (files.length === 0) {
    html += `        <div class="no-archives">
            <p>まだアーカイブがありません。</p>
            <p>レポートが更新されると、自動的にここに保存されます。</p>
        </div>
`;
  } else {
    html += `        <ul class="archive-list">\n`;
    
    files.forEach(file => {
      const date = file.replace('.html', '');
      const displayDate = formatDate(date);
      
      html += `            <li class="archive-item">
                <a href="${file}" class="archive-link">${displayDate}</a>
                <div class="archive-date">ファイル名: ${file}</div>
            </li>\n`;
    });
    
    html += `        </ul>\n`;
  }
  
  html += `    </div>
</body>
</html>`;
  
  // index.htmlとして保存
  const indexPath = path.join(archiveDir, 'index.html');
  fs.writeFileSync(indexPath, html, 'utf-8');
  
  console.log(`✅ Archive index generated: ${indexPath}`);
  console.log(`📁 Total archives: ${files.length}`);
}

// 日付をフォーマット
function formatDate(dateString) {
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;
  
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  
  return `${year}年${month}月${day}日版`;
}

// メイン処理
try {
  console.log('Building archive index...');
  buildArchiveIndex();
} catch (error) {
  console.error('❌ Error building archive:', error);
  process.exit(1);
}
