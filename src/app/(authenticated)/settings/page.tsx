'use client';

export default function settingsPage() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <span className="material-icons text-green-600">person</span>
        設定
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <span className="material-icons text-gray-200" style={{ fontSize: 64 }}>person</span>
        <p className="text-gray-500 mt-4 font-medium">設定</p>
        <p className="text-sm text-gray-400 mt-2">プロフィール・アバター・通知設定を変更できます。</p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
          <span className="material-icons" style={{ fontSize: 16 }}>construction</span>
          実装中（v3.0 開発フェーズで追加予定）
        </div>
      </div>
    </div>
  );
}