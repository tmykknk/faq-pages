# セキュリティポリシー

この文書は、QA サイトで現在実装しているセキュリティ対策と運用上の注意をまとめたものです。対象は公開 QA ページと、スプレッドシートの内容を D1 に同期する更新 API（`POST /api/refresh`）です。

## 基本方針

- 公開ページは誰でも閲覧できる設計とし、更新 API のみを認証対象にします。
- 認証情報はソースコード、URL、Git の履歴に残しません。
- ブラウザが実行・読み込めるリソースを CSP で最小限に制限します。
- スプレッドシートの不正な内容は、D1 を更新する前に検証して拒否します。

## 実装済みの対策

### HTTP セキュリティヘッダー

`src/middleware.ts` が Astro ルートのレスポンスに次のヘッダーを付与します。

| ヘッダー / ディレクティブ  | 設定                                       | 目的                                                                                          |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`  | `default-src 'self'`                       | 指定のない種類のリソースを同一オリジンに限定                                                  |
| `script-src`               | `'self'`                                   | 同一オリジンの外部スクリプトだけを許可。インラインスクリプトは不許可                          |
| `style-src`                | `'self'`                                   | スタイルの取得元を同一オリジンに限定                                                          |
| `style-src-elem`           | `'self' 'unsafe-inline'`                   | `<style>` 要素は許可。Astro/Vite が開発時に生成するスタイル要素との互換性のための限定的な例外 |
| `style-src-attr`           | `'none'`                                   | `style="..."` 属性を不許可                                                                    |
| `img-src`                  | `'self' data:`                             | 画像を同一オリジンと `data:` URL に限定                                                       |
| `font-src` / `connect-src` | `'self'`                                   | フォントと通信先を同一オリジンに限定                                                          |
| `base-uri`                 | `'self'`                                   | `<base>` による URL 解決先の書き換えを抑止                                                    |
| `object-src`               | `'none'`                                   | プラグインコンテンツを不許可                                                                  |
| `frame-ancestors`          | `'none'`                                   | 他サイトからの iframe 埋め込みを不許可                                                        |
| `form-action`              | `'self'`                                   | フォームの送信先を同一オリジンに限定                                                          |
| `X-Content-Type-Options`   | `nosniff`                                  | MIME タイプの推測を抑止                                                                       |
| `X-Frame-Options`          | `DENY`                                     | 古いブラウザ向けにも iframe 埋め込みを拒否                                                    |
| `Referrer-Policy`          | `strict-origin-when-cross-origin`          | 外部サイトへ送る Referer 情報を最小化                                                         |
| `Permissions-Policy`       | `camera=(), microphone=(), geolocation=()` | カメラ・マイク・位置情報 API を不許可                                                         |

`script-src 'unsafe-inline'` と `style-src-attr 'unsafe-inline'` は追加しません。これにより、HTML 注入が発生した場合でもインライン JavaScript や `style` 属性が実行・適用されにくくなります。

> ローカルの `pnpm astro dev` では Astro Dev Toolbar がインラインスクリプトや `style` 属性を使うため、ブラウザコンソールに CSP 警告が出ることがあります。これは開発補助機能がブロックされているだけで、公開ビルドには Dev Toolbar は含まれません。必要なら `pnpm astro preferences disable devToolbar` でローカルのツールバーのみ無効化できます。

### 更新 API の認証と濫用抑止

`POST /api/refresh` は次のように保護されています。

- `Authorization: Bearer <REFRESH_TOKEN>` が完全一致しないリクエストは `401` で拒否します。
- `POST` 以外は `405 Method Not Allowed` で拒否します。
- 認証成功後、`REFRESH_RATE_LIMIT` により更新は **60 秒あたり 5 回** に制限されます。超過時は `429 Too Many Requests`、`Retry-After: 60`、`Cache-Control: no-store` を返します。
- Bearer トークンは URL やクエリ文字列には載せず、Apps Script の Script Properties と Cloudflare の Secret にのみ保存します。

レート制限は更新の連打を抑える補助策です。認証の代わりにはならないため、`REFRESH_TOKEN` は十分に長いランダム値を使い、漏えい時は Cloudflare と Apps Script の両方で直ちに更新します。

### スプレッドシート入力の検証と D1 更新

更新 API は D1 を書き換える前に、スプレッドシートの内容を検証します。

- `識別子` は半角英数字のみ、重複なし、会社名は必須です。
- QA のカテゴリ・質問・回答は必須です。
- `個別QA_<識別子>` タブの識別子が「設定」シートに存在しない場合は `400` で拒否します。
- Google Sheets API から必要なすべてのシートを取得できない場合は更新しません。
- 検証後の D1 操作ではプレースホルダー付きの prepared statement を使い、値を SQL 文字列へ連結しません。
- 会社・QA の `公開` が `FALSE` のデータは公開ページに表示しません。

Google Sheets API には読み取り専用スコープ（`spreadsheets.readonly`）でアクセスします。サービスアカウントには対象スプレッドシートの閲覧者権限のみを付与します。

### 秘密情報の管理

| 値                                                 | ローカル                                    | 本番                      | Git 管理                           |
| -------------------------------------------------- | ------------------------------------------- | ------------------------- | ---------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY`                       | `.dev.vars`                                 | Cloudflare Secret         | 不可                               |
| `REFRESH_TOKEN`                                    | `.dev.vars` / Apps Script Script Properties | Cloudflare Secret         | 不可                               |
| `SPREADSHEET_ID`                                   | `.dev.vars`                                 | Cloudflare の平文環境変数 | 可。ただし通常は環境変数として管理 |
| D1 の `database_id` / rate-limit の `namespace_id` | `wrangler.jsonc`                            | デプロイ設定              | 可。秘密情報ではない               |

