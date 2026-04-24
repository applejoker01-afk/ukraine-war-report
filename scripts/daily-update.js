// scripts/daily-update.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ウクライナ戦争レポート 毎日自動更新スクリプト（強化版）
//
// ① 上書き更新（最新情報で内容を置き換え）:
//    - 解説（script）    : 最新情勢サマリーを生成
//    - 戦況マップ（map） : 前線状況・KPI数値を更新
//    - 経済影響（economy）: 最新の経済指標を更新
//    - シンクタンク（thinktank）: 最新分析・引用を更新
//
// ② 追記更新（先頭に追加・既存を保持）:
//    - タイムライン（timeline）: 新イベントを先頭に追加
//    - 兵器解説（weapons）: 新兵器情報をカードとして追加
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
  { name: 'Reuters',   url: 'https://feeds.reuters.com/reuters/worldNews' },
  { name: 'ISW',       url: 'https://www.understandingwar.org/feeds/publication/0/rss.xml' },
];

const KEYWORDS = ['ウクライナ','ロシア','ゼレンスキー','プーチン','ドネツク',
  'キーウ','NATO','停戦','ukraine','russia','zelensky','putin','donbas','kharkiv','crimea'];

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
      desc:    (item.description?._ || item.description || item.summary?._ || '').replace(/<[^>]+>/g,'').trim(),
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

// ── Claude API 呼び出し ────────────────────────
async function callClaude(prompt, maxTokens = 1200) {
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || null;
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

// セクションマーカーで囲まれた部分を置き換え
function replaceSection(html, sectionId, newContent) {
  const startTag = `<!-- SECTION:${sectionId}:START -->`;
  const endTag   = `<!-- SECTION:${sectionId}:END -->`;
  if (html.includes(startTag)) {
    return html.replace(
      new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'm'),
      `${startTag}\n${newContent}\n${endTag}`
    );
  }
  // マーカーがない場合はそのまま返す
  console.warn(`  ⚠ セクションマーカーが見つかりません: ${sectionId}`);
  return html;
}

// タイムラインの先頭に追記
function prependTimeline(html, newItem) {
  const marker = '<!-- TIMELINE:INSERT -->';
  if (!html.includes(marker)) return html;
  return html.replace(marker, `${marker}\n${newItem}`);
}

