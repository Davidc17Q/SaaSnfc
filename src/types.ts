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
  /** Modo del punto: redirección (actual) o encuesta. Excluyentes. */
  mode?: 'redirect' | 'survey';
  /** Plantilla de encuesta asociada cuando mode = 'survey'. */
  survey_template_id?: string | null;
}

/** Plantilla de encuesta (Función 1: calificación interna por aspectos). */
export interface SurveyTemplate {
  id: string;
  company_id: string | null;
  name: string;
  scale_max: number;
  status: string;
  created_at: string;
}

/** Aspecto a calificar dentro de una plantilla de encuesta. */
export interface SurveyAspect {
  id: string;
  template_id: string;
  label: string;
  position: number;
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
  code?: string;
  /** Nombre de la empresa dueña del punto (para la pantalla de transición). */
  company_name?: string;
  /** Canal fijado a mano (NULL = se detecta por target_url). */
  channel?: string | null;
  /** Si true, muestra la pantalla de transición antes de redirigir. */
  transition?: boolean;
  /** Modo del punto: redirección (actual) o encuesta. Excluyentes. */
  mode?: 'redirect' | 'survey';
  /** Plantilla de encuesta asociada cuando mode = 'survey'. */
  survey_template_id?: string | null;
}
