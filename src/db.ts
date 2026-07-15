import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import { User, License, Device, ActivityLog, UploadedFile, Notification, ExtensionRelease } from './types.js';

const DB_FILE = path.join(process.cwd(), 'db.json');

interface DatabaseSchema {
  users: User[];
  licenses: License[];
  devices: Device[];
  activity_logs: ActivityLog[];
  uploaded_files: UploadedFile[];
  notifications: Notification[];
  extension_releases: ExtensionRelease[];
}

class Database {
  private cache: DatabaseSchema | null = null;
  private writePromise: Promise<void> = Promise.resolve();

  private async load(): Promise<DatabaseSchema> {
    if (this.cache) return this.cache;

    try {
      const exists = await fs.access(DB_FILE).then(() => true).catch(() => false);
      if (exists) {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        this.cache = JSON.parse(data);
        return this.cache!;
      }
    } catch (e) {
      console.error('Error loading database file, falling back to seed.', e);
    }

    // Seed if file does not exist or fails to load
    await this.seed();
    return this.cache!;
  }

  private async save(): Promise<void> {
    if (!this.cache) return;
    // Simple queue to prevent concurrent write collisions
    this.writePromise = this.writePromise.then(async () => {
      try {
        await fs.writeFile(DB_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
      } catch (e) {
        console.error('Error saving database:', e);
      }
    });
    return this.writePromise;
  }

  private async seed(): Promise<void> {
    console.log('Seeding initial database...');
    
    // Hash some default passwords
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const userPasswordHash = await bcrypt.hash('user123', 10);
    const mockUser1Hash = await bcrypt.hash('devpass', 10);

    const adminId = '11111111-1111-4111-a111-111111111111';
    const userId = '22222222-2222-4222-a222-222222222222';
    const mockUser1Id = '33333333-3333-4333-a333-333333333333';

    const users: User[] = [
      {
        id: adminId,
        email: 'admin@admin.com',
        password_hash: adminPasswordHash,
        created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        is_admin: true,
        is_blocked: false,
      },
      {
        id: userId,
        email: 'user@user.com',
        password_hash: userPasswordHash,
        created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
        is_admin: false,
        is_blocked: false,
      },
      {
        id: mockUser1Id,
        email: 'developer@example.com',
        password_hash: mockUser1Hash,
        created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
        is_admin: false,
        is_blocked: false,
      }
    ];

    const lKey1 = 'LIC-TRIAL-8888-8888';
    const lKey2 = 'LIC-MONT-9999-9999';
    const lKey3 = 'LIC-LIFE-7777-7777';

    const licenses: License[] = [
      {
        id: '11111111-0000-0000-0000-111111111111',
        user_id: userId,
        key: lKey1,
        type: 'trial',
        status: 'active',
        max_devices: 1,
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: '22222222-0000-0000-0000-222222222222',
        user_id: userId,
        key: lKey2,
        type: 'monthly',
        status: 'active',
        max_devices: 3,
        expires_at: new Date(Date.now() + 27 * 24 * 3600 * 1000).toISOString(),
        created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: '33333333-0000-0000-0000-333333333333',
        user_id: mockUser1Id,
        key: lKey3,
        type: 'lifetime',
        status: 'active',
        max_devices: 5,
        expires_at: null,
        created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      }
    ];

    const devices: Device[] = [
      {
        id: 'd1111111-1111-1111-1111-111111111111',
        license_id: '11111111-0000-0000-0000-111111111111',
        fingerprint: 'chrome-ext-fingerprint-macbook-pro',
        device_name: 'My Macbook Pro',
        last_heartbeat: new Date(Date.now() - 10000).toISOString(),
        is_online: true,
      },
      {
        id: 'd2222222-2222-2222-2222-222222222222',
        license_id: '33333333-0000-0000-0000-333333333333',
        fingerprint: 'chrome-ext-fingerprint-work-pc',
        device_name: 'Work PC Chrome Dev',
        last_heartbeat: new Date(Date.now() - 40000).toISOString(),
        is_online: true,
      }
    ];

    const activity_logs: ActivityLog[] = [
      {
        id: 'log-1',
        user_id: adminId,
        email: 'admin@admin.com',
        action: 'ADMIN_LOGIN',
        details: 'Admin logged in from dashboard IP: 127.0.0.1',
        timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      },
      {
        id: 'log-2',
        user_id: userId,
        email: 'user@user.com',
        action: 'LICENSE_ACTIVATE',
        details: `Activated key LIC-TRIAL-8888-8888 for fingerprint 'chrome-ext-fingerprint-macbook-pro'`,
        timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: 'log-3',
        user_id: userId,
        email: 'user@user.com',
        action: 'LICENSE_HEARTBEAT',
        details: `Heartbeat received from device 'My Macbook Pro' with key LIC-TRIAL-8888-8888`,
        timestamp: new Date(Date.now() - 10000).toISOString(),
      }
    ];

    const uploaded_files: UploadedFile[] = [
      {
        id: 'f1',
        filename: 'chrome-extension-v1.0.0.zip',
        original_name: 'extension-build-v100.zip',
        url: '/uploads/chrome-extension-v1.0.0.zip',
        size: 1450000,
        mime_type: 'application/zip',
        uploaded_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      }
    ];

    const notifications: Notification[] = [
      {
        id: 'n1',
        title: 'Welcome to Pro version!',
        message: 'Thank you for choosing our extension. Get started with documentation inside the admin dashboard.',
        target_license_id: 'all',
        sent_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      }
    ];

    const extension_releases: ExtensionRelease[] = [
      {
        id: 'r1',
        version: '1.0.0',
        notes: 'Initial stable release of our Chrome Extension, containing user authenticators, licensing heartbeats, and local configuration presets.',
        download_url: '/uploads/chrome-extension-v1.0.0.zip',
        min_chrome_version: '100',
        created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      }
    ];

    this.cache = {
      users,
      licenses,
      devices,
      activity_logs,
      uploaded_files,
      notifications,
      extension_releases,
    };

    await this.save();
  }

  // --- Users CRUD ---
  async getUsers(): Promise<User[]> {
    const db = await this.load();
    return db.users;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const db = await this.load();
    return db.users.find(u => u.id === id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const db = await this.load();
    const cleanEmail = email.toLowerCase().trim();
    return db.users.find(u => u.email.toLowerCase().trim() === cleanEmail);
  }

  async createUser(user: User): Promise<User> {
    const db = await this.load();
    db.users.push(user);
    await this.save();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const db = await this.load();
    const index = db.users.findIndex(u => u.id === id);
    if (index === -1) return undefined;
    db.users[index] = { ...db.users[index], ...updates };
    await this.save();
    return db.users[index];
  }

  async deleteUser(id: string): Promise<boolean> {
    const db = await this.load();
    const initialLen = db.users.length;
    db.users = db.users.filter(u => u.id !== id);
    // Also cascades: delete licenses and devices for this user
    const userLicenses = db.licenses.filter(l => l.user_id === id);
    const licenseIds = userLicenses.map(l => l.id);
    db.licenses = db.licenses.filter(l => l.user_id !== id);
    db.devices = db.devices.filter(d => !licenseIds.includes(d.license_id));
    await this.save();
    return db.users.length < initialLen;
  }

  // --- Licenses CRUD ---
  async getLicenses(): Promise<License[]> {
    const db = await this.load();
    return db.licenses;
  }

  async getLicenseById(id: string): Promise<License | undefined> {
    const db = await this.load();
    return db.licenses.find(l => l.id === id);
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    const db = await this.load();
    const cleanKey = key.trim().toUpperCase();
    return db.licenses.find(l => l.key.toUpperCase() === cleanKey);
  }

  async createLicense(license: License): Promise<License> {
    const db = await this.load();
    db.licenses.push(license);
    await this.save();
    return license;
  }

  async updateLicense(id: string, updates: Partial<License>): Promise<License | undefined> {
    const db = await this.load();
    const index = db.licenses.findIndex(l => l.id === id);
    if (index === -1) return undefined;
    db.licenses[index] = { ...db.licenses[index], ...updates };
    await this.save();
    return db.licenses[index];
  }

  async deleteLicense(id: string): Promise<boolean> {
    const db = await this.load();
    const initialLen = db.licenses.length;
    db.licenses = db.licenses.filter(l => l.id !== id);
    db.devices = db.devices.filter(d => d.license_id !== id);
    await this.save();
    return db.licenses.length < initialLen;
  }

  // --- Devices CRUD ---
  async getDevices(): Promise<Device[]> {
    const db = await this.load();
    return db.devices;
  }

  async getDevicesByLicenseId(licenseId: string): Promise<Device[]> {
    const db = await this.load();
    return db.devices.filter(d => d.license_id === licenseId);
  }

  async getDeviceById(id: string): Promise<Device | undefined> {
    const db = await this.load();
    return db.devices.find(d => d.id === id);
  }

  async getDeviceByFingerprint(licenseId: string, fingerprint: string): Promise<Device | undefined> {
    const db = await this.load();
    return db.devices.find(d => d.license_id === licenseId && d.fingerprint === fingerprint);
  }

  async createDevice(device: Device): Promise<Device> {
    const db = await this.load();
    db.devices.push(device);
    await this.save();
    return device;
  }

  async updateDevice(id: string, updates: Partial<Device>): Promise<Device | undefined> {
    const db = await this.load();
    const index = db.devices.findIndex(d => d.id === id);
    if (index === -1) return undefined;
    db.devices[index] = { ...db.devices[index], ...updates };
    await this.save();
    return db.devices[index];
  }

  async deleteDevice(id: string): Promise<boolean> {
    const db = await this.load();
    const initialLen = db.devices.length;
    db.devices = db.devices.filter(d => d.id !== id);
    await this.save();
    return db.devices.length < initialLen;
  }

  // --- Activity Logs ---
  async getLogs(): Promise<ActivityLog[]> {
    const db = await this.load();
    return db.activity_logs;
  }

  async logActivity(userId: string | null, email: string | null, action: string, details: string, ipAddress?: string): Promise<ActivityLog> {
    const db = await this.load();
    const log: ActivityLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      user_id: userId,
      email,
      action,
      details,
      timestamp: new Date().toISOString(),
      ip_address: ipAddress,
    };
    db.activity_logs.unshift(log); // Prepend so it's latest first
    // Limit log size to last 500 records to avoid bloat
    if (db.activity_logs.length > 500) {
      db.activity_logs = db.activity_logs.slice(0, 500);
    }
    await this.save();
    return log;
  }

  // --- Uploaded Files ---
  async getUploadedFiles(): Promise<UploadedFile[]> {
    const db = await this.load();
    return db.uploaded_files;
  }

  async createUploadedFile(file: UploadedFile): Promise<UploadedFile> {
    const db = await this.load();
    db.uploaded_files.push(file);
    await this.save();
    return file;
  }

  // --- Notifications ---
  async getNotifications(): Promise<Notification[]> {
    const db = await this.load();
    return db.notifications;
  }

  async createNotification(notif: Notification): Promise<Notification> {
    const db = await this.load();
    db.notifications.unshift(notif);
    await this.save();
    return notif;
  }

  // --- Extension Releases ---
  async getReleases(): Promise<ExtensionRelease[]> {
    const db = await this.load();
    return db.extension_releases;
  }

  async createRelease(release: ExtensionRelease): Promise<ExtensionRelease> {
    const db = await this.load();
    db.extension_releases.unshift(release);
    await this.save();
    return release;
  }

  async getLatestRelease(): Promise<ExtensionRelease | undefined> {
    const db = await this.load();
    if (db.extension_releases.length === 0) return undefined;
    // Sort by version (simple descending string sort, we assume standard semver)
    return [...db.extension_releases].sort((a, b) => b.version.localeCompare(a.version))[0];
  }
}

export const db = new Database();
export default db;