// 兵器解説の先頭に追記
function prependWeapon(html, newCard) {
  const marker = '<!-- WEAPONS:INSERT -->';
  if (!html.includes(marker)) return html;
  return html.replace(marker, `${marker}\n${newCard}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 解説セクション更新（上書き）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateScript(articles) {
  console.log('\n📄 解説セクションを更新中...');
  const headlines = articles.slice(0, 15)
    .map((a, i) => `${i+1}. [${a.source}] ${a.title}`)
    .join('\n');

  const summary = await callClaude(`
あなたはロシア・ウクライナ戦争の専門アナリストです。
以下の最新ニュース見出しをもとに、${TODAY}時点のウクライナ情勢の最新サマリーを日本語で作成してください。

【出力形式】HTMLのみ。以下の構造で出力してください。<div>等の外側のタグは不要です。
- <p class="script-p">タグで戦況の総括（3〜4文）
- <div class="script-h2">最新の主要動向</div> に続けて <p class="script-p"> で箇条書き風に3点
- <p class="script-p">日本・国際社会への影響（2〜3文）

【最新ニュース見出し】
${headlines}

※ 日付は${TODAY}として記述。HTMLタグのみ出力し、説明文は不要。
  `, 800);

  if (!summary) {
    console.log('  ⚠ 生成スキップ（API未応答）');
    return null;
  }

  const content = `
<div class="script-section" id="auto-summary">
  <div class="script-h1">📡 最新情勢サマリー（${TODAY} 自動更新）</div>
  ${summary}
  <div class="note-box">※ 上記は最新ニュースをAIが自動要約したものです。詳細は各情報源でご確認ください。</div>
</div>`;

  console.log('  ✅ 解説セクション生成完了');
  return content;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 戦況マップセクション更新（上書き）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateMap(articles) {
  console.log('\n🗺 戦況マップセクションを更新中...');
  const headlines = articles.slice(0, 10)
    .map((a, i) => `${i+1}. [${a.source}] ${a.title}`)
    .join('\n');

  const mapSummary = await callClaude(`
あなたはウクライナ戦争の軍事アナリストです。
以下のニュースをもとに、${TODAY}時点の前線状況を日本語で分析してください。

【出力形式】HTMLのみ。以下の構造で出力。
- KPIカード3枚分のデータ：<div class="kpi-card">タグ形式で、最新の推定値を記入
  例：<div class="kpi-card"><div class="kpi-num">XX<span class="kpi-unit">万人</span></div><div class="kpi-desc">説明</div></div>
- <p style="font-size:13px;color:#ccd8cc;line-height:1.8;">タグで前線状況の説明（3〜4文）

【最新ニュース】
${headlines}

【既知の基本情報】侵攻4年目。ドネツク州で激戦継続。停戦交渉膠着中。ドローン攻撃が主要な戦術。
※HTMLタグのみ出力。
  `, 600);

  if (!mapSummary) return null;

  const content = `
<div class="kpi-grid" id="map-kpi">
  ${mapSummary}
</div>
<p style="font-size:11px;color:var(--gray);margin-top:8px;">※ ${TODAY} 自動更新。数値は推計値です。</p>`;

  console.log('  ✅ 戦況マップ更新完了');
  return content;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 経済影響セクション更新（上書き）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateEconomy(articles) {
  console.log('\n📈 経済影響セクションを更新中...');
  const headlines = articles.filter(a =>
    /食料|エネルギー|小麦|LNG|制裁|経済|貿易|原油|価格|支援/i.test(a.title + a.desc)
  ).slice(0, 8).map((a, i) => `${i+1}. [${a.source}] ${a.title}`).join('\n');

  if (!headlines) {
    console.log('  ⚠ 経済関連ニュースなし・スキップ');
    return null;
  }

  const econSummary = await callClaude(`
あなたは国際経済アナリストです。ウクライナ戦争が日本経済に与える最新の影響を分析してください。

【出力形式】HTMLのみ。
- <table class="impact-table" style="width:100%"> タグで、最新の影響を5〜6行の表形式で出力
  各行は <tr><td>分野</td><td>具体的な影響・最新数値</td></tr> 形式
  分野例：食料・エネルギー・対露制裁・支援コスト・防衛費・産業
- 表の前に <div style="font-family:'Noto Serif JP';font-size:15px;font-weight:700;margin-bottom:16px;">🇯🇵 ${TODAY}時点の経済影響</div>

【最新ニュース】
${headlines || '食料価格高止まり。LNG価格上昇継続。日本の支援総額1兆円超。'}
※HTMLタグのみ出力。
  `, 700);

  if (!econSummary) return null;

  const content = `
<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:20px;margin-top:16px;" id="economy-latest">
  ${econSummary}
  <div style="margin-top:10px;font-size:10px;color:var(--gray);">※ ${TODAY} 自動更新。数値は公開情報に基づく推計です。</div>
</div>`;

  console.log('  ✅ 経済影響更新完了');
  return content;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① シンクタンクセクション更新（上書き）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateThinktank(articles) {
  console.log('\n🏛 シンクタンクセクションを更新中...');
  const headlines = articles.slice(0, 12)
    .map((a, i) => `${i+1}. [${a.source}] ${a.title} — ${a.desc.slice(0,80)}`)
    .join('\n');

  const ttSummary = await callClaude(`
あなたは安全保障・国際政治の専門アナリストです。
以下のニュースをもとに、${TODAY}時点でのウクライナ戦争に関する専門機関・有識者の分析・見解を
日本語でまとめてください。

【出力形式】HTMLのみ。tt-card形式で3〜4枚出力。
<div class="tt-card">
  <div class="tt-org">機関名・専門家名</div>
  <div class="tt-quote">分析内容（2〜3文）</div>
  <div class="tt-date">${TODAY}</div>
</div>

【最新ニュース】
${headlines}

【参考機関】ISW、防衛研究所、JIIA、笹川平和財団、キール研究所など
※実際のニュースから推測できる分析を記述。HTMLタグのみ出力。
  `, 900);

  if (!ttSummary) return null;

  const content = `
<div style="margin-bottom:16px;padding:12px 16px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.3);border-radius:8px;font-size:12px;color:var(--gray);">
  📡 最新分析（${TODAY} 自動更新）
</div>
${ttSummary}`;

  console.log('  ✅ シンクタンク更新完了');
  return content;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② タイムライン 先頭追記
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function buildTimelineItem(articles) {
  console.log('\n📅 タイムラインに新イベントを追記中...');
  const headlines = articles.slice(0, 8)
    .map((a, i) => `${i+1}. ${a.title}`)
    .join('\n');

  const item = await callClaude(`
以下のニュース見出しから、${TODAY}の最も重要な出来事を1件選び、
タイムライン用のHTMLを生成してください。

【出力形式】以下のHTML1件のみ出力。他のテキスト不要。
<div class="tl-item">
  <div class="tl-date">${TODAY_ISO.slice(0,7).replace('-','年')+'月'}<br>${TODAY_ISO.slice(8)}日</div>
  <div class="tl-dot"></div>
  <div class="tl-content">
    <div class="tl-ev">絵文字 イベントタイトル（20文字以内）</div>
    <div class="tl-desc">詳細説明（50〜80文字）</div>
  </div>
</div>

【ニュース】
${headlines}

※重要度が低い場合はタグ内に <!-- SKIP --> と記述してください。
  `, 400);

  if (!item || item.includes('SKIP')) {
    console.log('  ⚠ 新規追記なし（重要なイベントなし）');
    return null;
  }
  console.log('  ✅ タイムライン追記完了');
  return item;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② 兵器解説 先頭追記
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function buildWeaponCard(articles) {
  console.log('\n🔫 兵器解説に新情報を追記中...');
  const weaponNews = articles.filter(a =>
    /ドローン|ミサイル|戦車|兵器|武器|F-16|ATACMS|パトリオット|drone|missile|weapon/i
      .test(a.title + a.desc)
  ).slice(0, 5).map((a, i) => `${i+1}. ${a.title}`).join('\n');

  if (!weaponNews) {
    console.log('  ⚠ 兵器関連ニュースなし・スキップ');
    return null;
  }

  const card = await callClaude(`
以下の兵器・軍事技術関連ニュースから、最も注目すべき新情報を1件選び、
解説カードのHTMLを生成してください。

【出力形式】以下のHTMLのみ出力。
<div class="weapon-card">
  <div class="weapon-head">
    <div class="weapon-icon" style="background:rgba(58,138,58,0.2);">絵文字</div>
    <div>
      <div class="weapon-name">兵器・技術名</div>
      <div class="weapon-type">種別｜使用国</div>
    </div>
  </div>
  <span class="weapon-tag" style="background:rgba(58,138,58,0.2);color:#6abf6a;">${TODAY}新着</span>
  <div class="spec-row"><span class="spec-label">概要</span><span class="spec-val">内容（30文字以内）</span></div>
  <div class="spec-row"><span class="spec-label">意義</span><span class="spec-val">軍事的意義（30文字以内）</span></div>
  <div class="spec-row"><span class="spec-label">情報源</span><span class="spec-val">情報源名</span></div>
</div>

【ニュース】
${weaponNews}

※重要な新情報がない場合は <!-- SKIP --> とだけ記述してください。
  `, 500);

  if (!card || card.includes('SKIP')) {
    console.log('  ⚠ 新規兵器情報なし・スキップ');
    return null;
  }
  console.log('  ✅ 兵器解説追記完了');
  return card;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HTMLにセクションマーカーが存在しない場合、初回に挿入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ensureMarkers(html) {
  let modified = html;

  // 解説セクションマーカー（scriptセクション内の最初のscript-sectionの前）
  if (!modified.includes('<!-- SECTION:script-summary:START -->')) {
    modified = modified.replace(
      '<div class="script-section">\n<div class="script-h1">📋 全体構成</div>',
      '<!-- SECTION:script-summary:START -->\n<!-- SECTION:script-summary:END -->\n<div class="script-section">\n<div class="script-h1">📋 全体構成</div>'
    );
  }

  // 戦況マップKPIマーカー
  if (!modified.includes('<!-- SECTION:map-kpi:START -->')) {
    modified = modified.replace(
      '<div class="kpi-grid" style="margin-bottom:20px;">',
      '<!-- SECTION:map-kpi:START -->\n<!-- SECTION:map-kpi:END -->\n<div class="kpi-grid" style="margin-bottom:20px;">'
    );
  }

  // 経済影響マーカー（impact-tableの後）
  if (!modified.includes('<!-- SECTION:economy-latest:START -->')) {
    modified = modified.replace(
      '</div>\n</section>\n\n<!-- ════ THINKTANK',
      '<!-- SECTION:economy-latest:START -->\n<!-- SECTION:economy-latest:END -->\n</div>\n</section>\n\n<!-- ════ THINKTANK'
    );
  }

  // シンクタンクマーカー（tt-gridの前）
  if (!modified.includes('<!-- SECTION:thinktank-latest:START -->')) {
    modified = modified.replace(
      '<div class="tt-grid">',
      '<!-- SECTION:thinktank-latest:START -->\n<!-- SECTION:thinktank-latest:END -->\n<div class="tt-grid">'
    );
  }

  // タイムライン追記マーカー（timelineの最初のtl-itemの前）
  if (!modified.includes('<!-- TIMELINE:INSERT -->')) {
    modified = modified.replace(
      /(<div class="timeline">[\s\n]*<div class="tl-item">)/,
      '<div class="timeline">\n<!-- TIMELINE:INSERT -->\n<div class="tl-item">'
    );
  }

  // 兵器解説追記マーカー（weapon-gridの最初のweapon-cardの前）
  if (!modified.includes('<!-- WEAPONS:INSERT -->')) {
    modified = modified.replace(
      /(<div class="weapon-grid">[\s\n]*<div class="weapon-card">)/,
      '<div class="weapon-grid">\n<!-- WEAPONS:INSERT -->\n<div class="weapon-card">'
    );
  }

  return modified;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  console.log(`\n🚀 ウクライナレポート 毎日自動更新 開始`);
  console.log(`   実行日時: ${TODAY}`);
  console.log(`   Claude API: ${HAS_CLAUDE ? '✅ 利用可能' : '⚠ なし（スキップ）'}\n`);

  if (!fs.existsSync('index.html')) {
    console.error('❌ index.html が見つかりません');
    process.exit(1);
  }

  // 1. RSS収集
  console.log('📡 RSSフィードを収集中...');
  const allArticles = [];
  for (const src of RSS_SOURCES) {
    process.stdout.write(`   ${src.name}... `);
    const items = await fetchRSS(src);
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

  // 2. HTMLにマーカーを確保（初回のみ）
  let html = readHTML();
  // マーカーはindex.htmlに直接埋め込み済み

  // 3. ① 上書き更新セクション
  const scriptContent   = await updateScript(articles);
  const mapContent      = await updateMap(articles);
  const econContent     = await updateEconomy(articles);
  const thinktankContent= await updateThinktank(articles);

  if (scriptContent)    html = replaceSection(html, 'script-summary',    scriptContent);
  if (mapContent)       html = replaceSection(html, 'map-kpi',           mapContent);
  if (econContent)      html = replaceSection(html, 'economy-latest',    econContent);
  if (thinktankContent) html = replaceSection(html, 'thinktank-latest',  thinktankContent);

  // 4. ② 追記更新セクション
  const timelineItem = await buildTimelineItem(articles);
  const weaponCard   = await buildWeaponCard(articles);

  if (timelineItem) html = prependTimeline(html, timelineItem);
  if (weaponCard)   html = prependWeapon(html, weaponCard);

  // 5. 保存
  writeHTML(html);
  console.log('\n✅ index.html を更新しました');

  // 6. 更新ログ
  const log = {
    date: new Date().toISOString(),
    articlesFound: articles.length,
    updated: {
      script:    !!scriptContent,
      map:       !!mapContent,
      economy:   !!econContent,
      thinktank: !!thinktankContent,
      timeline:  !!timelineItem,
      weapons:   !!weaponCard,
    }
  };
  fs.writeFileSync('scripts/last-update.json', JSON.stringify(log, null, 2), 'utf8');
  console.log('📝 更新ログを保存しました');
  console.log('\n🎉 自動更新完了！');
  console.log(JSON.stringify(log.updated, null, 2));
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
