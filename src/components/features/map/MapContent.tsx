'use client';

import { useCallback, useEffect, useState } from 'react';
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
  completed: '#059669',
  in_progress: '#2563eb',
  estimate: '#d97706',
  contract: '#7c3aed',
  inquiry: '#6b7280',
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

interface MapContentProps {
  selectedCustomer: MapCustomer | null;
  onSelectCustomer: (customer: MapCustomer | null) => void;
  center?: [number, number];
  filterMyOnly?: boolean;
  currentUserId?: string;
  focusProjectId?: string;
  onFocusResolved?: (customer: MapCustomer, coords: [number, number]) => void;
}

function MapContent({
  selectedCustomer,
  onSelectCustomer,
  center,
  filterMyOnly,
  currentUserId,
  focusProjectId,
  onFocusResolved,
}: MapContentProps) {
  const [customers, setCustomers] = useState<MapCustomer[]>([]);
  const [focusHandled, setFocusHandled] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('t_projects')
      .select('id, customer_name, lat, lng, status, work_type, inquiry_date, address, assigned_to')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .is('deleted_at', null)
      .limit(500)
      .then(async ({ data: projects, error }) => {
        if (error) {
          console.error('t_projects fetch error:', error);
          return;
        }
        if (!projects) return;

        const mapped: MapCustomer[] = projects.map((p) => ({
          id: String(p.id),
          name: p.customer_name,
          lat: Number(p.lat),
          lng: Number(p.lng),
          status: p.status,
          lastWork: `${String(p.inquiry_date ?? '').substring(0, 7)} ${Array.isArray(p.work_type) ? p.work_type.join(',') : (p.work_type ?? '')}`,
          address: p.address,
          assignedTo: p.assigned_to ? String(p.assigned_to) : undefined,
        }));
        setCustomers(mapped);

        // フォーカス対象の処理
        if (focusProjectId && !focusHandled && onFocusResolved) {
          let target = mapped.find((c) => c.id === focusProjectId);

          if (target) {
            onFocusResolved(target, [target.lat, target.lng]);
            setFocusHandled(true);
          } else {
            // lat/lng 未登録案件を住所でジオコード
            const { data: proj } = await supabase
              .from('t_projects')
              .select('id, customer_name, address, status, work_type')
              .eq('id', focusProjectId)
              .single();

            if (proj?.address) {
              try {
                const resp = await fetch(
                  `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(proj.address)}&limit=1`
                );
                const results = await resp.json();
                if (results.length > 0) {
                  const lat = Number(results[0].lat);
                  const lng = Number(results[0].lon);
                  target = {
                    id: String(proj.id),
                    name: proj.customer_name,
                    lat,
                    lng,
                    status: proj.status,
                    lastWork: Array.isArray(proj.work_type) ? proj.work_type.join(',') : (proj.work_type ?? ''),
                    address: proj.address,
                  };
                  setCustomers((prev) => [...prev, target!]);
                  onFocusResolved(target, [lat, lng]);
                }
              } catch {
                // geocode 失敗は無視
              }
            }
            setFocusHandled(true);
          }
        }
      });
  }, [focusProjectId, focusHandled, onFocusResolved]);

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
      zoom={12}
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
            <div className="text-sm">
              <div className="font-bold">{customer.name}</div>
              <div className="text-gray-600 mt-1">{customer.lastWork}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default MapContent;
