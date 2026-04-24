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
    return html;
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
    return html;
  }

  html = html.replace('<!-- TIMELINE:INSERT -->', `<!-- TIMELINE:INSERT -->\n${item}`);
  console.log('  ✅ タイムライン追記完了');
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 兵器解説に先頭追記
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function prependWeapons(html, articles) {
  if (!html.includes('<!-- WEAPONS:INSERT -->')) {
    console.log('  ⚠ 兵器マーカーなし・スキップ');
    return html;
  }

  const weaponNews = articles.filter(a =>
    /ドローン|ミサイル|兵器|武器|F-16|ATACMS|パトリオット|drone|missile|weapon/i
      .test(a.title + a.desc)
  ).slice(0, 4).map((a, i) => `${i+1}. ${a.title}`).join('\n');

  if (!weaponNews) {
    console.log('  ⚠ 兵器関連ニュースなし・スキップ');
    return html;
  }

  console.log('\n🔫 兵器解説に新情報を追記中...');
  const card = await callClaude(
`以下の兵器関連ニュースから最重要の新情報を1件選んでください。

【出力ルール】
- 以下のHTML形式のみ出力（マークダウン・コードブロック不要）
- 重要な新情報がなければ <!-- SKIP --> とだけ出力

<div class="weapon-card">
  <div class="weapon-head">
    <div class="weapon-icon" style="background:rgba(58,138,58,0.2);">絵文字</div>
    <div>
      <div class="weapon-name">兵器・技術名</div>
      <div class="weapon-type">種別｜使用国</div>
    </div>
  </div>
  <span class="weapon-tag" style="background:rgba(58,138,58,0.2);color:#6abf6a;">${TODAY_ISO} 新着</span>
  <div class="spec-row"><span class="spec-label">概要</span><span class="spec-val">30文字以内</span></div>
  <div class="spec-row"><span class="spec-label">意義</span><span class="spec-val">30文字以内</span></div>
</div>

【ニュース】
${weaponNews}`, 400
  );

  if (!card || card.includes('SKIP') || !card.includes('weapon-card')) {
    console.log('  ⚠ 追記なし');
    return html;
  }

  html = html.replace('<!-- WEAPONS:INSERT -->', `<!-- WEAPONS:INSERT -->\n${card}`);
  console.log('  ✅ 兵器解説追記完了');
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
  html = await updateNewsBox(html, articles);     // ニュースボックス上書き
  html = await prependTimeline(html, articles);   // タイムライン先頭追記
  html = await prependWeapons(html, articles);    // 兵器解説先頭追記

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
