# 環境構築ガイド

## 事前に必要なもの

- Node.js
- pnpm
- Cloudflareアカウント（無料プランで可）
- Googleサービスアカウントの JSONキー、および対象スプレッドシートの共有ドライブ閲覧権限
- GitHubリポジトリ（Cloudflare Pagesの自動デプロイに使用）
- Googleスプレッドシート

### mise によるNode.js / pnpmのセットアップ

このプロジェクトは `mise` でツールバージョンを管理する前提です。corepackは使用しません。
すでに `mise` 自体がインストール・シェルに設定済みであることを前提とします。

プロジェクトルートに `mise.toml` を用意します（リポジトリに設定済み）。

```toml
# .mise.toml
[tools]
node = "26"
pnpm = "11"
```

```bash
mise trust        # このプロジェクトの .mise.toml を信頼する（初回のみ）
mise install      # mise.toml に従ってNode.js / pnpmをインストール
mise current      # 有効化されたバージョンを確認
pnpm --version
```

以降、プロジェクトディレクトリに入ると `mise` が自動で該当バージョンのNode.js / pnpmを有効化します。

### Google Cloud側の準備（初回のみ）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを選択・作成
2. 「APIとサービス」→「ライブラリ」から **Google Sheets API** を有効化
3. 「APIとサービス」→「認証情報」からサービスアカウントを作成し、JSONキーをダウンロード
4. 対象スプレッドシートにサービスアカウントのメールアドレス
   （`xxxx@xxxx.iam.gserviceaccount.com` の形式）を**閲覧者**として追加

---

## 1. プロジェクトの取得とセットアップ

```bash
git clone <このプロジェクトのリポジトリURL>
cd <プロジェクトディレクトリ>
pnpm install
```

新規にプロジェクトを作る場合は以下から始めます。エラーが出た場合はよしなに。

```bash
pnpm create astro@latest .
pnpm astro add cloudflare
```

`astro.config.mjs` は以下の形になっていればOKです。**`output: 'server'`は不要です**（Astro 5以降、`hybrid`が廃止されて`static`/`server`のみになり、Astro 6では`astro add cloudflare`も`output`行を書き込まなくなりました。デフォルトの`static`のまま、SSRが必要なページだけ個別に`prerender = false`を指定するのが現行の推奨スタイルです）。

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
 
export default defineConfig({
  adapter: cloudflare(),
});
```

QAページ（`src/pages/company.astro`）と更新API（`src/pages/api/refresh.ts`）側に、それぞれ個別でSSRを指定します。
 
```astro
---
// src/pages/company.astro
export const prerender = false;
---
```
 
```ts
// src/pages/api/refresh.ts
export const prerender = false;
```

---

## 2. Wrangler CLIのセットアップ

Wrangler は `pnpm astro add cloudflare` の際に依存関係として入りますが、
CLIとして直接使う場合は以下でログインします。

```bash
pnpm wrangler login
```

ブラウザが開くので、Cloudflareアカウントでログイン・認可してください。

---

## 3. D1データベースの作成

```bash
pnpm wrangler d1 create faq-pages-db
```

### スキーマの適用
 
このプロジェクトはスキーマ変更の頻度が低いため、`wrangler d1 migrations`（マイグレーション管理の仕組み）は使わず、`d1 execute`でローカル・本番とも同じSQLファイルを直接適用します。
 
```bash
# ローカル開発用データベースに適用
pnpm wrangler d1 execute faq-pages-db --local --file=.agents/skills/sheets-cms-qa-site/references/d1-schema.sql
 
