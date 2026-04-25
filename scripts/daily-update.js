// scripts/daily-update.js（安全設計版）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 設計方針：元のHTMLコンテンツは絶対に消さない
//
// ✅ 更新する箇所（安全）:
//   - 最新ニュースボックス（NEWS_START～NEWS_END）← 上書き
//   - タイムライン（TIMELINE:INSERT）← 先頭に追記
//   - 兵器解説（WEAPONS:INSERT）← 先頭に追記
//
// ❌ 触らない箇所（元データを保護）:
//   - 戦況マップのKPI・SVG
//   - 経済影響のグラフ・テーブル
//   - シンクタンクのカード
//   - 解説テキスト
//   → これらは手動で更新する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import fetch from 'node-fetch';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

const TODAY = new Date().toLocaleDateString('ja-JP', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
});
const TODAY_ISO = new Date().toISOString().split('T')[0];
const HAS_CLAUDE = !!process.env.ANTHROPIC_API_KEY;

// ── RSS情報源 ──────────────────────────────────
const RSS_SOURCES = [
  { name: 'NHK国際',   url: 'https://www3.nhk.or.jp/rss/news/cat6.xml' },
  { name: 'Ukrinform', url: 'https://www.ukrinform.jp/rss/block-lastnews' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
];

const KEYWORDS = [
  'ウクライナ','ロシア','ゼレンスキー','プーチン','ドネツク',
  'キーウ','NATO','停戦','ukraine','russia','zelensky',
  'putin','donbas','kharkiv','crimea','kherson'
];

// ── RSS取得 ────────────────────────────────────
async function fetchRSS(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml  = await res.text();
    const data = await parseStringPromise(xml, { explicitArray: false });
    const channel = data?.rss?.channel || data?.feed;
    const items   = channel?.item || channel?.entry || [];
    const list    = Array.isArray(items) ? items : [items];
    return list.slice(0, 20).map(item => ({
      title:   (item.title?._ || item.title || '').trim(),
      link:    item.link?.href || item.link || '',
      pubDate: item.pubDate || item.updated || '',
      desc:    (item.description?._ || item.description || item.summary?._ || '')
               .replace(/<[^>]+>/g, '').trim(),
      source:  source.name,
    }));
  } catch (e) {
    console.warn(`  ⚠ ${source.name}: ${e.message}`);
    return [];
  }
}

function isRelevant(item) {
  const text = `${item.title} ${item.desc}`.toLowerCase();
  return KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

// ── Claude API ────────────────────────────────
async function callClaude(prompt, maxTokens = 800) {
  if (!HAS_CLAUDE) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw  = data.content?.[0]?.text?.trim() || null;
    if (!raw) return null;
    // マークダウンのコードフェンスを除去
    return raw
      .replace(/^```(?:html)?\s*/gi, '')
      .replace(/\s*```$/gi, '')
      .trim();
  } catch (e) {
    console.warn(`  ⚠ Claude API: ${e.message}`);
    return null;
  }
}

