'use client';

export default function inspectionPage() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <span className="material-icons text-green-600">event_note</span>
        点検スケジュール
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <span className="material-icons text-gray-200" style={{ fontSize: 64 }}>event_note</span>
        <p className="text-gray-500 mt-4 font-medium">点検スケジュール</p>
        <p className="text-sm text-gray-400 mt-2">1年・3年点検のスケジュール管理機能です。完工日を元に自動生成します。</p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
          <span className="material-icons" style={{ fontSize: 16 }}>construction</span>
          実装中（v3.0 開発フェーズで追加予定）
        </div>
      </div>
    </div>
  );
}