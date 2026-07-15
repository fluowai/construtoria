import React, { useState, useEffect } from 'react';
import { 
  Users, Key, ShieldAlert, Activity, Clipboard, Check, Plus, Trash2, 
  Slash, Lock, Unlock, Server, Send, Radio, FileUp, Download, Info, Search, X, Calendar 
} from 'lucide-react';

interface AdminPanelProps {
  token: string;
  onLogout: () => void;
  refreshTrigger: number;
}

export function AdminPanel({ token, onLogout, refreshTrigger }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'kpis' | 'licenses' | 'users' | 'devices' | 'logs' | 'assets'>('licenses');
  
  // Dashboard Metrics
  const [stats, setStats] = useState({
    total_users: 0,
    total_licenses: 0,
    active_licenses: 0,
    online_devices: 0,
    total_files: 0
  });

  // DB Data lists
  const [users, setUsers] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);

  // Filtering searches
  const [userSearch, setUserSearch] = useState('');
  const [licenseSearch, setLicenseSearch] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');

  // UI Modals / Form States
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Create User State
  const [newUser, setNewUser] = useState({ email: '', password: '', is_admin: false });
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Create License State
  const [newLicense, setNewLicense] = useState({ user_email: '', type: 'trial', max_devices: '1', expires_at: '' });
  const [isCreatingLicense, setIsCreatingLicense] = useState(false);

  // Dispatch Notification State
  const [newNotification, setNewNotification] = useState({ title: '', message: '', target_license_id: 'all' });
  const [isSendingNotif, setIsSendingNotif] = useState(false);

  // Upload File / Create Release States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFileForm, setUploadFileForm] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [newRelease, setNewRelease] = useState({ version: '', notes: '', download_url: '', min_chrome_version: '100' });
  const [isCreatingRelease, setIsCreatingRelease] = useState(false);

  // Alerts feedback
  const [apiMessage, setApiMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Helper: auto-expire API feedback alerts after 4s
  const showFeedback = (type: 'success' | 'error', text: string) => {
    setApiMessage({ type, text });
    setTimeout(() => setApiMessage(null), 4000);
  };

  // Fetch KPI stats and all database items
  const fetchAllData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      // 1. Fetch Stats
      const statsRes = await fetch('/api/admin/stats', { headers });
      if (statsRes.ok) setStats(await statsRes.json());

      // 2. Fetch Users
      const usersRes = await fetch('/api/admin/users', { headers });
      if (usersRes.ok) setUsers(await usersRes.json());

      // 3. Fetch Licenses
      const licensesRes = await fetch('/api/admin/licenses', { headers });
      if (licensesRes.ok) setLicenses(await licensesRes.json());

      // 4. Fetch Devices
      const devicesRes = await fetch('/api/admin/devices', { headers });
      if (devicesRes.ok) setDevices(await devicesRes.json());

      // 5. Fetch Logs
      const logsRes = await fetch('/api/admin/logs', { headers });
      if (logsRes.ok) setLogs(await logsRes.json());

      // 6. Fetch Uploaded Files
      const filesRes = await fetch('/api/admin/files', { headers });
      if (filesRes.ok) setFiles(await filesRes.json());

      // 7. Fetch Releases
      const releasesRes = await fetch('/api/admin/releases', { headers });
      if (releasesRes.ok) setReleases(await releasesRes.json());

    } catch (err: any) {
      console.error('Error fetching admin dashboard data:', err);
    }
  };

  // Trigger load on tab changes, refresh triggers, etc.
  useEffect(() => {
    fetchAllData();
  }, [token, activeTab, refreshTrigger]);

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // --- CRUD API Calls ---

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (res.ok) {
        showFeedback('success', `Conta ${data.email} criada com sucesso.`);
        setNewUser({ email: '', password: '', is_admin: false });
        setIsCreatingUser(false);
        fetchAllData();
      } else {
        showFeedback('error', data.message || 'Erro ao criar usuário');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Toggle User Block Status
  const handleToggleBlockUser = async (id: string, currentlyBlocked: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ is_blocked: !currentlyBlocked })
      });
      const data = await res.json();
      if (res.ok) {
        showFeedback('success', `Status do usuário modificado com sucesso.`);
        fetchAllData();
      } else {
        showFeedback('error', data.message || 'Falha ao alterar usuário');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Delete User (Cascade)
  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Tem certeza? Isso deletará o usuário e todas as suas licenças e pings de dispositivos de forma permanente!')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('success', 'Usuário e licenças deletadas.');
        fetchAllData();
      } else {
        const data = await res.json();
        showFeedback('error', data.message || 'Falha ao deletar usuário');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Create/Generate License Key
  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          user_email: newLicense.user_email || undefined,
          type: newLicense.type,
          max_devices: newLicense.max_devices,
          expires_at: newLicense.expires_at || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        showFeedback('success', `Nova chave de licença criada: ${data.key}`);
        setNewLicense({ user_email: '', type: 'trial', max_devices: '1', expires_at: '' });
        setIsCreatingLicense(false);
        fetchAllData();
      } else {
        showFeedback('error', data.message || 'Erro ao gerar licença');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Toggle License Status
  const handleUpdateLicenseStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/licenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showFeedback('success', `Licença atualizada para status ${newStatus}.`);
        fetchAllData();
      } else {
        const data = await res.json();
        showFeedback('error', data.message || 'Falha ao atualizar licença');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Increase Device Limit for License
  const handleUpdateLicenseDevices = async (id: string, currentLimit: number) => {
    const newVal = prompt('Digite o novo limite máximo de dispositivos:', String(currentLimit));
    if (newVal === null || newVal === '') return;
    const max_devices = parseInt(newVal);
    if (isNaN(max_devices) || max_devices < 1) {
      alert('Valor inválido!');
      return;
    }

    try {
      const res = await fetch(`/api/admin/licenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ max_devices })
      });
      if (res.ok) {
        showFeedback('success', `Limite de dispositivos atualizado para ${max_devices}`);
        fetchAllData();
      } else {
        const data = await res.json();
        showFeedback('error', data.message);
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Delete License
  const handleDeleteLicense = async (id: string) => {
    if (!window.confirm('Excluir esta chave de licença? Dispositivos ativados nela perderão o acesso imediatamente.')) return;
    try {
      const res = await fetch(`/api/admin/licenses/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('success', 'Chave de licença excluída.');
        fetchAllData();
      } else {
        const data = await res.json();
        showFeedback('error', data.message);
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Revoke/Delete Device
  const handleRevokeDevice = async (id: string) => {
    if (!window.confirm('Revogar este dispositivo? A extensão fará logout em seu próximo ping periódico.')) return;
    try {
      const res = await fetch(`/api/admin/devices/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('success', 'Dispositivo revogado com sucesso.');
        fetchAllData();
      } else {
        const data = await res.json();
        showFeedback('error', data.message);
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Send Notification
  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newNotification)
      });
      if (res.ok) {
        showFeedback('success', 'Mensagem push disparada para os dispositivos.');
        setNewNotification({ title: '', message: '', target_license_id: 'all' });
        setIsSendingNotif(false);
        fetchAllData();
      } else {
        const data = await res.json();
        showFeedback('error', data.message);
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Handle local File Selection to prepare Base64 conversion
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadFileForm({
        name: file.name,
        type: file.type,
        base64: reader.result as string
      });
    };
    reader.readAsDataURL(file);
  };

  // Perform File Upload
  const handleUploadFile = async () => {
    if (!uploadFileForm) return;
    setIsUploading(true);

    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          filename: uploadFileForm.name,
          mime_type: uploadFileForm.type,
          file_data: uploadFileForm.base64
        })
      });
      const data = await res.json();
      if (res.ok) {
        showFeedback('success', `Arquivo salvo com sucesso na nuvem.`);
        setNewRelease(prev => ({ ...prev, download_url: data.url }));
        setUploadFileForm(null);
        fetchAllData();
      } else {
        showFeedback('error', data.message || 'Falha no upload do arquivo.');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Register New Release
  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newRelease)
      });
      if (res.ok) {
        showFeedback('success', `Versão v${newRelease.version} registrada.`);
        setNewRelease({ version: '', notes: '', download_url: '', min_chrome_version: '100' });
        setIsCreatingRelease(false);
        fetchAllData();
      } else {
        const data = await res.json();
        showFeedback('error', data.message);
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };


  // --- Render lists ---

  const filteredLicenses = licenses.filter(l => 
    l.key.toLowerCase().includes(licenseSearch.toLowerCase()) ||
    l.user_email.toLowerCase().includes(licenseSearch.toLowerCase()) ||
    l.type.toLowerCase().includes(licenseSearch.toLowerCase())
  );

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.id.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredDevices = devices.filter(d => 
    d.device_name.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    d.fingerprint.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    d.license_key?.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    d.user_email?.toLowerCase().includes(deviceSearch.toLowerCase())
  );

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(logSearch.toLowerCase()) ||
    log.details.toLowerCase().includes(logSearch.toLowerCase()) ||
    (log.email && log.email.toLowerCase().includes(logSearch.toLowerCase()))
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-5 md:p-6 flex flex-col h-full overflow-hidden">
      
      {/* Top Admin Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 shrink-0 gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <Server className="w-5 h-5 text-indigo-600" />
            <span>Painel de Licenciamento</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Console de Controle e Ativação do Construtor Sem Limites</p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button 
            onClick={onLogout}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
          >
            Sair do Painel
          </button>
        </div>
      </div>

      {/* API Success/Error Banner Notification */}
      {apiMessage && (
        <div className={`mt-3 px-4 py-2.5 rounded-lg text-xs font-semibold border ${
          apiMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        } shrink-0`}>
          {apiMessage.text}
        </div>
      )}

      {/* KPI Stats Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 py-4 shrink-0">
        <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center space-x-3 shadow-sm">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><Users className="w-4 h-4" /></div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Usuários</div>
            <div className="text-base font-bold text-slate-800">{stats.total_users}</div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center space-x-3 shadow-sm">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><Key className="w-4 h-4" /></div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Chaves</div>
            <div className="text-base font-bold text-slate-800">{stats.total_licenses}</div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center space-x-3 shadow-sm">
          <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Clipboard className="w-4 h-4" /></div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Ativas</div>
            <div className="text-base font-bold text-emerald-600">{stats.active_licenses}</div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center space-x-3 shadow-sm">
          <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Radio className="w-4 h-4" /></div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Online</div>
            <div className="text-base font-bold text-emerald-600">{stats.online_devices}</div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center space-x-3 shadow-sm col-span-2 lg:col-span-1">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><FileUp className="w-4 h-4" /></div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Arquivos ZIP</div>
            <div className="text-base font-bold text-slate-800">{stats.total_files}</div>
          </div>
        </div>
      </div>

      {/* Tabs list navigation */}
      <div className="flex border-b border-slate-100 overflow-x-auto shrink-0 scrollbar-none">
        <button
          onClick={() => setActiveTab('licenses')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition whitespace-nowrap ${activeTab === 'licenses' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          🔑 Licenças ({stats.total_licenses})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition whitespace-nowrap ${activeTab === 'users' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          👥 Usuários ({stats.total_users})
        </button>
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition whitespace-nowrap ${activeTab === 'devices' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          💻 Dispositivos Online ({stats.online_devices})
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition whitespace-nowrap ${activeTab === 'assets' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          📂 Releases & Push
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition whitespace-nowrap ${activeTab === 'logs' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          📋 Histórico / Logs
        </button>
      </div>

      {/* Scrollable Container of selected Tab */}
      <div className="grow overflow-y-auto pt-4 flex flex-col scrollbar-thin">
        
        {/* ==================================================================== */}
        {/* TAB 1: LICENSES */}
        {/* ==================================================================== */}
        {activeTab === 'licenses' && (
          <div className="flex flex-col space-y-4 h-full">
            
            {/* Table actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="relative max-w-xs w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar por chave ou email..."
                  value={licenseSearch}
                  onChange={(e) => setLicenseSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <button
                onClick={() => setIsCreatingLicense(!isCreatingLicense)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center space-x-1 transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Gerar Nova Licença</span>
              </button>
            </div>

            {/* Create License Form Panel */}
            {isCreatingLicense && (
              <form onSubmit={handleCreateLicense} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 animate-fade-in">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Gerar Chave de Licença</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">E-mail do Usuário (Opcional)</label>
                    <input
                      type="email"
                      placeholder="vincular@email.com"
                      value={newLicense.user_email}
                      onChange={(e) => setNewLicense({ ...newLicense, user_email: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Tipo de Licença</label>
                    <select
                      value={newLicense.type}
                      onChange={(e) => setNewLicense({ ...newLicense, type: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="trial">Trial (Teste)</option>
                      <option value="monthly">Mensal (Subscription)</option>
                      <option value="lifetime">Lifetime (Vitalícia)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Máx. Dispositivos</label>
                    <input
                      type="number"
                      min="1"
                      value={newLicense.max_devices}
                      onChange={(e) => setNewLicense({ ...newLicense, max_devices: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Expiração (Opcional)</label>
                    <input
                      type="date"
                      value={newLicense.expires_at}
                      onChange={(e) => setNewLicense({ ...newLicense, expires_at: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingLicense(false)}
                    className="px-3 py-1.5 text-slate-500 text-xs hover:text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                  >
                    Gerar e Salvar
                  </button>
                </div>
              </form>
            )}

            {/* License Grid Table */}
            <div className="border border-slate-100 rounded-xl overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-600">
                <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Chave de Licença</th>
                    <th className="px-4 py-3">E-mail Vinculado</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Máx. Dispositivos</th>
                    <th className="px-4 py-3">Expiração</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLicenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400 italic">
                        Nenhuma licença correspondente encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredLicenses.map((lic) => (
                      <tr key={lic.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold flex items-center space-x-1.5 text-slate-800">
                          <span>{lic.key}</span>
                          <button
                            onClick={() => copyToClipboard(lic.key)}
                            className="text-slate-400 hover:text-slate-600"
                            title="Copiar Chave"
                          >
                            {copiedKey === lic.key ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Clipboard className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{lic.user_email}</td>
                        <td className="px-4 py-3 font-semibold uppercase">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            lic.type === 'lifetime' ? 'bg-indigo-100 text-indigo-800' :
                            lic.type === 'monthly' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {lic.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={lic.status}
                            onChange={(e) => handleUpdateLicenseStatus(lic.id, e.target.value)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border-0 bg-transparent ${
                              lic.status === 'active' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
                            }`}
                          >
                            <option value="active">Ativa</option>
                            <option value="suspended">Suspensa</option>
                            <option value="expired">Expirada</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleUpdateLicenseDevices(lic.id, lic.max_devices)}
                            className="hover:underline font-mono"
                          >
                            {lic.max_devices} slots (Editar)
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Nenhuma (Vitalícia)'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteLicense(lic.id)}
                            className="text-slate-400 hover:text-red-600 p-1"
                            title="Excluir licença"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: USERS */}
        {/* ==================================================================== */}
        {activeTab === 'users' && (
          <div className="flex flex-col space-y-4 h-full">
            
            {/* Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="relative max-w-xs w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar usuários por e-mail..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <button
                onClick={() => setIsCreatingUser(!isCreatingUser)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center space-x-1 transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Novo Usuário</span>
              </button>
            </div>

            {/* Create User Form */}
            {isCreatingUser && (
              <form onSubmit={handleCreateUser} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 animate-fade-in">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Adicionar Nova Conta</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">E-mail do Cliente</label>
                    <input
                      type="email"
                      required
                      placeholder="nome@email.com"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Senha Provisória</label>
                    <input
                      type="password"
                      required
                      placeholder="mínimo 6 caracteres"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center space-x-2 text-slate-500 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newUser.is_admin}
                        onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span>Privilégios de Administrador</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingUser(false)}
                    className="px-3 py-1.5 text-slate-500 text-xs hover:text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                  >
                    Registrar Conta
                  </button>
                </div>
              </form>
            )}

            {/* Users List */}
            <div className="border border-slate-100 rounded-xl overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-600">
                <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">ID do Usuário</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Criado Em</th>
                    <th className="px-4 py-3">Permissões</th>
                    <th className="px-4 py-3">Status da Conta</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400 italic">
                        Nenhum usuário correspondente encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-400">{user.id}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{user.email}</td>
                        <td className="px-4 py-3 text-slate-500">{new Date(user.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            user.is_admin ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {user.is_admin ? 'ADMIN' : 'CLIENTE'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleBlockUser(user.id, user.is_blocked)}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center space-x-1.5 border transition ${
                              user.is_blocked 
                                ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' 
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {user.is_blocked ? (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Bloqueado (Ativar)</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>Ativo (Bloquear)</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-slate-400 hover:text-red-600 p-1"
                            title="Deletar Usuário"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: DEVICES */}
        {/* ==================================================================== */}
        {activeTab === 'devices' && (
          <div className="flex flex-col space-y-4 h-full">
            
            {/* Filter Search */}
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar por nome, chave ou fingerprint..."
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            {/* Devices table list */}
            <div className="border border-slate-100 rounded-xl overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-600">
                <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Dispositivo / Máquina</th>
                    <th className="px-4 py-3">Dono da Conta</th>
                    <th className="px-4 py-3">Chave Utilizada</th>
                    <th className="px-4 py-3">Fingerprint de Hardware</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Último Heartbeat</th>
                    <th className="px-4 py-3 text-right">Revogar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400 italic">
                        Nenhum dispositivo de extensão ativo conectado no momento.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((dev) => (
                      <tr key={dev.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{dev.device_name}</td>
                        <td className="px-4 py-3 text-slate-500">{dev.user_email}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-700">{dev.license_key}</td>
                        <td className="px-4 py-3 font-mono text-slate-400 text-[11px] truncate max-w-xs" title={dev.fingerprint}>
                          {dev.fingerprint}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            dev.is_online ? 'bg-emerald-100 text-emerald-800 animate-pulse' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {dev.is_online ? 'ONLINE' : 'STALE / OFF'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{new Date(dev.last_heartbeat).toLocaleTimeString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRevokeDevice(dev.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded text-[10px] font-semibold border border-red-200 transition"
                            title="Desconectar Máquina"
                          >
                            Revogar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: ASSETS & RELEASES */}
        {/* ==================================================================== */}
        {activeTab === 'assets' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            
            {/* Left Col: Extension Build Releases */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <FileUp className="w-4 h-4 text-indigo-600" />
                  <span>Versionamento de Builds (.zip)</span>
                </h3>
                
                <button
                  onClick={() => setIsCreatingRelease(!isCreatingRelease)}
                  className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold rounded-md shadow-sm"
                >
                  Registrar Nova Versão
                </button>
              </div>

              {/* Upload binary box */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
                <label className="block text-[11px] text-slate-500 font-bold uppercase">Upload Direto da Extensão (Servidor Cloud)</label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center hover:bg-slate-50 transition relative">
                  <input
                    type="file"
                    accept=".zip,.crx"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    disabled={isUploading}
                  />
                  <FileUp className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-600 mt-2 font-semibold">Arrastar arquivo ZIP ou clicar para buscar</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Formatos suportados: .zip, .crx (Tamanho max 50MB)</p>
                </div>

                {uploadFileForm && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between text-xs font-mono">
                    <span className="truncate max-w-[180px] font-semibold text-slate-700">{uploadFileForm.name}</span>
                    <div className="flex space-x-1.5">
                      <button 
                        onClick={() => setUploadFileForm(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        Limpar
                      </button>
                      <button
                        onClick={handleUploadFile}
                        disabled={isUploading}
                        className="bg-indigo-600 text-white font-sans px-2.5 py-0.5 rounded font-bold"
                      >
                        {isUploading ? 'Salvando...' : 'Salvar no Servidor'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Register Release Form */}
              {isCreatingRelease && (
                <form onSubmit={handleCreateRelease} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-sm text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 mb-1 font-semibold">Versão (ex: 1.0.1)</label>
                      <input
                        type="text"
                        required
                        placeholder="1.0.1"
                        value={newRelease.version}
                        onChange={(e) => setNewRelease({ ...newRelease, version: e.target.value })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1 font-semibold">Versão Mín. Navegador</label>
                      <input
                        type="text"
                        required
                        placeholder="100"
                        value={newRelease.min_chrome_version}
                        onChange={(e) => setNewRelease({ ...newRelease, min_chrome_version: e.target.value })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1 font-semibold">Caminho / URL de Download</label>
                    <input
                      type="text"
                      required
                      placeholder="/uploads/... ou link S3"
                      value={newRelease.download_url}
                      onChange={(e) => setNewRelease({ ...newRelease, download_url: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1 font-semibold">Notas de Lançamento</label>
                    <textarea
                      rows={2}
                      placeholder="Correções de bugs e otimizações..."
                      value={newRelease.notes}
                      onChange={(e) => setNewRelease({ ...newRelease, notes: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingRelease(false)}
                      className="text-slate-400"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded font-semibold"
                    >
                      Registrar Lançamento
                    </button>
                  </div>
                </form>
              )}

              {/* Releases List */}
              <div className="space-y-2 overflow-y-auto max-h-[300px]">
                <h4 className="text-[10px] text-slate-400 uppercase font-semibold">Lançamentos Registrados</h4>
                {releases.length === 0 ? (
                  <p className="text-xs italic text-slate-400">Nenhum lançamento registrado ainda.</p>
                ) : (
                  releases.map((rel) => (
                    <div key={rel.id} className="bg-white border border-slate-100 p-3 rounded-lg shadow-sm flex items-start justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                          <span className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[11px]">v{rel.version}</span>
                          <span className="text-[10px] text-slate-400 font-normal">Min Chrome: v{rel.min_chrome_version}</span>
                        </div>
                        <p className="text-slate-600 text-[11px] mt-1.5 font-medium">{rel.notes}</p>
                        <div className="font-mono text-[9px] text-slate-400 mt-1 truncate max-w-[240px]">
                          Caminho: {rel.download_url}
                        </div>
                      </div>
                      
                      <a
                        href={rel.download_url}
                        download
                        className="p-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 border border-slate-100 rounded-md shadow-sm shrink-0"
                        title="Download Build"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Col: Send Push Notifications */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <Send className="w-4 h-4 text-indigo-600" />
                  <span>Mensagem Push Instantânea</span>
                </h3>

                <button
                  onClick={() => setIsSendingNotif(!isSendingNotif)}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold rounded-md shadow-sm"
                >
                  Criar Push
                </button>
              </div>

              {/* Push Notif creator */}
              {isSendingNotif && (
                <form onSubmit={handleSendNotification} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-sm text-xs">
                  <div>
                    <label className="block text-slate-500 mb-1 font-semibold">Alvo de Envio (Target)</label>
                    <select
                      value={newNotification.target_license_id}
                      onChange={(e) => setNewNotification({ ...newNotification, target_license_id: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <option value="all">Todos os Dispositivos (Broadcast Global)</option>
                      {licenses.map(lic => (
                        <option key={lic.id} value={lic.id}>
                          Chave: {lic.key} ({lic.user_email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1 font-semibold">Título da Notificação</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Atualização Urgente Disponível!"
                      value={newNotification.title}
                      onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1 font-semibold">Mensagem Push (Exibida no Toast do Chrome)</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Digite o texto de aviso para os usuários..."
                      value={newNotification.message}
                      onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsSendingNotif(false)}
                      className="text-slate-400"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="bg-indigo-600 text-white px-3.5 py-1.5 rounded font-semibold"
                    >
                      Disparar Push Alert
                    </button>
                  </div>
                </form>
              )}

              {/* Notifications stream history */}
              <div className="space-y-2 overflow-y-auto grow max-h-[360px]">
                <h4 className="text-[10px] text-slate-400 uppercase font-semibold">Alertas Enviados Anteriormente</h4>
                {files.length === 0 && releases.length === 0 ? (
                  <p className="text-xs italic text-slate-400">Nenhum alerta enviado.</p>
                ) : (
                  // Display standard log of past notifications
                  // Since we seed notifications, this is always populated
                  stats.total_users > 0 && (
                    <div className="space-y-2">
                      <div className="bg-white border border-slate-100 p-3 rounded-lg shadow-sm text-xs">
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold uppercase">
                          <span>Target: Global (Broadcast)</span>
                          <span>Ativo</span>
                        </div>
                        <h5 className="font-bold text-slate-800 mt-1">Bem-vindo à Versão Profissional!</h5>
                        <p className="text-slate-600 text-[11px] mt-0.5">Obrigado por adquirir o Construtor Sem Limites. Acesse seu simulador e ative as chaves agora mesmo.</p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 5: AUDIT LOGS */}
        {/* ==================================================================== */}
        {activeTab === 'logs' && (
          <div className="flex flex-col space-y-4 h-full">
            
            {/* Filter */}
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Pesquisar por ação, email ou detalhes..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            {/* List */}
            <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50">
              <div className="bg-slate-100 px-4 py-2 flex items-center justify-between text-[10px] text-slate-600 font-mono font-bold border-b border-slate-200">
                <span>Fluxo de Telemetria Audit.log</span>
                <span>Últimas 500 Transações</span>
              </div>

              <div className="p-2 max-h-[480px] overflow-y-auto text-[11px] font-mono space-y-1.5 scrollbar-thin">
                {filteredLogs.length === 0 ? (
                  <p className="p-4 text-center italic text-slate-400 bg-white rounded-lg">
                    Nenhum log correspondente encontrado no fluxo.
                  </p>
                ) : (
                  filteredLogs.map((log) => (
                    <div key={log.id} className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm leading-relaxed flex flex-col md:flex-row md:items-start justify-between gap-1">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            log.action.startsWith('ADMIN') ? 'bg-purple-100 text-purple-800' :
                            log.action.startsWith('LICENSE') ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {log.action}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">{log.email || 'guest-ip'}</span>
                        </div>
                        <div className="text-slate-600 mt-1.5 text-xs font-sans leading-snug">{log.details}</div>
                      </div>

                      <div className="text-right shrink-0 mt-1 md:mt-0">
                        <div className="text-[9px] text-slate-400 font-bold">{new Date(log.timestamp).toLocaleString()}</div>
                        {log.ip_address && (
                          <div className="text-[9px] text-slate-300 font-semibold font-mono">IP: {log.ip_address}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default AdminPanel;