# 本番データベースに適用（デプロイ前に一度でOK。以降はスキーマ変更時のみ）
pnpm wrangler d1 execute faq-pages-db --remote --file=.agents/skills/sheets-cms-qa-site/references/d1-schema.sql
```
 
> 将来スキーマ変更を重ねる予定が出てきたら、`wrangler d1 migrations create`でmigrationsの仕組みに切り替えても構いません。

---

## 4. ローカル環境変数の設定

ローカル開発時にAPIルート（`/api/refresh`）からGoogle Sheets APIを呼び出すため、
プロジェクトルートに `.dev.vars` を作成します（**このファイルはGitにコミットしないでください**）。

```bash
# .dev.vars
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account", ... サービスアカウントのJSON全体を1行で ...}
SPREADSHEET_ID=＜対象スプレッドシートのID（URLの/d/と/editの間の文字列）＞
REFRESH_TOKEN=＜更新API認証用の任意のランダムな文字列＞
```

`.gitignore` に `.dev.vars` が含まれていることを確認してください。

---

## 5. ローカルでの起動・確認

```bash
pnpm astro dev
```

`http://localhost:4321` で起動します。QAページの確認は以下のようなURLです。

```
http://localhost:4321/company?id=sample-a
```

更新APIをローカルで直接叩いて動作確認する場合：

```bash
curl -X POST http://localhost:4321/api/refresh \
  -H 'Authorization: Bearer <REFRESH_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data '{}'

```

`{"message": "3社・45件のQAを反映しました"}` のようなレスポンスが返れば成功です。

---

## 6. Cloudflare Pagesプロジェクトの作成

1. Cloudflareダッシュボード → 「Workers & Pages」→「作成」→「Pages」タブ
2. 対象のGitHubリポジトリを選択して接続（push時に自動デプロイされます）

---

## 7. D1バインディングの紐付け（ダッシュボード側）

1. 作成したPagesプロジェクト →「Bindings」-> D1 database で Add binding
2. Variable name: `DB`（`wrangler.jsonc` の `binding` と完全一致させること）
3. Database: 手順2で作成した `faq-pages-db` を選択して Add binding

> `wrangler.jsonc`（ローカル用）とダッシュボード（本番デプロイ用）は別々の設定です。
> 片方だけ設定して「動かない」とならないよう、両方に同じ内容を設定してください。

---

## 8. 環境変数・シークレットの登録（ダッシュボード側）
  Pagesプロジェクト →「Settings」→「Variables and secrets」で、
**Variable name** と **Value** の両方に以下を登録します。

| 変数名 | 値 | タイプ |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | サービスアカウントのJSONキー全体 | Secret |
| `SPREADSHEET_ID` | 対象スプレッドシートのID | Plain text |
| `REFRESH_TOKEN` | 更新API認証用のランダムな文字列（`.dev.vars`とは別に、本番用として新しく発行推奨） | Secret |

また、Cloudflare Pagesの環境変数でNode/pnpmを固定する（ローカルと合わせる）ため
「Settings」→「Build」→「Variables and secrets」にビルド環境変数を設定します。
| 変数名 | 値 |
|---|---|
| `NODE_VERSION` | 26 |
| `PNPM_VERSION` | 11 |

---

## 9. スプレッドシート側の設定

1. スプレッドシートの「拡張機能」→「Apps Script」を開く
2. スキルの `references/apps-script.md` に記載のコードを貼り付け
3. 左側の歯車アイコン（プロジェクトの設定）→「スクリプト プロパティ」で
   `REFRESH_TOKEN` を追加し、手順4で本番用に発行したものと**同じ値**を設定
4. スプレッドシートを再読み込みすると、メニューバーに「サイト更新」が表示される

---

## 10. デプロイと本番確認

```bash
git push origin main
```

Cloudflare Pagesが自動でビルド・デプロイを行います。デプロイ完了後、以下を確認してください。

- [ ] スプレッドシートの「サイト更新」→「今すぐ反映する」を実行し、成功メッセージが表示される
- [ ] `https://<プロジェクト名>.pages.dev/company?id=sample-a` のようなURLでページが表示される
- [ ] 各社の基本情報・QAが正しく表示されている
- [ ] 「設定」または各QAシートの「公開」をFALSEにして更新すると、その内容が表示されなくなる
- [ ] 独自ドメインを使う場合は「Custom domains」からドメインを追加し、DNS設定を行う
