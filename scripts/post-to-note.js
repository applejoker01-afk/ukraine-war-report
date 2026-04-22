const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const TurndownService = require('turndown');

// Turndown設定
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// HTMLから見出しとテキストコンテンツを抽出
function extractContent(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);
  
  // 不要な要素を削除
  $('script').remove();
  $('style').remove();
  $('nav').remove();
  $('footer').remove();
  $('.chart-container').remove(); // チャートは除外
  $('canvas').remove();
  
  // メインコンテンツを抽出
  const title = $('h1').first().text();
  const subtitle = $('.subtitle').first().text();
  const updateDate = $('.update-date').first().text();
  
  let content = `# ${title}\n\n${subtitle}\n\n${updateDate}\n\n---\n\n`;
  
  // 各セクションを処理
  $('section').each((i, section) => {
    const $section = $(section);
    const sectionId = $section.attr('id');
    
    // セクションタイトル
    const h2 = $section.find('h2').first().text();
    content += `## ${h2}\n\n`;
    
    // セクション内のコンテンツ
    $section.find('p, ul, ol, .info-box, .warning-box, h3').each((j, elem) => {
      const $elem = $(elem);
      const tagName = elem.name;
      
      if (tagName === 'h3') {
        content += `### ${$elem.text()}\n\n`;
      } else if ($elem.hasClass('info-box') || $elem.hasClass('warning-box')) {
        const boxTitle = $elem.find('h4').first().text();
        const boxContent = $elem.clone().find('h4').remove().end().text().trim();
        content += `**${boxTitle}**\n\n${boxContent}\n\n`;
      } else if (tagName === 'p') {
        const text = $elem.text().trim();
        if (text) {
          content += `${text}\n\n`;
        }
      } else if (tagName === 'ul' || tagName === 'ol') {
        $elem.find('li').each((k, li) => {
          const liText = $(li).text().trim();
          if (liText) {
            content += `- ${liText}\n`;
          }
        });
        content += '\n';
      }
    });
    
    content += '\n---\n\n';
  });
  
  // フッター情報
  const pagesUrl = process.env.PAGES_URL || 'https://applejoker01-afk.github.io/ukraine-war-report';
  content += `\n\n**完全版レポートはこちら：**\n${pagesUrl}\n\n`;
  content += `**アーカイブ（過去のレポート）：**\n${pagesUrl}/archive/\n\n`;
  
  return content;
}

// メイン処理
try {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const outputPath = path.join(__dirname, 'note-draft.txt');
  
  console.log('Generating Note draft from index.html...');
  const noteContent = extractContent(indexPath);
  
  // ファイルに保存
  fs.writeFileSync(outputPath, noteContent, 'utf-8');
  console.log(`✅ Note draft generated: ${outputPath}`);
  console.log(`📝 Content length: ${noteContent.length} characters`);
  
} catch (error) {
  console.error('❌ Error generating Note draft:', error);
  process.exit(1);
}
