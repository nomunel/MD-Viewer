# Markdown Viewer の概要

Markdown Viewer は、ローカルフォルダ内の Markdown 文書を読むためのデスクトップ Viewer です。

通常運用は Tauri アプリ版です。OS 標準のフォルダ選択 UI でドキュメントルートを登録し、配下の `.md` ファイルをツリー表示します。ブラウザの File System Access API に依存しないため、ブラウザ再起動後の権限切れやローカルサーバー起動忘れを避けられます。

`viewer.html` を直接開くブラウザ版は、開発・確認用のフォールバックとして残しています。

## ガイド

- [Viewer 利用者ガイド](01_viewer-user-guide.md)
  - アプリの起動、ドキュメント登録、ページ移動、検索、関連付けアプリで開く操作。
- [ドキュメント作成者ガイド](02_document-author-guide.md)
  - この Viewer で読みやすい Markdown 文書の構成、リンク、画像、Mermaid の書き方。

## 開発ドキュメント

- [開発環境セットアップ](development/setup.md)
- [要件](development/requirements.md)
- [仕様](development/specification.md)
- [ToDo](development/todo.md)
