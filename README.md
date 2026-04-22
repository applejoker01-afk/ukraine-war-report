# 🇺🇦 ウクライナ戦争レポート 2026

4年間の戦況と今後の展望を包括的に解説するWebレポートプロジェクト

## 📋 プロジェクト概要

2022年2月24日に始まったロシアのウクライナ侵攻について、2026年4月時点での戦況を多角的に分析・解説するデジタルコンテンツです。

### 主な機能

- ✅ **GitHub Pages自動公開** - index.htmlを編集してプッシュするだけで自動デプロイ
- ✅ **アーカイブ機能** - 日付別に過去のレポートを自動保存
- ✅ **Note下書き生成** - Noteに投稿するためのテキストファイルを自動生成
- ✅ **インタラクティブな可視化** - タイムライン、戦況マップ、経済グラフ

## 🌐 公開URL

- **メインレポート**: `https://[あなたのGitHubユーザー名].github.io/ukraine-war-report/`
- **アーカイブ**: `https://[あなたのGitHubユーザー名].github.io/ukraine-war-report/archive/`

## 📂 ファイル構成

```
ukraine-war-report/
├── index.html                  # メインレポート
├── README.md                   # このファイル
├── archive/                    # 日付別アーカイブ（自動生成）
│   ├── index.html              # アーカイブ一覧ページ
│   ├── 2026-04-22.html         # 4月22日版
│   └── 2026-04-23.html         # 4月23日版
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions設定
└── scripts/
    ├── package.json
    ├── post-to-note.js         # Note下書き生成
    └── build-archive.js        # アーカイブ一覧生成
```

## 🚀 セットアップ手順

### 1. GitHubリポジトリを作成

1. GitHub Desktopを開く
2. `File` → `New repository`
3. 名前: `ukraine-war-report` (任意)
4. **Public（公開）に設定** ← GitHub Pages無料利用に必須
5. `Create repository` をクリック

### 2. ファイルを配置

1. GitHub Desktop → `Repository` → `Show in Explorer`
2. このプロジェクトのファイルをすべてコピー
3. `.github` と `scripts` フォルダは手動で作成

### 3. コミット＆プッシュ

1. GitHub Desktopで変更を確認
2. Summaryに「初回：ウクライナ戦争レポート2026」と入力
3. `Commit to main` をクリック
4. `Publish repository` または `Push origin` をクリック

### 4. GitHub Pagesを有効化

1. GitHubリポジトリページにアクセス
2. `Settings` → `Pages`
3. Source を **GitHub Actions** に変更
4. デプロイが完了するまで2〜3分待つ

### 5. GitHub Secretsを設定（Note投稿用・オプション）

Note記事への半自動投稿を使う場合のみ：

1. リポジトリ → `Settings` → `Secrets and variables` → `Actions`
2. `New repository secret` で以下を登録：

| Secret名 | 値 |
|---------|-----|
| `PAGES_URL` | `https://[ユーザー名].github.io/ukraine-war-report` |

**Note APIは非公開のため、完全自動投稿は不可。下書きテキスト生成のみ対応。**

## 📝 日常的な使い方

### レポートを更新する

1. `index.html` をメモ帳・VSCodeなどで編集
2. GitHub Desktop でコミット＆プッシュ
3. 2〜3分待つとGitHub Pagesが自動更新
4. アーカイブに日付別で自動保存される

### Noteに投稿する（半自動）

1. GitHub Actionsが完了したら、`Actions` タブを開く
2. 最新のワークフローをクリック
3. `Artifacts` → `NOTE-DRAFT` をダウンロード
4. `note-draft.txt` を開いてコピー
5. Noteの編集画面に貼り付けて公開

### 過去のレポートを見る

- `https://[ユーザー名].github.io/ukraine-war-report/archive/` にアクセス
- 日付をクリックするとその日のレポートが開く

## 🛠️ トラブルシューティング

### GitHub Pagesが404エラー

- `index.html` がリポジトリルートに配置されているか確認
- Settings → Pages で Source が **GitHub Actions** になっているか確認
- 初回デプロイは5〜10分かかる場合があります

### GitHub Actionsが失敗する

- `deploy.yml` の YAML構文が正しいか確認
- `scripts/package.json` が存在するか確認
- GitHub Actionsのログで詳細なエラーを確認

### アーカイブが生成されない

- `archive` フォルダが存在するか確認（自動作成されます）
- GitHub Actionsが正常に完了しているか確認

## 📚 コンテンツ情報源

本レポートは以下の信頼できる情報源を基に作成されています：

- **ISW** (Institute for the Study of War) - 毎日の戦況分析
- **日本国際問題研究所（JIIA）** - 戦略アウトルック2026
- **防衛省防衛研究所（NIDS）** - NIDSコメンタリー
- **IISS** (国際戦略研究所) - Military Balance
- **Ukrinform** - ウクライナ国営通信社
- **Bloomberg**, **日本経済新聞** - 経済分析

## 📊 技術スタック

| 技術 | 用途 |
|-----|------|
| HTML/CSS/JavaScript | フロントエンド |
| Chart.js | グラフ描画 |
| GitHub Pages | 無料Webホスティング |
| GitHub Actions | 自動デプロイ・アーカイブ |
| Node.js | スクリプト実行 |
| Cheerio | HTML解析 |
| Turndown | HTML→Markdown変換 |

## 🔄 今後の拡張予定

- [ ] ISWの最新レポート自動取得・反映
- [ ] 経済指標（原油価格・為替）のAPI自動取得
- [ ] Google Analytics追加
- [ ] OGP画像自動生成
- [ ] 複数記事シリーズ対応

## 📄 ライセンス

MIT License

## 👤 作成者

としひで

---

最終更新：2026年4月22日
