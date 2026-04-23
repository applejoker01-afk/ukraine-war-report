import fs from 'fs';

const archiveDir = 'archive';
const outputFile = 'archive/index.html';

const files = fs.readdirSync(archiveDir)
  .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.html$/))
  .sort()
  .reverse();

const listItems = files.map(f => {
  const date = f.replace('.html', '');
  const [year, month, day] = date.split('-');
  const label = `${year}年${month}月${day}日版`;
  return `
    <li>
      <a href="${f}">
        <span class="date">${label}</span>
        <span class="arrow">→</span>
      </a>
    </li>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ウクライナ戦争レポート 過去のレポート一覧</title>
<style>
  body{background:#0d1a0d;color:#f0f4f0;font-family:'Noto Sans JP',sans-serif;margin:0;padding:0;}
  .header{background:rgba(13,26,13,0.97);border-bottom:1px solid rgba(58,138,58,0.3);padding:20px 32px;display:flex;align-items:center;justify-content:space-between;}
  .logo{font-family:Oswald,sans-serif;font-size:18px;color:#c9a84c;letter-spacing:2px;}
  .back{color:#6abf6a;text-decoration:none;font-size:13px;}
  .back:hover{text-decoration:underline;}
  .container{max-width:720px;margin:48px auto;padding:0 24px;}
  h1{font-size:24px;font-weight:700;margin-bottom:8px;}
  .sub{color:#8899aa;font-size:13px;margin-bottom:32px;}
  ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:10px;}
  li a{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.03);border:1px solid rgba(58,138,58,0.3);border-radius:8px;padding:16px 20px;text-decoration:none;color:#f0f4f0;transition:all .2s;}
  li a:hover{border-color:#3a8a3a;background:rgba(58,138,58,0.08);}
  .date{font-size:15px;font-weight:700;}
  .arrow{color:#6abf6a;font-size:18px;}
  .empty{color:#8899aa;font-size:14px;text-align:center;margin-top:48px;}
</style>
</head>
<body>
<div class="header">
  <div class="logo">🇺🇦 ウクライナ戦争レポート｜過去のレポート</div>
  <a href="../index.html" class="back">← 最新版を見る</a>
</div>
<div class="container">
  <h1>📚 過去のレポート一覧</h1>
  <p class="sub">更新日ごとのアーカイブです。タイトルをクリックするとその日のレポートが開きます。</p>
  ${files.length > 0 ? `<ul>${listItems}</ul>` : `<p class="empty">アーカイブはまだありません。</p>`}
</div>
</body>
</html>`;

fs.writeFileSync(outputFile, html, 'utf8');
console.log(`✅ archive/index.html を生成しました（${files.length}件）`);
