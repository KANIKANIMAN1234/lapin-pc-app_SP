'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { MapCustomer } from '@/components/features/map/MapContent';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { geocodeJapaneseAddress } from '@/lib/nominatimGeocode';

const MapContent = dynamic(() => import('@/components/features/map/MapContent'), { ssr: false });

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  inquiry:        '問い合わせ',
  estimate:       '見積もり',
  followup_status:'追客中',
  contract:       '契約',
  in_progress:    '施工中',
  completed:      '完成',
  lost:           '失注',
};

const DEFAULT_CENTER: [number, number] = [35.853, 139.412];
const MAP_SETTINGS_KEY = (userId: string) => `map_settings_${userId}`;

interface MapSettings {
  center_lat?: string;
  center_lng?: string;
  area_type?: 'company' | 'custom';
  custom_address?: string;
  area_address?: string;
  area_source?: string;
  filter_my_only?: string;
}

function loadSettings(userId: string): MapSettings {
  try {
    const raw = localStorage.getItem(MAP_SETTINGS_KEY(userId));
    return raw ? (JSON.parse(raw) as MapSettings) : {};
  } catch {
    return {};
  }
}

function saveSettings(userId: string, patch: Partial<MapSettings>) {
  try {
    const current = loadSettings(userId);
    localStorage.setItem(MAP_SETTINGS_KEY(userId), JSON.stringify({ ...current, ...patch }));
  } catch {
    // localStorage 書き込みエラーは無視
  }
}

