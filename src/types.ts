export interface Location {
  id: string;
  name: string;
  brand: string;
  city: string;
  status: string;
  created_at: string;
}

export interface Device {
  id: string;
  location_id: string;
  label: string;
  target_url: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ScanEvent {
  id: number;
  device_id: string;
  location_id: string;
  os: string;
  user_agent: string | null;
  ip: string | null;
  scanned_at: string;
}

/** Valor cacheado en Redis para resolver una redirección. */
export interface DeviceCache {
  device_id: string;
  location_id: string;
  target_url: string;
  status: string;
}
