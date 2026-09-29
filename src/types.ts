export interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  role: 'superadmin' | 'company_admin';
  company_id: string | null;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  brand: string;
  city: string;
  status: string;
  company_id: string | null;
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