`.dev.vars`、`.env`、`.env.production` は `.gitignore` の対象です。Git に追加してしまった、またはログ・Issue・チャットへ貼り付けてしまった認証情報は、削除だけではなく失効・再発行が必要です。

### デプロイ基盤

- Cloudflare 上で HTTPS を終端し、公開 URL は HTTPS で提供します。
- `wrangler.jsonc` の `observability.enabled` により、Worker の障害調査に必要な観測機能を有効化しています。
- `pnpm verify` はフォーマット確認、型チェック、Lint を連続実行します。デプロイ前に実行します。

## 運用手順

### デプロイ後の確認

公開 URL に対して、以下のようにヘッダーを確認します。

```bash
curl -I 'https://<公開URL>/company?id=<識別子>'
```

`Content-Security-Policy`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` が返ることを確認します。更新 API の正常系は Apps Script から実行し、失敗時は HTTP ステータス（`401`、`429`、`500` など）を確認します。

### 定期的に行うこと

- 依存パッケージと Astro / Wrangler を定期的に更新し、更新後に `pnpm verify` と `pnpm build` を実行する。
- Cloudflare Secret、Apps Script の Script Properties、スプレッドシート共有設定を定期的に見直す。
- 利用者や管理者の変更時には、不要になったスプレッドシート共有権限と Cloudflare アカウント権限を削除する。
- 認証情報の漏えいが疑われる場合は、`REFRESH_TOKEN` とサービスアカウントキーを再発行して置き換える。

## 現在の対象外・追加検討事項

以下は現時点で導入していません。要件や攻撃状況に応じて追加を検討します。

- Cloudflare WAF のカスタムルール、Bot Management、Turnstile
- 更新 API を利用者・組織ごとに分離する認証（現在は単一の共有 Bearer トークン）
- CSP 違反レポートの収集（`report-to` / `report-uri`）
- 脆弱性スキャンや依存関係更新の自動化

公開ページは意図的に匿名閲覧を許可しています。ページに個人情報、管理画面へのリンク、認証情報、非公開の会社情報を掲載しないことが、この設計における重要な前提です。
