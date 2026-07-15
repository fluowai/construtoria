/**
 * Shared Type Definitions for the Chrome Extension licensing system.
 */

export type LicenseType = 'trial' | 'monthly' | 'lifetime';
export type LicenseStatus = 'active' | 'suspended' | 'expired';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  is_admin: boolean;
  is_blocked: boolean;
}

export interface License {
  id: string;
  user_id: string;
  key: string;
  type: LicenseType;
  status: LicenseStatus;
  max_devices: number;
  expires_at: string | null;
  created_at: string;
  user_email?: string; // virtual field for admin displays
}

export interface Device {
  id: string;
  license_id: string;
  fingerprint: string;
  device_name: string;
  last_heartbeat: string;
  is_online: boolean;
  license_key?: string; // virtual field
  user_email?: string;  // virtual field
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  email: string | null;
  action: string;
  details: string;
  timestamp: string;
  ip_address?: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  original_name: string;
  url: string;
  size: number;
  mime_type: string;
  uploaded_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  target_license_id: string | 'all'; // 'all' for global push notifications
  sent_at: string;
}

export interface ExtensionRelease {
  id: string;
  version: string;
  notes: string;
  download_url: string;
  min_chrome_version: string;
  created_at: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    is_admin: boolean;
  };
  access_token: string;
  refresh_token: string;
}
