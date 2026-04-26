# ラパンリフォーム 業務管理システム PC版 (v3.0 Supabase版)

Next.js 15 + Supabase + TanStack Query によるフロントエンド実装

## 技術スタック

| 分類 | 技術 |
|------|------|
| フレームワーク | Next.js 15 (App Router) |
| DB / Auth | Supabase (PostgreSQL + RLS) |
| データフェッチ | TanStack Query (React Query v5) |
| 状態管理 | Zustand v5（UI状態のみ） |
| スタイル | Tailwind CSS v3 |
| 地図 | Leaflet + react-leaflet |
| チャート | Chart.js + react-chartjs-2 |
| セッション管理 | @supabase/ssr (Cookie ベース) |

## セットアップ

```bash
# 1. パッケージインストール
npm install

# 2. 環境変数を設定
cp .env.local.example .env.local
# .env.local を編集して各値を設定

# 3. 開発サーバー起動
npm run dev
```

## 環境変数

`.env.local.example` を参照してください。

| 変数名 | 説明 |
|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon キー |
| `NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID` | LINE Login チャネル ID |
| `NEXT_PUBLIC_LINE_LOGIN_CALLBACK_URL` | LINE コールバック URL |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API キー（Geocoding用） |

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx                      # ログインページ
│   ├── layout.tsx                    # ルートレイアウト（QueryProvider）
│   ├── callback/page.tsx             # LINE OAuth コールバック
│   └── (authenticated)/
│       ├── layout.tsx                # 認証ガード + Header/Sidebar
│       ├── dashboard/page.tsx        # ダッシュボード（KPI・チャート）
│       ├── projects/                 # 案件管理
│       │   ├── page.tsx              # 案件一覧
│       │   ├── new/page.tsx          # 新規案件登録
│       │   └── [id]/page.tsx         # 案件詳細（写真・商談記録）
│       ├── expense/page.tsx          # 経費登録
│       ├── followup/page.tsx         # 追客管理（実装中）
│       ├── inspection/page.tsx       # 点検スケジュール（実装中）
│       ├── map/page.tsx              # 顧客マップ（実装中）
│       ├── thankyou/page.tsx         # お礼状・DM（実装中）
│       ├── bonus/page.tsx            # ボーナス計算（実装中）
│       ├── settings/page.tsx         # 設定（実装中）
│       └── admin/page.tsx            # 管理（実装中）
├── components/
│   ├── layout/
│   │   ├── Header.tsx                # ヘッダー（通知・ログアウト）
│   │   └── Sidebar.tsx               # サイドバーナビゲーション
│   └── providers/
│       └── QueryProvider.tsx         # TanStack Query プロバイダー
├── hooks/
│   ├── useProjects.ts                # 案件 CRUD フック
│   ├── usePhotos.ts                  # 写真アップロード・表示フック
│   └── useDashboard.ts              # ダッシュボード集計フック
├── lib/
│   ├── supabase.ts                   # Supabase クライアント生成
│   └── auth.ts                       # LINE ログイン URL・コード交換
├── stores/
│   └── authStore.ts                  # Zustand（UIユーザー情報・通知）
└── types/
    ├── index.ts                       # ドメイン型定義
    └── supabase.ts                    # Supabase Database 型（手動定義）
```

## 認証フロー

```
ユーザー → LINEでログイン
  → LINE OAuth 認可
  → /callback へリダイレクト
  → Edge Function `auth-line` で LINE code → Supabase JWT 交換
  → supabase.auth.setSession() でセッション設定（Cookie）
  → ミドルウェアがセッションを自動更新
  → /dashboard へリダイレクト
```

## 写真表示の仕組み

```
【アップロード時】
  Edge Function `photos` を呼び出し
  → Google Drive API でアップロード
  → Drive 共有権限を「リンクを知っている全員が閲覧可」に設定
  → Supabase photos テーブルに file_id / drive_url / thumbnail_url を保存

【表示時】
  Supabase から thumbnail_url を取得
  → <img src={thumbnail_url}> でサムネイル表示
  → クリックで drive_url のフルサイズをライトボックス表示
```

## Supabase 型の自動生成

DB スキーマ変更時は以下のコマンドで型を再生成してください：

```bash
npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts
```

## Vercel デプロイ

1. Vercel にリポジトリを接続
2. 環境変数を Vercel ダッシュボードで設定
3. Framework Preset: **Next.js** を選択
4. `npm run build` が通ることを確認してデプロイ