// ── HTML読み書き ───────────────────────────────
function readHTML() {
  return fs.readFileSync('index.html', 'utf8');
}
function writeHTML(html) {
  fs.writeFileSync('index.html', html, 'utf8');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 最新ニュースボックスを更新（NEWS_START～NEWS_END）
// マーカーがない場合は解説セクションの先頭に挿入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateNewsBox(html, articles) {
  console.log('\n📡 最新ニュースボックスを更新中...');

  // AI要約を生成
  let summary = null;
  if (HAS_CLAUDE && articles.length > 0) {
    const headlines = articles.slice(0, 12)
      .map((a, i) => `${i+1}. [${a.source}] ${a.title}`)
      .join('\n');

    summary = await callClaude(
`あなたはウクライナ戦争の専門アナリストです。
以下の最新ニュース見出しをもとに、${TODAY}時点の情勢を日本語で簡潔に要約してください。

【出力ルール】
- 箇条書き（• で始まる）で3〜5点
- 1点につき1〜2文（合計200文字以内）
- 生のテキストのみ出力（HTMLタグ・マークダウン・コードブロック一切不要）
- 記号は「•」のみ使用可

【最新ニュース見出し】
${headlines}`, 500
    );
  }

  // ニュース記事リスト（HTML）
  const articleItems = articles.slice(0, 6).map(a => {
    const t = a.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const url = a.link || '#';
    return `<div class="news-item" style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="background:rgba(106,191,106,0.15);border:1px solid rgba(106,191,106,0.3);border-radius:3px;padding:1px 6px;font-size:10px;color:#6abf6a;white-space:nowrap;flex-shrink:0;">${a.source}</span>
      <a href="${url}" target="_blank" rel="noopener" style="font-size:12px;color:#ccd8cc;text-decoration:none;line-height:1.5;">${t}</a>
    </div>`;
  }).join('\n');

  // AI要約テキストをHTMLに変換（テキスト→<p>タグ）
  const summaryHTML = summary
    ? summary.split('\n')
        .filter(l => l.trim())
        .map(l => `<p style="font-size:12px;line-height:1.8;color:#ccd8cc;margin:3px 0;">${l.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`)
        .join('\n')
    : '';

  const newsBlock = `<!-- NEWS_START -->
<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:18px;margin:20px 0;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
    <div style="font-family:'Noto Serif JP';font-size:15px;font-weight:700;color:var(--light-blue);">📡 最新ニュース</div>
    <div style="font-size:10px;color:var(--gray);">自動更新：${TODAY}</div>
  </div>
  ${summaryHTML ? `
  <div style="background:rgba(58,138,58,0.06);border-radius:6px;padding:12px;margin-bottom:12px;border-left:3px solid var(--mid-blue);">
    <div style="font-size:10px;color:var(--gold);letter-spacing:1px;margin-bottom:6px;">🤖 AI要約</div>
    ${summaryHTML}
  </div>` : ''}
  <div style="display:flex;flex-direction:column;gap:0;">
    ${articleItems}
  </div>
  <div style="margin-top:8px;font-size:10px;color:var(--gray);">※ NHK・Ukrinform・BBC より自動収集。内容は各情報源でご確認ください。</div>
</div>
<!-- NEWS_END -->`;

  // マーカーがあれば上書き、なければ解説タブの最初のdivの後に挿入
  if (html.includes('<!-- NEWS_START -->')) {
    html = html.replace(/<!-- NEWS_START -->[\s\S]*?<!-- NEWS_END -->/m, newsBlock);
    console.log('  ✅ ニュースボックスを更新しました');
  } else {
    // scriptセクションのcontainerの直後に挿入
    const insertAfter = '<div class="container">';
    const idx = html.indexOf(insertAfter);
    if (idx !== -1) {
      const pos = idx + insertAfter.length;
      html = html.slice(0, pos) + '\n' + newsBlock + '\n' + html.slice(pos);
      console.log('  ✅ ニュースボックスを新規挿入しました');
    }
  }
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// タイムラインに先頭追記
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function prependTimeline(html, articles) {
  if (!html.includes('<!-- TIMELINE:INSERT -->')) {
    console.log('  ⚠ タイムラインマーカーなし・スキップ');
    return { html, item: null };
  }

  console.log('\n📅 タイムラインに新イベントを追記中...');
  const headlines = articles.slice(0, 8).map((a, i) => `${i+1}. ${a.title}`).join('\n');

  const item = await callClaude(
`以下のニュース見出しから${TODAY}の最重要イベントを1件だけ選んでください。

【出力ルール】
- 以下のHTML形式のみ出力（マークダウン・コードブロック不要）
- 重要なイベントがなければ <!-- SKIP --> とだけ出力

<div class="tl-item">
  <div class="tl-date">${TODAY_ISO.slice(5,7)}月<br>${TODAY_ISO.slice(8)}日</div>
  <div class="tl-dot"></div>
  <div class="tl-content">
    <div class="tl-ev">絵文字 タイトル（20文字以内）</div>
    <div class="tl-desc">説明（60文字以内）</div>
  </div>
</div>

【ニュース】
${headlines}`, 300
  );

  if (!item || item.includes('SKIP') || !item.includes('tl-item')) {
    console.log('  ⚠ 追記なし');
    return { html, item: null };
  }

  html = html.replace('<!-- TIMELINE:INSERT -->', `<!-- TIMELINE:INSERT -->\n${item}`);
  console.log('  ✅ タイムライン追記完了');
  return { html, item };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 兵器解説に先頭追記
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function prependWeapons(html, articles) {
  if (!html.includes('<!-- WEAPONS:INSERT -->')) {
    console.log('  ⚠ 兵器マーカーなし・スキップ');
    return html;
  }

  // 兵器関連記事をURLごと保持
  const weaponArticles = articles.filter(a =>
    /ドローン|ミサイル|兵器|武器|F-16|ATACMS|パトリオット|drone|missile|weapon/i
      .test(a.title + a.desc)
  ).slice(0, 6);

  if (weaponArticles.length === 0) {
    console.log('  ⚠ 兵器関連ニュースなし・スキップ');
    return html;
  }

  // URLマップを作成（番号→記事情報）
  const urlMap = {};
  const weaponNews = weaponArticles.map((a, i) => {
    urlMap[i + 1] = { url: a.link || '', title: a.title, source: a.source };
    return `${i+1}. [${a.source}] ${a.title}`;
  }).join('\n');

  console.log('\n🔫 兵器解説に新情報を追記中...');

  const result = await callClaude(
`以下の兵器関連ニュースから最重要の新情報を1件選んでください。

【出力ルール】
- 以下のJSON形式のみ出力（マークダウン・コードブロック不要）
- 重要な新情報がなければ {"skip": true} とだけ出力
- source_nums には参考にしたニュースの番号を配列で記載（複数可）

{"skip": false, "source_nums": [番号], "icon": "絵文字", "name": "兵器・技術名", "type": "種別｜使用国", "summary": "概要30文字以内", "significance": "意義30文字以内"}

【ニュース】
${weaponNews}`, 300
  );

  if (!result) {
    console.log('  ⚠ 追記なし（API未応答）');
    return html;
  }

  let parsed;
  try {
    parsed = JSON.parse(result);
  } catch(e) {
    console.warn('  ⚠ JSONパース失敗・スキップ');
    return html;
  }

  if (parsed.skip || !parsed.name) {
    console.log('  ⚠ 追記なし（重要な情報なし）');
    return html;
  }

  // 兵器カードHTMLを生成
  const card = `<div class="weapon-card">
  <div class="weapon-head">
    <div class="weapon-icon" style="background:rgba(58,138,58,0.2);">${parsed.icon || '🔫'}</div>
    <div>
      <div class="weapon-name">${parsed.name}</div>
      <div class="weapon-type">${parsed.type || ''}</div>
    </div>
  </div>
  <span class="weapon-tag" style="background:rgba(58,138,58,0.2);color:#6abf6a;">${TODAY_ISO} 新着</span>
  <div class="spec-row"><span class="spec-label">概要</span><span class="spec-val">${parsed.summary || ''}</span></div>
  <div class="spec-row"><span class="spec-label">意義</span><span class="spec-val">${parsed.significance || ''}</span></div>
</div>`;

  html = html.replace('<!-- WEAPONS:INSERT -->', `<!-- WEAPONS:INSERT -->\n${card}`);

  // 情報源リストを更新（WEAPONS:SOURCESマーカー）
  if (html.includes('<!-- WEAPONS:SOURCES -->')) {
    // 使用した記事のURLリストを生成
    const sourceNums = Array.isArray(parsed.source_nums) ? parsed.source_nums : [parsed.source_nums];
    const sourceLinks = sourceNums
      .filter(n => urlMap[n] && urlMap[n].url)
      .map(n => {
        const a = urlMap[n];
        const safeTitle = a.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<li style="margin:4px 0;">
          <a href="${a.url}" target="_blank" rel="noopener"
             style="color:#6abf6a;font-size:11px;text-decoration:none;border-bottom:1px solid rgba(106,191,106,0.3);"
             onmouseover="this.style.borderBottomColor='#6abf6a'"
             onmouseout="this.style.borderBottomColor='rgba(106,191,106,0.3)'">
            [${a.source}] ${safeTitle}
          </a>
        </li>`;
      }).join('\n');

    if (sourceLinks) {
      // 既存のSOURCESブロックを上書き
      const sourcesBlock = `<!-- WEAPONS:SOURCES -->
<div style="margin-top:20px;padding:14px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;">
  <div style="font-size:11px;color:var(--gold);letter-spacing:1.5px;margin-bottom:10px;font-family:'Oswald';">📎 情報源リスト（自動収集）</div>
  <ul style="list-style:none;padding:0;margin:0;">
    ${sourceLinks}
  </ul>
  <div style="font-size:10px;color:var(--gray);margin-top:8px;">最終更新：${TODAY}</div>
</div>`;

      html = html.replace(
        /<!-- WEAPONS:SOURCES -->[\s\S]*?(?=<div class="warn-box"|<!-- WEAPONS:SOURCES -->$)/,
        sourcesBlock + '\n'
      );
    }
  }

  console.log(`  ✅ 兵器解説追記完了（${parsed.name}）`);
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シンクタンクに新カードを先頭追記
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 背景編に最新タイムライン情報を掲載
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateTimelineNotice(html, timelineItem) {
  if (!html.includes('<!-- TIMELINE:UPDATE:START -->')) return html;
  if (!timelineItem || timelineItem.includes('SKIP')) return html;

  // タイムラインのtl-evとtl-descを抽出
  const evMatch  = timelineItem.match(/<div class="tl-ev">(.*?)<\/div>/s);
  const descMatch= timelineItem.match(/<div class="tl-desc">(.*?)<\/div>/s);
  const evText   = evMatch  ? evMatch[1].trim()   : '';
  const descText = descMatch? descMatch[1].trim()  : '';
  if (!evText) return html;

  const notice = `<!-- TIMELINE:UPDATE:START -->
<div style="background:rgba(58,138,58,0.08);border-left:3px solid var(--mid-blue);border-radius:0 6px 6px 0;padding:10px 16px;margin:10px 0 16px;">
  <div style="font-size:10px;color:var(--gold);letter-spacing:1.5px;margin-bottom:5px;font-family:'Oswald';">📅 最新タイムライン更新（${TODAY}）</div>
  <div style="font-size:13px;font-weight:700;color:var(--white);">${evText}</div>
  ${descText ? `<div style="font-size:12px;color:var(--gray);margin-top:3px;">${descText}</div>` : ''}
</div>
<!-- TIMELINE:UPDATE:END -->`;

  html = html.replace(
    /<!-- TIMELINE:UPDATE:START -->[\s\S]*?<!-- TIMELINE:UPDATE:END -->/,
    notice
  );
  console.log('  ✅ 背景編に最新タイムライン情報を掲載');
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② 戦況マップに現在時刻・戦況編に更新通知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateMapDatetime(html) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
  const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const datetime = `${dateStr} ${timeStr}`;

  // 戦況マップの現在時刻表示
  if (html.includes('<!-- MAP:DATETIME -->')) {
    const mapBlock = `<!-- MAP:DATETIME -->
<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);border-radius:6px;padding:6px 14px;margin-bottom:14px;font-size:12px;">
  <span style="color:var(--gold);font-family:'Oswald';letter-spacing:1px;">🕐 ${datetime}現在の戦況</span>
  <span style="width:8px;height:8px;border-radius:50%;background:#e74c3c;animation:blink 1.2s ease-in-out infinite;display:inline-block;"></span>
</div>`;
    html = html.replace('<!-- MAP:DATETIME -->', mapBlock);
  }

  // 戦況編に「〇月〇日〇時現在の戦況図」を更新
  if (html.includes('<!-- WAR:UPDATE:START -->')) {
    const warNotice = `<!-- WAR:UPDATE:START -->
<div style="background:rgba(58,138,58,0.08);border-left:3px solid var(--mid-blue);border-radius:0 6px 6px 0;padding:10px 16px;margin:10px 0 16px;">
  <div style="font-size:10px;color:var(--gold);letter-spacing:1.5px;margin-bottom:5px;font-family:'Oswald';">🗺 戦況マップ更新</div>
  <div style="font-size:13px;font-weight:700;color:var(--white);">${datetime}現在の戦況図</div>
  <div style="font-size:11px;color:var(--gray);margin-top:3px;">詳細は「<a href="#" onclick="show('map');return false;" style="color:var(--light-blue);text-decoration:none;">戦況マップ</a>」タブをご覧ください</div>
</div>
<!-- WAR:UPDATE:END -->`;
    html = html.replace(
      /<!-- WAR:UPDATE:START -->[\s\S]*?<!-- WAR:UPDATE:END -->/,
      warNotice
    );
  }

  // blinkerアニメーションをCSSに追加（未追加の場合のみ）
  if (!html.includes('@keyframes blink')) {
    html = html.replace(
      '</style>',
      `@keyframes blink{0%,100%{opacity:1;}50%{opacity:0.3;}}
</style>`
    );
  }

  console.log(`  ✅ 戦況マップに現在時刻（${datetime}）を表示`);
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ③ 第4部：経済編に最新経済ニュースを掲載
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateEconomyNotice(html, articles) {
  if (!html.includes('<!-- ECONOMY:UPDATE:START -->')) return html;

  const econArticles = articles.filter(a =>
    /経済|金融|制裁|支援|GDP|貿易|インフレ|食料|エネルギー|LNG|原油|小麦|財政|予算/i
      .test(a.title + a.desc)
  ).slice(0, 5);

  if (econArticles.length === 0) {
    console.log('  ⚠ 経済ニュースなし・スキップ');
    return html;
  }

  // Claudeに一番重要なトピックを1件選ばせる
  const headlines = econArticles.map((a, i) =>
    `${i+1}. [${a.source}] ${a.title}`
  ).join('\n');

  const urlMap = {};
  econArticles.forEach((a, i) => { urlMap[i+1] = a.link || ''; });

  const result = await callClaude(
`以下の経済ニュースから最も重要なものを1件選んでください。

【出力ルール】
JSON形式のみ（コードブロック不要）
{"source_num": 番号, "topic": "トピック名（15文字以内）", "summary": "概要（40文字以内）"}

【ニュース】
${headlines}`, 200
  );

  let econTopic = '経済情勢';
  let econSummary = '';
  let econUrl = '';

  if (result) {
    try {
      const parsed = JSON.parse(result);
      econTopic   = parsed.topic   || econTopic;
      econSummary = parsed.summary || '';
      econUrl     = urlMap[parsed.source_num] || '';
    } catch(e) { /* フォールバック */ }
  }

  const linkOpen  = econUrl ? `<a href="${econUrl}" target="_blank" rel="noopener" style="color:var(--light-blue);text-decoration:none;border-bottom:1px solid rgba(106,191,106,0.3);">` : '<span style="color:var(--light-blue);">';
  const linkClose = econUrl ? '</a>' : '</span>';

  const notice = `<!-- ECONOMY:UPDATE:START -->
<div style="background:rgba(58,138,58,0.08);border-left:3px solid var(--mid-blue);border-radius:0 6px 6px 0;padding:10px 16px;margin:10px 0 16px;">
  <div style="font-size:10px;color:var(--gold);letter-spacing:1.5px;margin-bottom:5px;font-family:'Oswald';">📈 最新情報（${TODAY}）</div>
  <div style="font-size:13px;font-weight:700;">${linkOpen}${econTopic}について更新${linkClose}</div>
  ${econSummary ? `<div style="font-size:12px;color:var(--gray);margin-top:3px;">${econSummary}</div>` : ''}
  <div style="font-size:11px;color:var(--gray);margin-top:4px;">詳細は「<a href="#" onclick="show('economy');return false;" style="color:var(--light-blue);text-decoration:none;">経済影響</a>」タブをご覧ください</div>
</div>
<!-- ECONOMY:UPDATE:END -->`;

  html = html.replace(
    /<!-- ECONOMY:UPDATE:START -->[\s\S]*?<!-- ECONOMY:UPDATE:END -->/,
    notice
  );
  console.log(`  ✅ 経済編に最新情報（${econTopic}）を掲載`);
  return html;
}

async function prependThinktank(html, articles) {
  if (!html.includes('<!-- THINKTANK:INSERT -->')) {
    console.log('  ⚠ シンクタンクマーカーなし・スキップ');
    return html;
  }

  // 分析・評価に関する記事に絞る（URLも保持）
  const analysisArticles = articles.filter(a =>
    /分析|評価|見解|報告|研究|専門家|シンクタンク|政策|戦略|安全保障|外交|停戦|交渉|支援|制裁/i
      .test(a.title + a.desc)
  ).slice(0, 6);

  if (analysisArticles.length === 0) {
    console.log('  ⚠ シンクタンク関連ニュースなし・スキップ');
    return html;
  }

  // URLマップを作成（番号→URL）
  const urlMap = {};
  const analysisNews = analysisArticles
    .map((a, i) => {
      urlMap[i + 1] = a.link || '';
      return `${i+1}. [${a.source}] ${a.title} — ${a.desc.slice(0, 80)}`;
    }).join('\n');

  console.log('\n🏛 シンクタンクに新カードを追記中...');

  // Claudeに「何番のニュースを使ったか」も返してもらう
  const result = await callClaude(
`あなたは国際安全保障・ウクライナ問題の専門アナリストです。
以下のニュースをもとに、${TODAY}時点での専門的な分析・見解を1件作成してください。

【出力ルール】
- 以下のJSON形式のみ出力（マークダウン・コードブロック不要）
- 重要な新分析がなければ {"skip": true} とだけ出力
- org には情報源の機関名・メディア名を記載
- source_num には使用したニュースの番号（1〜6の数字）を記載

{"skip": false, "source_num": 番号, "org": "機関名・メディア名", "quote": "分析・見解（80〜120文字）"}

【最新ニュース】
${analysisNews}`, 300
  );

  if (!result) {
    console.log('  ⚠ 追記なし（API未応答）');
    return html;
  }

  // JSONをパース
  let parsed;
  try {
    parsed = JSON.parse(result);
  } catch(e) {
    console.warn('  ⚠ JSONパース失敗・スキップ');
    return html;
  }

  if (parsed.skip || !parsed.org || !parsed.quote) {
    console.log('  ⚠ 追記なし（重要な分析なし）');
    return html;
  }

  // 対応するURLを取得
  const sourceUrl = urlMap[parsed.source_num] || '';
  const orgHTML = sourceUrl
    ? `<a href="${sourceUrl}" target="_blank" rel="noopener"
         style="color:var(--gold);text-decoration:none;border-bottom:1px solid rgba(201,168,76,0.4);"
         onmouseover="this.style.borderBottomColor='var(--gold)'"
         onmouseout="this.style.borderBottomColor='rgba(201,168,76,0.4)'">${parsed.org} 🔗</a>`
    : parsed.org;

  const card = `<div class="tt-card">
  <div class="tt-org">${orgHTML}</div>
  <div class="tt-quote">${parsed.quote.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  <div class="tt-date">${TODAY}｜自動収集</div>
</div>`;

  html = html.replace('<!-- THINKTANK:INSERT -->', `<!-- THINKTANK:INSERT -->\n${card}`);
  console.log(`  ✅ シンクタンク追記完了（${parsed.org} / ${sourceUrl || 'URLなし'}）`);
  return html;
}

async function main() {
  console.log('\n🚀 ウクライナレポート 毎日自動更新 開始');
  console.log(`   実行日時: ${TODAY}`);
  console.log(`   Claude API: ${HAS_CLAUDE ? '✅ 利用可能' : '⚠ なし（見出しのみ）'}\n`);

  if (!fs.existsSync('index.html')) {
    console.error('❌ index.html が見つかりません');
    process.exit(1);
  }

  // 1. RSS収集
  console.log('📡 RSSフィードを収集中...');
  const allArticles = [];
  for (const src of RSS_SOURCES) {
    process.stdout.write(`   ${src.name}... `);
    const items    = await fetchRSS(src);
    const relevant = items.filter(isRelevant);
    console.log(`${items.length}件 → ${relevant.length}件関連`);
    allArticles.push(...relevant);
  }

  // 重複除去
  const seen = new Set();
  const articles = allArticles.filter(a => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });
  console.log(`\n📊 合計 ${articles.length} 件の関連記事を収集\n`);

  if (articles.length === 0) {
    console.log('⚠ 関連記事なし。更新スキップ。');
    process.exit(0);
  }

  // 2. HTML更新（元コンテンツを保護しながら更新）
  let html = readHTML();
  html = await updateNewsBox(html, articles);          // ニュースボックス上書き
  const tlResult = await prependTimeline(html, articles); // タイムライン先頭追記
  html = tlResult.html;
  html = updateTimelineNotice(html, tlResult.item);    // ① 背景編に更新情報
  html = updateMapDatetime(html);                       // ② 戦況マップ・戦況編更新
  html = await updateEconomyNotice(html, articles);    // ③ 経済編に最新情報
  html = await prependWeapons(html, articles);         // 兵器解説先頭追記
  html = await prependThinktank(html, articles);       // シンクタンク先頭追記

  // 3. 保存
  writeHTML(html);
  console.log('\n✅ index.html を更新しました');

  // 4. ログ保存
  const log = {
    date: new Date().toISOString(),
    articlesFound: articles.length,
    claudeAvailable: HAS_CLAUDE,
  };
  fs.writeFileSync('scripts/last-update.json', JSON.stringify(log, null, 2));
  console.log('🎉 自動更新完了！');
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
