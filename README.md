# What

Astro + Cloudflare Pages + D1 で構築したスプレッドシートCMS型の静的ページサンプルです。  
パラメータで表示内容を変更するFAQページを一例として作成しました。スプレッドシートのサンプルは[こちら](https://docs.google.com/spreadsheets/d/1bkEdpvMTaSRuqb7IoHSyzdb9R8WeDeMYdM4mRj-SV3M/edit?gid=0#gid=0)。

# Why

以前に同じようなスプレッドシートCMS型の仕組みをPHPで実装し、社内で展開していたことがあります。PHPの実装サンプルは[こちら](https://github.com/tmykknk/proxy-html)。  
今回、新たなアプローチで作ってみたいと思いチャレンジしました。  

# How

Claude(Freeプラン)で壁打ちして技術選定、アーキテクチャを固め、スキルまで考えてもらいました。  
その後はCodexで実装してもらい、勉強しながら構築しました。IDEはZedです。  

- [環境構築手順](./docs/setup.md)
- [セキュリティ](./docs/security.md)
- [アーキテクチャ](./docs/architecture.md)

## よくあるトラブル

| 症状 | 確認ポイント |
|---|---|
| ページにアクセスすると500エラーになる | D1バインディングの `binding` 名がコード側（`DB`）と一致しているか確認 |
| 更新ボタンを押してもエラーが返る | `REFRESH_TOKEN` がApps ScriptとCloudflareの両方で同じ値になっているか確認 |
| サービスアカウントでシートが取得できない | 共有ドライブへの招待メールアドレスが、サービスアカウントのものと一致しているか確認 |
| `個別QA_xxx` タブの内容が反映されない | タブ名の `xxx` 部分と「設定」タブの識別子が完全一致（半角英数字）しているか確認 |
| ローカルでは動くが本番で動かない | `.dev.vars` はローカル専用。本番用の環境変数をダッシュボード側に別途登録しているか確認 |
