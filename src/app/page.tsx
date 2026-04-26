'use client';

import { getLineLoginUrl } from '@/lib/auth';

export default function LoginPage() {
  const handleLineLogin = () => {
    window.location.href = getLineLoginUrl();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #06C755 0%, #04a045 50%, #1d4ed8 100%)',
      }}
    >
      <div className="bg-white rounded-2xl p-8 shadow-2xl text-center max-w-md w-[90%]">
        <div className="mb-4">
          <span className="material-icons" style={{ fontSize: 64, color: '#06C755' }}>
            business
          </span>
        </div>
        <h1 className="text-2xl font-bold mb-2">ラパンリフォーム 業務管理システム</h1>
        <p className="text-gray-500 text-sm mb-2">LINE公式アカウント連携 業務管理</p>
        <p className="text-[10px] text-gray-400 mb-8 bg-blue-50 rounded-lg px-3 py-1.5">
          v3.0 Supabase版
        </p>

        <button onClick={handleLineLogin} className="btn-line w-full">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 5.64 2 10.14c0 4.04 3.58 7.42 8.41 8.06.33.07.77.22.88.5.1.26.07.66.03.92l-.14.87c-.04.26-.2 1.02.89.56.91-.38 4.89-2.88 6.67-4.93C20.53 14.13 22 12.26 22 10.14 22 5.64 17.52 2 12 2z" />
          </svg>
          LINEでログイン
        </button>

        <p className="text-[10px] text-gray-400 mt-6">
          LINEアカウントで認証後、自動的にログインします
        </p>
      </div>
    </div>
  );
}
