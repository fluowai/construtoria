import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './src/db.js';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-license-manager-key-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-2026';

// Ensure uploads folder exists at startup
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure database sweeps on startup / intervals (mark stale devices as offline)
setInterval(async () => {
  try {
    const devices = await db.getDevices();
    const threshold = Date.now() - 120000; // 120 seconds threshold
    for (const d of devices) {
      if (d.is_online && new Date(d.last_heartbeat).getTime() < threshold) {
        await db.updateDevice(d.id, { is_online: false });
      }
    }
  } catch (err) {
    console.error('Error sweeping stale devices:', err);
  }
}, 30000); // Check every 30 seconds

// Custom Interfaces for Express Request handling
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    is_admin: boolean;
  };
}

// --- RATE LIMITER MIDDLEWARE (IN-MEMORY) ---
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function rateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const now = Date.now();
    const record = rateLimits.get(ip);

    if (!record || now > record.resetAt) {
      rateLimits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > limit) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.'
      });
    }
    next();
  };
}

// Enable CORS for Chrome Extensions and general dashboards
app.use(cors({
  origin: true, // Allow all origins for the extension and panel
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Express config
app.use(express.json({ limit: '50mb' })); // Higher limit for Base64 file uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploads statically
app.use('/uploads', express.static(uploadsDir));

// --- JWT AUTHENTICATION MIDDLEWARE ---
function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(41) // Unauthorized
      .json({ error: 'Unauthorized', message: 'No access token provided' });
  }

  jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden', message: 'Invalid or expired access token' });
    }

    // Verify user is not blocked
    const user = await db.getUserById(decoded.id);
    if (!user) {
      return res.status(403).json({ error: 'Forbidden', message: 'User account no longer exists' });
    }
    if (user.is_blocked) {
      return res.status(403).json({ error: 'Forbidden', message: 'Your account is blocked by an admin' });
    }

    req.user = decoded;
    next();
  });
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin role is required' });
  }
  next();
}


// ====================================================================
// API ENDPOINTS
// ====================================================================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// --- AUTHENTICATION ENDPOINTS ---