function MapPageInner() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const focusProjectId = searchParams.get('focus') ?? '';

  // 出退勤位置ピンパラメータ
  const pinLatParam  = searchParams.get('pin_lat');
  const pinLngParam  = searchParams.get('pin_lng');
  const pinLabelParam = searchParams.get('pin_label') ?? '位置情報';
  const locationPin: [number, number] | undefined =
    pinLatParam && pinLngParam
      ? [Number(pinLatParam), Number(pinLngParam)]
      : undefined;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<MapCustomer | null>(null);

  // m_settings からステータスラベルを動的取得
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>(DEFAULT_STATUS_LABELS);
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('m_settings')
      .select('value')
      .eq('key', 'project_status_options')
      .single()
      .then(({ data }) => {
        if (!data?.value) return;
        try {
          const parsed: string[] = JSON.parse(data.value);
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const map: Record<string, string> = {};
          parsed.forEach((item) => {
            const idx = item.indexOf(':');
            if (idx === -1) { map[item] = item; } else { map[item.slice(0, idx)] = item.slice(idx + 1); }
          });
          setStatusLabels(map);
        } catch { /* デフォルト値を維持 */ }
      });
  }, []);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [focusCenter, setFocusCenter] = useState<[number, number] | null>(null);
  const [focusZoom, setFocusZoom] = useState<number | undefined>(undefined);
  const [geocodingRemaining, setGeocodingRemaining] = useState(0);

  const [areaType, setAreaType] = useState<'company' | 'custom'>('company');
  const [customAddress, setCustomAddress] = useState('');
  const [savedCenter, setSavedCenter] = useState<[number, number] | undefined>(undefined);
  const [savedAreaAddress, setSavedAreaAddress] = useState('');
  const [savedAreaSource, setSavedAreaSource] = useState('（会社住所を使用中）');
  const [filterMyOnly, setFilterMyOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [posToast, setPosToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null | undefined>(undefined);

  const showPosToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setPosToast({ msg, type });
    setTimeout(() => setPosToast(null), 3000);
  };

  // マーカー選択時にサムネイルURLを個別取得（SQL追加後に有効化）
  useEffect(() => {
    if (!selectedCustomer) {
      setThumbnailUrl(undefined);
      return;
    }
    setThumbnailUrl(undefined);
    const supabase = createClient();
    (async () => {
      try {
        const { data } = await supabase
          .from('t_projects')
          .select('map_thumbnail_url')
          .eq('id', selectedCustomer.id)
          .single();
        setThumbnailUrl((data as { map_thumbnail_url?: string | null } | null)?.map_thumbnail_url ?? null);
      } catch {
        setThumbnailUrl(null);
      }
    })();
  }, [selectedCustomer?.id]);

  const isSales = user?.roleLevel === 'sales';

  // 位置ピンが指定されていたら初期表示でその座標に zoom 16 でフォーカス
  useEffect(() => {
    if (locationPin) {
      setFocusCenter(locationPin);
      setFocusZoom(16);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinLatParam, pinLngParam]);

  // マップ設定の読み込み
  const loadMapSettings = useCallback(() => {
    if (!user?.id) return;
    const d = loadSettings(user.id);
    if (d.center_lat && d.center_lng) {
      setSavedCenter([Number(d.center_lat), Number(d.center_lng)]);
    }
    if (d.area_type) setAreaType(d.area_type);
    if (d.custom_address) setCustomAddress(d.custom_address);
    if (d.area_address) setSavedAreaAddress(d.area_address);
    if (d.area_source) setSavedAreaSource(d.area_source);
    if (d.filter_my_only === 'true') setFilterMyOnly(true);
  }, [user?.id]);

  useEffect(() => {
    loadMapSettings();
  }, [loadMapSettings]);

  // エリア設定の保存
  const handleSaveArea = async () => {
    if (!user?.id) return;
    setSaving(true);

    let lat = DEFAULT_CENTER[0];
    let lng = DEFAULT_CENTER[1];
    let areaAddress = '';
    let areaSource = '（会社住所を使用中）';

    if (areaType === 'custom' && customAddress.trim()) {
      setGeocoding(true);
      const coords = await geocodeJapaneseAddress(customAddress);
      setGeocoding(false);
      if (coords) {
        [lat, lng] = coords;
        areaAddress = customAddress;
        areaSource = '（カスタム住所を使用中）';
      } else {
        alert('住所から座標を取得できませんでした。住所を確認してください。');
        setSaving(false);
        return;
      }
    } else {
      // Supabase の m_settings から会社住所を取得
      const supabase = createClient();
      const { data } = await supabase
        .from('m_settings')
        .select('value')
        .eq('key', 'company_address')
        .maybeSingle();

      const addr = data?.value ?? '';
      if (addr) {
        setGeocoding(true);
        const coords = await geocodeJapaneseAddress(addr);
        setGeocoding(false);
        if (coords) [lat, lng] = coords;
        areaAddress = addr;
        areaSource = '（会社住所を使用中）';
      }
    }

    const patch: MapSettings = {
      center_lat: String(lat),
      center_lng: String(lng),
      area_type: areaType,
      custom_address: customAddress,
      area_address: areaAddress,
      area_source: areaSource,
    };
    saveSettings(user.id, patch);

    setSavedCenter([lat, lng]);
    setSavedAreaAddress(areaAddress);
    setSavedAreaSource(areaSource);
    setShowAreaModal(false);
    setSaving(false);
  };

  const handleToggleMyOnly = (checked: boolean) => {
    setFilterMyOnly(checked);
    if (user?.id) saveSettings(user.id, { filter_my_only: String(checked) });
  };

  return (
    <div>
      {/* 位置保存トースト */}
      {posToast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center gap-2
          ${posToast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          <span className="material-icons text-base">
            {posToast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {posToast.msg}
        </div>
      )}

      {/* タイトル行 */}
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">OB顧客マップ</h2>
          {geocodingRemaining > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              住所から位置を取得中… 残り{geocodingRemaining}件
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            placeholder="顧客名・住所で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input w-56"
          />
          {isSales && (
            <label className="toggle-label text-xs whitespace-nowrap">
              <input
                type="checkbox"
                checked={filterMyOnly}
                onChange={(e) => handleToggleMyOnly(e.target.checked)}
              />
              自分の担当のみ
            </label>
          )}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              editMode
                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
            }`}
          >
            <span className="material-icons" style={{ fontSize: 15 }}>
              {editMode ? 'edit_off' : 'edit_location_alt'}
            </span>
            {editMode ? '修正モードON' : '位置を修正'}
          </button>
          <button
            type="button"
            className="btn-area-setting"
            onClick={() => setShowAreaModal(true)}
          >
            <span className="material-icons" style={{ fontSize: 16 }}>settings</span>
            エリア設定
          </button>
        </div>
      </div>

      {/* 位置修正モード時のガイドバナー */}
      {editMode && (
        <div className="flex items-center gap-2 px-4 py-2 mb-2 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
          <span className="material-icons text-base text-blue-500">info</span>
          マーカーをドラッグして正しい位置に移動してください。離した時点で自動保存されます。
          <button
            className="ml-auto text-xs underline text-blue-500 hover:text-blue-700"
            onClick={() => setEditMode(false)}
          >
            終了
          </button>
        </div>
      )}

      {/* 凡例バー（マップ上部・横並び） */}
      <div className="flex items-center gap-4 px-4 py-2 mb-3 bg-white rounded-xl shadow-sm text-xs text-gray-700 flex-wrap">
        <span className="font-semibold text-gray-500">マーカー色の凡例:</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-600" />完工</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-blue-600" />施工中</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" />見積中</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-purple-600" />契約済</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-orange-500" />追客中</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-yellow-400" />問い合わせ</span>
      </div>

      <div className="map-container">
        <div className="map-view">
          <MapContent
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            center={focusCenter ?? savedCenter}
            centerZoom={focusZoom}
            locationPin={locationPin}
            locationPinLabel={pinLabelParam}
            filterMyOnly={filterMyOnly}
            currentUserId={user?.id ? String(user.id) : undefined}
            focusProjectId={focusProjectId}
            onFocusResolved={(customer, coords) => {
              setSelectedCustomer(customer);
              setFocusCenter(coords);
              setFocusZoom(16);
            }}
            onGeocodingProgress={setGeocodingRemaining}
            editMode={editMode}
            onPositionSaved={(name) => showPosToast(`「${name}」の位置を保存しました`)}
            onPositionError={(name) => showPosToast(`「${name}」の保存に失敗しました`, 'error')}
          />
        </div>

        {/* 右パネル */}
        <div className="customer-info-panel">
          <div className="map-area-info">
            <div className="map-area-badge">
              <span className="material-icons">my_location</span> 初期表示エリア
            </div>
            <p className="map-area-address">{savedAreaAddress || '埼玉県狭山市南入曽580-1'}</p>
            <p className="map-area-source">{savedAreaSource}</p>
          </div>
          <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

          {/* 顧客情報（マーカー選択時のみ表示） */}
          {selectedCustomer ? (
            <>
              {/* 代表写真 */}
              <div className="w-full rounded-xl overflow-hidden border border-gray-200 mb-3 bg-gray-50"
                style={{ aspectRatio: '4/3', position: 'relative' }}>
                {thumbnailUrl === undefined ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin" />
                  </div>
                ) : thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={selectedCustomer.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
                    <span className="material-icons" style={{ fontSize: 36 }}>photo_camera</span>
                    <span className="text-xs">写真が設定されていません</span>
                    <span className="text-[10px]">案件詳細の写真タブから設定できます</span>
                  </div>
                )}
              </div>

              <h3 className="text-lg font-semibold mb-1">{selectedCustomer.name}</h3>
              <p className="text-sm text-gray-600 mb-2">{selectedCustomer.address ?? '住所未登録'}</p>
              <span
                className={`badge badge-${
                  selectedCustomer.status === 'completed' ? 'green' :
                  selectedCustomer.status === 'in_progress' ? 'blue' :
                  selectedCustomer.status === 'contract' ? 'purple' : 'yellow'
                }`}
              >
                {statusLabels[selectedCustomer.status] ?? selectedCustomer.status}
              </span>
              <div className="mt-4">
                <p className="text-sm text-gray-600">{selectedCustomer.lastWork}</p>
              </div>
              <Link
                href={`/projects/${selectedCustomer.id}`}
                className="btn-primary mt-4 w-full justify-center"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="material-icons text-base">open_in_new</span>
                案件詳細を見る
              </Link>
              <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
            </>
          ) : (
            <p className="text-gray-500 text-sm mt-2 mb-4">マップ上のマーカーをクリックして顧客情報を表示</p>
          )}

        </div>
      </div>

      {/* エリア設定モーダル */}
      {showAreaModal && (
        <div className="modal-overlay" onClick={() => setShowAreaModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span className="material-icons text-green-600">map</span>
                地図 初期表示エリア設定
              </h3>
              <button className="p-1 hover:bg-gray-100 rounded" onClick={() => setShowAreaModal(false)}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="map-area-option-group">
                <label className={`map-area-option ${areaType === 'company' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="map-area-type"
                    value="company"
                    checked={areaType === 'company'}
                    onChange={() => setAreaType('company')}
                  />
                  <div className="map-area-option-body">
                    <div className="map-area-option-header">
                      <span className="material-icons text-green-600">domain</span>
                      <strong>会社住所（デフォルト）</strong>
                    </div>
                    <p className="map-area-option-desc">設定画面の企業情報に登録された住所を使用します</p>
                  </div>
                </label>
                <label className={`map-area-option ${areaType === 'custom' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="map-area-type"
                    value="custom"
                    checked={areaType === 'custom'}
                    onChange={() => setAreaType('custom')}
                  />
                  <div className="map-area-option-body">
                    <div className="map-area-option-header">
                      <span className="material-icons text-green-600">edit_location_alt</span>
                      <strong>カスタム住所を指定</strong>
                    </div>
                    <p className="map-area-option-desc">任意のエリアを初期表示に設定できます</p>
                  </div>
                </label>
              </div>
              {areaType === 'custom' && (
                <div className="map-area-custom-input">
                  <label className="block text-sm font-semibold mb-1">表示エリアの住所</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="例: 埼玉県狭山市..."
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAreaModal(false)}>
                キャンセル
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveArea}
                disabled={saving || geocoding}
              >
                <span className="material-icons text-base">save</span>
                {saving || geocoding ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      }
    >
      <MapPageInner />
    </Suspense>
  );
}
