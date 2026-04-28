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
  completed:      '#059669',
  in_progress:    '#2563eb',
  estimate:       '#d97706',
  contract:       '#7c3aed',
  followup_status:'#f97316',
  inquiry:        '#6b7280',
  lost:           '#9ca3af',
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
}

function createCustomIcon(status: string) {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:24px;height:24px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
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
  filterMyOnly?: boolean;
  currentUserId?: string;
  focusProjectId?: string;
  onFocusResolved?: (customer: MapCustomer, coords: [number, number]) => void;
  geocodingCount?: number;
  onGeocodingProgress?: (remaining: number) => void;
}

function MapContent({
  selectedCustomer,
  onSelectCustomer,
  center,
  filterMyOnly,
  currentUserId,
  focusProjectId,
  onFocusResolved,
  onGeocodingProgress,
}: MapContentProps) {
  const [customers, setCustomers] = useState<MapCustomer[]>([]);
  const [focusHandled, setFocusHandled] = useState(false);
  const geocodingRef = useRef(false);

  useEffect(() => {
    if (geocodingRef.current) return;
    geocodingRef.current = true;

    const supabase = createClient();

    supabase
      .from('t_projects')
      .select('id, customer_name, lat, lng, status, work_type, inquiry_date, address, assigned_to')
      .is('deleted_at', null)
      .not('address', 'is', null)
      .limit(500)
      .then(async ({ data: projects, error }) => {
        if (error) { console.error('t_projects fetch error:', error); return; }
        if (!projects) return;

        // 座標あり → 即表示
        const withCoords: MapCustomer[] = [];
        const toGeocode: typeof projects = [];

        for (const p of projects) {
          if (p.lat != null && p.lng != null) {
            withCoords.push(toMapCustomer(p));
          } else if (p.address && String(p.address).length > 3) {
            toGeocode.push(p);
          }
        }
        setCustomers(withCoords);

        // 座標なし → 住所からジオコード（1件/秒 のレート制限）
        if (toGeocode.length > 0) {
          onGeocodingProgress?.(toGeocode.length);
          let remaining = toGeocode.length;

          for (const p of toGeocode) {
            await new Promise((r) => setTimeout(r, 1100));
            const coords = await geocodeAddress(p.address as string);
            remaining -= 1;
            onGeocodingProgress?.(remaining);

            if (coords) {
              const [lat, lng] = coords;
              // Supabase に保存（以降リロード時は即表示される）
              await supabase.from('t_projects').update({ lat, lng }).eq('id', p.id);
              const customer = toMapCustomer({ ...p, lat, lng });
              setCustomers((prev) => [...prev, customer]);
            }
          }
        }

        // フォーカス対象の処理
        if (focusProjectId && !focusHandled && onFocusResolved) {
          setFocusHandled(true);
          const allCustomers = [...withCoords];
          const target = allCustomers.find((c) => c.id === focusProjectId);
          if (target) onFocusResolved(target, [target.lat, target.lng]);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkerClick = useCallback(
    (customer: MapCustomer) => {
      onSelectCustomer(selectedCustomer?.id === customer.id ? null : customer);
    },
    [selectedCustomer?.id, onSelectCustomer]
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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {center && <MapCenterUpdater center={center} />}
      {displayCustomers.map((customer) => (
        <Marker
          key={customer.id}
          position={[customer.lat, customer.lng]}
          icon={createCustomIcon(customer.status)}
          eventHandlers={{ click: () => handleMarkerClick(customer) }}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>{customer.name}</p>
              {customer.address && (
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{customer.address}</p>
              )}
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{customer.lastWork}</p>
              <a
                href={`/projects/${customer.id}`}
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
