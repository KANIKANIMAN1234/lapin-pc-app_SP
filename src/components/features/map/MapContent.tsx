'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@/lib/supabase';

// Leaflet デフォルトアイコンのパス修正
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const STATUS_COLORS: Record<string, string> = {
  completed:       '#059669',
  in_progress:     '#2563eb',
  estimate:        '#d97706',
  contract:        '#7c3aed',
  followup_status: '#f97316',
  inquiry:         '#eab308',
  lost:            '#9ca3af',
};

const STATUS_CHARS: Record<string, string> = {
  completed:       '完',
  in_progress:     '施',
  estimate:        '見',
  contract:        '受',
  followup_status: '追',
  inquiry:         '問',
  lost:            '失',
};

export interface MapCustomer {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  lastWork: string;
  address?: string;
  assignedTo?: string;
  thumbnailUrl?: string;
}

function createCustomIcon(status: string, name: string, editMode = false, saving = false) {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  const char = STATUS_CHARS[status] ?? '?';
  const displayName = name.length > 8 ? name.slice(0, 8) + '…' : name;

  const border = editMode
    ? saving ? '2px dashed #ef4444' : '2px dashed #2563eb'
    : '1.5px solid #e5e7eb';

  const html = `
    <div style="
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: white;
      border: ${border};
      border-radius: 20px;
      padding: 4px 8px 4px 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      white-space: nowrap;
      cursor: ${editMode ? 'grab' : 'pointer'};
    ">
      <div style="
        width: 26px; height: 26px;
        border-radius: 50%;
        background: ${saving ? '#9ca3af' : color};
        color: white;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      ">${saving ? '…' : char}</div>
      <span style="font-size: 12px; font-weight: 600; color: #1f2937;">${displayName}</span>
      ${editMode
        ? `<span style="font-size: 13px; color: #2563eb; line-height: 1;" title="ドラッグして移動">&#8597;</span>`
        : `<span style="font-size: 13px; color: #9ca3af; line-height: 1;">&#128100;</span>`
      }
    </div>
    <div style="
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      width: 0; height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid white;
      filter: drop-shadow(0 2px 1px rgba(0,0,0,0.1));
    "></div>
  `;

  return L.divIcon({
    className: '',
    html,
    iconSize: undefined,
    iconAnchor: [60, 44],
  });
}

function MapCenterUpdater({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (zoom != null) {
      map.flyTo(center, zoom, { animate: true, duration: 0.8 });
    } else {
      map.setView(center, map.getZoom());
    }
  }, [center, zoom, map]);
  return null;
}

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { 'User-Agent': 'lapin-reform-app/1.0' } }
    );
    const results = await resp.json();
    if (results.length > 0) return [Number(results[0].lat), Number(results[0].lon)];
    return null;
  } catch {
    return null;
  }
}

interface MapContentProps {
  selectedCustomer: MapCustomer | null;
  onSelectCustomer: (customer: MapCustomer | null) => void;
  center?: [number, number];
  centerZoom?: number;
  filterMyOnly?: boolean;
  currentUserId?: string;
  focusProjectId?: string;
  onFocusResolved?: (customer: MapCustomer, coords: [number, number]) => void;
  geocodingCount?: number;
  onGeocodingProgress?: (remaining: number) => void;
  editMode?: boolean;
  onPositionSaved?: (name: string) => void;
  onPositionError?: (name: string) => void;
}

function MapContent({
  selectedCustomer,
  onSelectCustomer,
  center,
  centerZoom,
  filterMyOnly,
  currentUserId,
  focusProjectId,
  onFocusResolved,
  onGeocodingProgress,
  editMode = false,
  onPositionSaved,
  onPositionError,
}: MapContentProps) {
  const [customers, setCustomers] = useState<MapCustomer[]>([]);
  const [focusHandled, setFocusHandled] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const geocodingRef = useRef(false);

  useEffect(() => {
    if (geocodingRef.current) return;
    geocodingRef.current = true;

    const supabase = createClient();
    const SELECT = 'id, customer_name, lat, lng, status, work_type, inquiry_date, address, assigned_to';

    (async () => {
      // ① 座標あり → 即表示
      const { data: withCoords, error: e1 } = await supabase
        .from('t_projects')
        .select(SELECT)
        .is('deleted_at', null)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(500);

      if (e1) console.error('[Map] fetch withCoords error:', e1);
      const mapped = (withCoords ?? []).map(toMapCustomer);
      setCustomers(mapped);

      if (focusProjectId && !focusHandled && onFocusResolved) {
        const target = mapped.find((c) => c.id === focusProjectId);
        if (target) {
          onFocusResolved(target, [target.lat, target.lng]);
          setFocusHandled(true);
        }
      }

      // ② 座標なし・住所あり → ジオコード
      const { data: needGeocode, error: e2 } = await supabase
        .from('t_projects')
        .select(SELECT)
        .is('deleted_at', null)
        .is('lat', null)
        .not('address', 'is', null)
        .limit(200);

      if (e2) console.error('[Map] fetch needGeocode error:', e2);
      const toGeocode = (needGeocode ?? []).filter(
        (p) => p.address && String(p.address).trim().length > 3
      );

      if (toGeocode.length === 0) return;

      onGeocodingProgress?.(toGeocode.length);
      let remaining = toGeocode.length;

      for (const p of toGeocode) {
        await new Promise((r) => setTimeout(r, 1100));
        const coords = await geocodeAddress(p.address as string);
        remaining -= 1;
        onGeocodingProgress?.(remaining);

        if (coords) {
          const [lat, lng] = coords;
          const saveRes = await fetch('/api/save-geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id, lat, lng }),
          });
          if (!saveRes.ok) {
            const err = await saveRes.json().catch(() => ({}));
            console.error('[Map] lat/lng save error:', err);
          } else {
            setCustomers((prev) => [...prev, toMapCustomer({ ...p, lat, lng })]);
          }
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkerClick = useCallback(
    (customer: MapCustomer) => {
      if (editMode) return; // 位置修正モード中はクリック選択を無効化
      onSelectCustomer(selectedCustomer?.id === customer.id ? null : customer);
    },
    [selectedCustomer?.id, onSelectCustomer, editMode]
  );

  const handleDragEnd = useCallback(
    async (customer: MapCustomer, e: L.LeafletEvent) => {
      const { lat, lng } = (e.target as L.Marker).getLatLng();
      setSavingId(customer.id);
      try {
        const saveRes = await fetch('/api/save-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: customer.id, lat, lng }),
        });
        if (!saveRes.ok) throw new Error('save failed');
        setCustomers((prev) =>
          prev.map((c) => (c.id === customer.id ? { ...c, lat, lng } : c))
        );
        onPositionSaved?.(customer.name);
      } catch {
        onPositionError?.(customer.name);
      } finally {
        setSavingId(null);
      }
    },
    [onPositionSaved, onPositionError]
  );

  const defaultCenter: [number, number] =
    customers.length > 0 ? [customers[0].lat, customers[0].lng] : [35.853, 139.412];

  const mapCenter = center ?? defaultCenter;

  const displayCustomers =
    filterMyOnly && currentUserId
      ? customers.filter((c) => c.assignedTo === currentUserId)
      : customers;

  return (
    <MapContainer
      center={mapCenter}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
        url="https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        subdomains={['0', '1', '2', '3']}
        maxZoom={22}
      />
      {center && <MapCenterUpdater center={center} zoom={centerZoom} />}
      {displayCustomers.map((customer) => (
        <Marker
          key={customer.id}
          position={[customer.lat, customer.lng]}
          icon={createCustomIcon(
            customer.status,
            customer.name,
            editMode,
            savingId === customer.id
          )}
          draggable={editMode}
          eventHandlers={{
            click: () => handleMarkerClick(customer),
            dragend: editMode ? (e) => handleDragEnd(customer, e) : undefined,
          }}
        >
          {!editMode && (
            <Popup>
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>{customer.name}</p>
                {customer.address && (
                  <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{customer.address}</p>
                )}
                <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{customer.lastWork}</p>
                <a
                  href={`/projects/${customer.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '4px 12px',
                    background: '#06C755',
                    color: 'white',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  詳細を見る →
                </a>
              </div>
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}

function toMapCustomer(p: {
  id: string | number;
  customer_name: string;
  lat: number | null;
  lng: number | null;
  status: string;
  work_type: string[] | string | null;
  inquiry_date: string | null;
  address: string | null;
  assigned_to: string | number | null;
}): MapCustomer {
  return {
    id: String(p.id),
    name: p.customer_name,
    lat: Number(p.lat),
    lng: Number(p.lng),
    status: p.status,
    lastWork: `${String(p.inquiry_date ?? '').substring(0, 7)} ${
      Array.isArray(p.work_type) ? p.work_type.join(',') : (p.work_type ?? '')
    }`,
    address: p.address ?? undefined,
    assignedTo: p.assigned_to ? String(p.assigned_to) : undefined,
  };
}

export default MapContent;