// POST /api/auth/signup - Signup
app.post('/api/auth/signup', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Email and password are required' });
  }

  try {
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const userId = 'u-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

    const user = await db.createUser({
      id: userId,
      email: email.toLowerCase().trim(),
      password_hash,
      created_at: new Date().toISOString(),
      is_admin: false,
      is_blocked: false,
    });

    // Auto-create a trial license for new users to give a perfect onboarding experience!
    const licenseId = 'lic-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const trialKey = `LIC-TRIAL-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    await db.createLicense({
      id: licenseId,
      user_id: user.id,
      key: trialKey,
      type: 'trial',
      status: 'active',
      max_devices: 1,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), // 7 days trial
      created_at: new Date().toISOString(),
    });

    await db.logActivity(user.id, user.email, 'USER_SIGNUP', `Signed up successfully and was granted trial license ${trialKey}`, req.ip);

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user: { id: user.id, email: user.email, is_admin: user.is_admin },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/auth/login - Login (with 10-attempt-per-minute rate limit for security)
app.post('/api/auth/login', rateLimiter(10, 60000), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Email and password are required' });
  }

  try {
    const user = await db.getUserByEmail(email);
    if (!user) {
      await db.logActivity(null, email, 'LOGIN_FAILED', 'Failed login attempt: User email not found', req.ip);
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    if (user.is_blocked) {
      await db.logActivity(user.id, user.email, 'LOGIN_BLOCKED', 'Attempted login from blocked account', req.ip);
      return res.status(403).json({ error: 'Forbidden', message: 'Your account is blocked by an administrator' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      await db.logActivity(user.id, user.email, 'LOGIN_FAILED', 'Failed login attempt: Incorrect password', req.ip);
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    await db.logActivity(user.id, user.email, 'USER_LOGIN', 'Logged in successfully', req.ip);

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: { id: user.id, email: user.email, is_admin: user.is_admin },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/auth/refresh - Refresh Access Token
app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Bad Request', message: 'Refresh token is required' });
  }

  try {
    jwt.verify(refresh_token, JWT_REFRESH_SECRET, async (err: any, decoded: any) => {
      if (err) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired refresh token' });
      }

      const user = await db.getUserById(decoded.id);
      if (!user) {
        return res.status(403).json({ error: 'Forbidden', message: 'User no longer exists' });
      }

      if (user.is_blocked) {
        return res.status(403).json({ error: 'Forbidden', message: 'User account is blocked' });
      }

      const accessToken = jwt.sign(
        { id: user.id, email: user.email, is_admin: user.is_admin },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      res.json({
        access_token: accessToken,
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});


// --- LICENSING ENDPOINTS (CHROME EXTENSION INGESTION) ---

// Helper function to check if a license is active and valid
function validateLicenseStatus(license: any, user: any): { valid: boolean; reason?: string } {
  if (user && user.is_blocked) {
    return { valid: false, reason: 'The license owner account has been suspended/blocked' };
  }
  if (license.status !== 'active') {
    return { valid: false, reason: `License status is currently '${license.status}'` };
  }
  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'License has expired' };
  }
  return { valid: true };
}

// POST /api/license/activate - Activate a license key for a device fingerprint
app.post('/api/license/activate', async (req: Request, res: Response) => {
  const { email, license_key, fingerprint, device_name } = req.body;

  if (!email || !license_key || !fingerprint) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Email, license_key, and fingerprint parameters are required'
    });
  }

  try {
    const license = await db.getLicenseByKey(license_key);
    if (!license) {
      return res.status(404).json({ error: 'Not Found', message: 'License key is invalid or not found' });
    }

    // Find user by email
    let user = await db.getUserByEmail(email);
    if (!user) {
      // Create user automatically on activation if they don't exist yet to make extension setup seamless!
      const tempPasswordHash = await bcrypt.hash('temp_key_auth_123', 10);
      const tempUserId = 'u-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      user = await db.createUser({
        id: tempUserId,
        email: email.toLowerCase().trim(),
        password_hash: tempPasswordHash,
        created_at: new Date().toISOString(),
        is_admin: false,
        is_blocked: false
      });
      // Link license to this new user
      await db.updateLicense(license.id, { user_id: user.id });
    } else {
      // If user exists, but license is unassigned, assign it
      if (!license.user_id) {
        await db.updateLicense(license.id, { user_id: user.id });
      } else if (license.user_id !== user.id) {
        // License belongs to a different email
        return res.status(403).json({
          error: 'Forbidden',
          message: 'This license key is linked to a different email address'
        });
      }
    }

    // Perform validation on the license expiry/status
    const validation = validateLicenseStatus(license, user);
    if (!validation.valid) {
      return res.status(403).json({ error: 'Forbidden', message: validation.reason });
    }

    // Check device list
    const devices = await db.getDevicesByLicenseId(license.id);
    let device = devices.find(d => d.fingerprint === fingerprint);

    if (device) {
      // Device already activated, update heartbeat and mark online
      await db.updateDevice(device.id, {
        is_online: true,
        last_heartbeat: new Date().toISOString(),
        device_name: device_name || device.device_name
      });
    } else {
      // New device - check limit
      if (devices.length >= license.max_devices) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Maximum device limit (${license.max_devices}) reached for this license. Please revoke an existing device from your dashboard.`
        });
      }

      // Add device
      device = await db.createDevice({
        id: 'd-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        license_id: license.id,
        fingerprint,
        device_name: device_name || 'Chrome Extension User',
        last_heartbeat: new Date().toISOString(),
        is_online: true,
      });
    }

    await db.logActivity(
      user.id,
      user.email,
      'LICENSE_ACTIVATE',
      `Activated device '${device.device_name}' [${fingerprint}] for key ${license.key}`,
      req.ip
    );

    res.json({
      success: true,
      message: 'License activated successfully',
      license: {
        key: license.key,
        type: license.type,
        status: license.status,
        expires_at: license.expires_at,
        max_devices: license.max_devices,
      },
      device: {
        id: device.id,
        device_name: device.device_name,
        is_online: device.is_online
      }
    });

  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/license/validate - Quick check if key/fingerprint is valid
app.post('/api/license/validate', async (req: Request, res: Response) => {
  const { license_key, fingerprint } = req.body;

  if (!license_key || !fingerprint) {
    return res.status(400).json({ error: 'Bad Request', message: 'license_key and fingerprint are required' });
  }

  try {
    const license = await db.getLicenseByKey(license_key);
    if (!license) {
      return res.json({ valid: false, reason: 'License key not found' });
    }

    const user = license.user_id ? await db.getUserById(license.user_id) : null;
    const validation = validateLicenseStatus(license, user);
    if (!validation.valid) {
      return res.json({ valid: false, reason: validation.reason });
    }

    const devices = await db.getDevicesByLicenseId(license.id);
    const device = devices.find(d => d.fingerprint === fingerprint);

    if (!device) {
      return res.json({ valid: false, reason: 'Device not registered. Please activate first.' });
    }

    res.json({
      valid: true,
      license: {
        key: license.key,
        type: license.type,
        expires_at: license.expires_at
      },
      device: {
        device_name: device.device_name,
        last_heartbeat: device.last_heartbeat
      }
    });

  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/license/heartbeat - Keepalive called every 60s
app.post('/api/license/heartbeat', async (req: Request, res: Response) => {
  const { license_key, fingerprint } = req.body;

  if (!license_key || !fingerprint) {
    return res.status(400).json({ error: 'Bad Request', message: 'license_key and fingerprint are required' });
  }

  try {
    const license = await db.getLicenseByKey(license_key);
    if (!license) {
      return res.json({ valid: false, reason: 'License key not found' });
    }

    const user = license.user_id ? await db.getUserById(license.user_id) : null;
    const validation = validateLicenseStatus(license, user);
    if (!validation.valid) {
      return res.json({ valid: false, reason: validation.reason });
    }

    const devices = await db.getDevicesByLicenseId(license.id);
    let device = devices.find(d => d.fingerprint === fingerprint);

    if (!device) {
      return res.json({ valid: false, reason: 'Device not registered. Please call activate first.' });
    }

    // Refresh keepalive timestamp and force is_online flag to true
    await db.updateDevice(device.id, {
      is_online: true,
      last_heartbeat: new Date().toISOString()
    });

    // Fetch notifications (global or specific to this license)
    const allNotifications = await db.getNotifications();
    const filteredNotifications = allNotifications.filter(
      n => n.target_license_id === 'all' || n.target_license_id === license.id
    );

    // Count currently active online devices for this license
    const onlineCount = devices.filter(d => d.is_online || d.id === device?.id).length;

    res.json({
      valid: true,
      type: license.type,
      expires_at: license.expires_at,
      devices_online: onlineCount,
      notifications: filteredNotifications.slice(0, 5), // Return latest 5
    });

  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/license/mine - List all licenses for currently logged in user
app.get('/api/license/mine', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401);

  try {
    const allLicenses = await db.getLicenses();
    const userLicenses = allLicenses.filter(l => l.user_id === req.user!.id);

    // Enriched with active devices
    const enriched = await Promise.all(userLicenses.map(async (lic) => {
      const devices = await db.getDevicesByLicenseId(lic.id);
      return {
        ...lic,
        devices: devices.map(d => ({
          id: d.id,
          device_name: d.device_name,
          fingerprint: d.fingerprint,
          last_heartbeat: d.last_heartbeat,
          is_online: d.is_online
        }))
      };
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});


// ====================================================================
// ADMIN CONTROL PANEL ENDPOINTS (PROTECTED BY JWT + ADMIN ROLE)
// ====================================================================

// GET /api/admin/stats - Overall health stats for dashboard
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await db.getUsers();
    const licenses = await db.getLicenses();
    const devices = await db.getDevices();
    const files = await db.getUploadedFiles();

    const activeLicenses = licenses.filter(l => l.status === 'active').length;
    const onlineDevices = devices.filter(d => d.is_online).length;

    res.json({
      total_users: users.length,
      total_licenses: licenses.length,
      active_licenses: activeLicenses,
      online_devices: onlineDevices,
      total_files: files.length
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// --- ADMIN USER CRUD ---

// GET /api/admin/users - List users
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await db.getUsers();
    // Exclude password hashes from API response
    const sanitized = users.map(({ password_hash, ...u }) => u);
    res.json(sanitized);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/admin/users - Create User
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, is_admin } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Email and password are required' });
  }

  try {
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'User already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await db.createUser({
      id: 'u-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      email: email.toLowerCase().trim(),
      password_hash,
      created_at: new Date().toISOString(),
      is_admin: !!is_admin,
      is_blocked: false
    });

    await db.logActivity(req.user!.id, req.user!.email, 'ADMIN_CREATE_USER', `Created user account: ${user.email} (IsAdmin: ${user.is_admin})`, req.ip);

    const { password_hash: _, ...sanitized } = user;
    res.status(201).json(sanitized);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// PUT /api/admin/users/:id - Block/Edit User
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { is_blocked, is_admin, email } = req.body;

  try {
    const user = await db.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    if (user.id === req.user!.id) {
      return res.status(400).json({ error: 'Bad Request', message: 'You cannot block or de-privilege your own admin account.' });
    }

    const updates: Partial<typeof user> = {};
    if (is_blocked !== undefined) updates.is_blocked = !!is_blocked;
    if (is_admin !== undefined) updates.is_admin = !!is_admin;
    if (email !== undefined) updates.email = email.toLowerCase().trim();

    const updated = await db.updateUser(id, updates);

    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_UPDATE_USER',
      `Updated user ${user.email}: ${JSON.stringify(updates)}`,
      req.ip
    );

    const { password_hash, ...sanitized } = updated!;
    res.json(sanitized);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// DELETE /api/admin/users/:id - Cascade delete user
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const user = await db.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    if (user.id === req.user!.id) {
      return res.status(400).json({ error: 'Bad Request', message: 'You cannot delete your own admin account.' });
    }

    await db.deleteUser(id);
    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_DELETE_USER',
      `Deleted user ${user.email} and all linked licenses/devices`,
      req.ip
    );

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// --- ADMIN LICENSE CRUD ---

// GET /api/admin/licenses - List Licenses with emails attached
app.get('/api/admin/licenses', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const licenses = await db.getLicenses();
    const users = await db.getUsers();

    const enriched = licenses.map(l => {
      const user = users.find(u => u.id === l.user_id);
      return {
        ...l,
        user_email: user ? user.email : 'Unassigned/Available'
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/admin/licenses - Generate License Key
app.post('/api/admin/licenses', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { user_email, type, max_devices, expires_at } = req.body;

  try {
    let user_id = '';
    if (user_email) {
      const user = await db.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ error: 'Not Found', message: `No user account found with email ${user_email}. Register them first.` });
      }
      user_id = user.id;
    }

    // Generate random LICENSE key (Format: LIC-TYPE-XXXX-XXXX)
    const segment1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const segment2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `LIC-${(type || 'trial').substring(0, 4).toUpperCase()}-${segment1}-${segment2}`;

    const license = await db.createLicense({
      id: 'lic-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      user_id: user_id || '', // can be initially unassigned for activation!
      key,
      type: type || 'trial',
      status: 'active',
      max_devices: parseInt(max_devices) || 1,
      expires_at: expires_at ? new Date(expires_at).toISOString() : null,
      created_at: new Date().toISOString()
    });

    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_CREATE_LICENSE',
      `Generated license ${key} for ${user_email || 'Unassigned'} (Type: ${type})`,
      req.ip
    );

    res.status(201).json(license);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// PUT /api/admin/licenses/:id - Edit License status/duration
app.put('/api/admin/licenses/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, expires_at, max_devices, type } = req.body;

  try {
    const license = await db.getLicenseById(id);
    if (!license) {
      return res.status(404).json({ error: 'Not Found', message: 'License not found' });
    }

    const updates: Partial<typeof license> = {};
    if (status) updates.status = status;
    if (expires_at !== undefined) updates.expires_at = expires_at ? new Date(expires_at).toISOString() : null;
    if (max_devices !== undefined) updates.max_devices = parseInt(max_devices);
    if (type) updates.type = type;

    const updated = await db.updateLicense(id, updates);

    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_UPDATE_LICENSE',
      `Updated license ${license.key}: ${JSON.stringify(updates)}`,
      req.ip
    );

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// DELETE /api/admin/licenses/:id - Delete License key
app.delete('/api/admin/licenses/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const license = await db.getLicenseById(id);
    if (!license) {
      return res.status(404).json({ error: 'Not Found', message: 'License not found' });
    }

    await db.deleteLicense(id);
    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_DELETE_LICENSE',
      `Deleted license key: ${license.key}`,
      req.ip
    );

    res.json({ success: true, message: 'License deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// --- ADMIN DEVICE MANAGEMENT ---

// GET /api/admin/devices - List all registered devices
app.get('/api/admin/devices', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const devices = await db.getDevices();
    const licenses = await db.getLicenses();
    const users = await db.getUsers();

    const enriched = devices.map(d => {
      const lic = licenses.find(l => l.id === d.license_id);
      const user = lic && lic.user_id ? users.find(u => u.id === lic.user_id) : null;
      return {
        ...d,
        license_key: lic ? lic.key : 'Unknown key',
        user_email: user ? user.email : 'Unknown owner'
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// DELETE /api/admin/devices/:id - Revoke device registration
app.delete('/api/admin/devices/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const device = await db.getDeviceById(id);
    if (!device) {
      return res.status(404).json({ error: 'Not Found', message: 'Device not found' });
    }

    await db.deleteDevice(id);

    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_REVOKE_DEVICE',
      `Revoked device activation for '${device.device_name}' [${device.fingerprint}]`,
      req.ip
    );

    res.json({ success: true, message: 'Device revoked successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// --- TELEMETRY AUDIT LOGS ---

// GET /api/admin/logs - Fetch audit activities
app.get('/api/admin/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await db.getLogs();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// --- CLOUD BINARY FILE UPLOAD ---

// POST /api/admin/upload - Handle file upload as Base64 string to be zero-config on any server host
app.post('/api/admin/upload', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { filename, mime_type, file_data } = req.body;

  if (!filename || !file_data) {
    return res.status(400).json({ error: 'Bad Request', message: 'filename and file_data (base64) are required' });
  }

  try {
    // Decode base64 file data
    const buffer = Buffer.from(file_data.split(',')[1] || file_data, 'base64');
    const secureName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadsDir, secureName);

    // Save binary file to local uploads server
    await fs.promises.writeFile(filePath, buffer);

    const fileUrl = `/uploads/${secureName}`;
    const uploadedFile = await db.createUploadedFile({
      id: 'f-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      filename: secureName,
      original_name: filename,
      url: fileUrl,
      size: buffer.length,
      mime_type: mime_type || 'application/octet-stream',
      uploaded_at: new Date().toISOString()
    });

    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_UPLOAD_FILE',
      `Uploaded extension release asset: ${filename} as ${secureName} (${(buffer.length/1024).toFixed(1)} KB)`,
      req.ip
    );

    res.status(201).json(uploadedFile);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/admin/files - List files
app.get('/api/admin/files', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = await db.getUploadedFiles();
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// --- PUSH NOTIFICATIONS ---

// GET /api/admin/notifications - List sent push messages
app.get('/api/admin/notifications', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notifications = await db.getNotifications();
    res.json(notifications);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/admin/notifications - Dispatch notification
app.post('/api/admin/notifications', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { title, message, target_license_id } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: 'Bad Request', message: 'title and message are required' });
  }

  try {
    const newNotif = await db.createNotification({
      id: 'n-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      title,
      message,
      target_license_id: target_license_id || 'all',
      sent_at: new Date().toISOString()
    });

    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_SEND_NOTIFICATION',
      `Dispatched push alert: "${title}" to target: ${target_license_id || 'all'}`,
      req.ip
    );

    res.status(201).json(newNotif);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// --- EXTENSION RELEASES (VERSION CHECK) ---

// GET /api/extension/check-version - Public version check endpoint
app.get('/api/extension/check-version', async (req: Request, res: Response) => {
  const { version } = req.query;

  if (!version) {
    return res.status(400).json({ error: 'Bad Request', message: 'version query parameter is required' });
  }

  try {
    const latest = await db.getLatestRelease();
    if (!latest) {
      return res.json({ update_available: false, message: 'No releases registered in licensing manager yet' });
    }

    const currentStr = String(version).trim();
    const latestStr = latest.version.trim();

    // Simple comparison (can use semver in production, here a basic unequal checks for updates)
    const needsUpdate = currentStr !== latestStr;

    res.json({
      update_available: needsUpdate,
      current_version: currentStr,
      latest_version: latestStr,
      notes: latest.notes,
      download_url: latest.download_url,
      min_chrome_version: latest.min_chrome_version,
      checked_at: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/admin/releases - List releases
app.get('/api/admin/releases', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const releases = await db.getReleases();
    res.json(releases);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/admin/releases - Add new release
app.post('/api/admin/releases', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { version, notes, download_url, min_chrome_version } = req.body;

  if (!version || !download_url) {
    return res.status(400).json({ error: 'Bad Request', message: 'version and download_url are required' });
  }

  try {
    const release = await db.createRelease({
      id: 'r-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      version,
      notes: notes || '',
      download_url,
      min_chrome_version: min_chrome_version || '100',
      created_at: new Date().toISOString()
    });

    await db.logActivity(
      req.user!.id,
      req.user!.email,
      'ADMIN_CREATE_RELEASE',
      `Registered extension build version: v${version}`,
      req.ip
    );

    res.status(201).json(release);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});


// ====================================================================
// VITE AND STATIC CLIENT RENDERING MIDDLEWARE
// ====================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Dev Mode - Inject Vite Middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode - Serve React client bundle
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Extension licensing server booting...`);
    console.log(`🌍 Endpoint: http://0.0.0.0:${PORT}`);
    console.log(`🔐 Database loaded & Sweeper services active`);
  });
}

startServer();
