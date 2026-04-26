'use client';

export default function followupPage() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <span className="material-icons text-green-600">follow_the_signs</span>
        追客管理
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <span className="material-icons text-gray-200" style={{ fontSize: 64 }}>follow_the_signs</span>
        <p className="text-gray-500 mt-4 font-medium">追客管理</p>
        <p className="text-sm text-gray-400 mt-2">フォローアップ案件の管理機能です。Supabase の projects テーブル（followup_flag = true）を元に一覧表示します。</p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
          <span className="material-icons" style={{ fontSize: 16 }}>construction</span>
          実装中（v3.0 開発フェーズで追加予定）
        </div>
      </div>
    </div>
  );
}