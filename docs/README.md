# Markdown Viewer の概要

このプロジェクトは、ローカルフォルダ内の Markdown 文書をブラウザで閲覧するためのシングルページ Viewer です。

`docs-preview.cmd` を起動すると、PowerShell のローカルサーバーが `viewer.html` を開きます。ドキュメント一覧から Markdown フォルダの絶対Pathを登録すると、選択したフォルダ内の `.md` ファイルを再帰的に読み込み、左側のツリーからページを移動できます。

## ガイド

- [Viewer 利用者ガイド](01_viewer-user-guide.md)
    - ドキュメントを開く、検索する、複数タブで使うなど、閲覧者向けの操作説明
- [ドキュメント作成者ガイド](02_document-author-guide.md)
    - この Viewer で表示する Markdown 文書の構成、リンク、画像、Mermaid の書き方について

## 対応ブラウザ

通常運用は PowerShell ローカルサーバー方式です。`viewer.html` を直接開いた場合は、File System Access API を使う旧来のフォールバック動作になります。
