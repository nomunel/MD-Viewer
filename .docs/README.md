# Markdown Viewer の概要

このプロジェクトは、ローカルフォルダ内の Markdown 文書をブラウザで閲覧するためのシングルページ Viewer です。

`MD-Viewer.html` を Chrome または Edge で開き、File System Access API を使って任意の Markdown フォルダを選択します。選択したフォルダ内の `.md` ファイルを再帰的に読み込み、左側のツリーからページを移動できます。

## ガイド

- [Viewer 利用者ガイド](01_viewer-user-guide.md)
    - Project を開く、検索する、複数タブで使うなど、閲覧者向けの操作説明
- [ドキュメント作成者ガイド](02_document-author-guide.md)
    - この Viewer で表示する Markdown 文書の構成、リンク、画像、Mermaid の書き方について

## 対応ブラウザ

フォルダ選択と履歴再利用には File System Access API が必要です。主な対象は Chrome または Edge です。

API 非対応ブラウザでは、フォルダ選択を使った通常運用はできません。
