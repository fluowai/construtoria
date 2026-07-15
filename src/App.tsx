import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, UserPlus, KeyRound, LogIn, Crown, Download, HelpCircle, 
  Smartphone, Database, AlertCircle, Sparkles, BookOpen 
} from 'lucide-react';
import { ExtensionSimulator } from './components/ExtensionSimulator.js';
import { AdminPanel } from './components/AdminPanel.js';

interface UserSession {
  id: string;
  email: string;
  is_admin: boolean;
}

export default function App() {
  // Session States
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  // Auth form states
  const [isLoginView, setIsLoginView] = useState(true);
  const [authEmail, setAuthEmail] = useState('admin@admin.com');
  const [authPassword, setAuthPassword] = useState('admin123');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Client Portal States (for non-admin users logging in)
  const [myLicenses, setMyLicenses] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);

  // Telemetry refresh trigger (triggers re-render on changes)
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Load session from localStorage on startup
  useEffect(() => {
    const savedUser = localStorage.getItem('elm_user');
    const savedToken = localStorage.getItem('elm_token');
    const savedRefresh = localStorage.getItem('elm_refresh_token');

    if (savedUser && savedToken && savedRefresh) {
      try {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
        setRefreshToken(savedRefresh);
      } catch (e) {
        localStorage.clear();
      }
    }
  }, []);

  // Sync client licenses when client is logged in
  useEffect(() => {
    if (user && token && !user.is_admin) {
      fetchMyLicenses();
      fetchReleases();
    }
  }, [user, token, refreshTrigger]);

  const fetchMyLicenses = async () => {
    try {
      const res = await fetch('/api/license/mine', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setMyLicenses(await res.json());
      }
    } catch (e) {
      console.error('Error fetching client licenses:', e);
    }
  };

  const fetchReleases = async () => {
    try {
      const res = await fetch('/api/extension/check-version?version=0.0.0'); // triggers general query
      const data = await res.json();
      if (res.ok && data.latest_version) {
        setReleases([data]);
      }
    } catch (e) {
      console.error('Error fetching extension releases:', e);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const endpoint = isLoginView ? '/api/auth/login' : '/api/auth/signup';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.message || 'Erro durante a autenticação.');
        return;
      }

      // Success
      setUser(data.user);
      setToken(data.access_token);
      setRefreshToken(data.refresh_token);

      localStorage.setItem('elm_user', JSON.stringify(data.user));
      localStorage.setItem('elm_token', data.access_token);
      localStorage.setItem('elm_refresh_token', data.refresh_token);

      setAuthSuccess(isLoginView ? 'Login bem-sucedido!' : 'Cadastro concluído com sucesso!');
      
      // Auto-fill Simulator credentials with the client e-mail if signing up
      if (!isLoginView) {
        const simEmailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
        if (simEmailInput) simEmailInput.value = authEmail;
      }
    } catch (err: any) {
      setAuthError('Falha ao conectar ao servidor. Verifique sua rede.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem('elm_user');
    localStorage.removeItem('elm_token');
    localStorage.removeItem('elm_refresh_token');
    setMyLicenses([]);
    setReleases([]);
    setAuthPassword('');
  };

  const handleRefreshTrigger = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 text-slate-800 px-6 py-4 shadow-sm shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md shadow-indigo-600/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-md font-extrabold tracking-tight text-slate-900">
                Construtor <span className="text-indigo-600">Sem Limites</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-medium">Plataforma de Gestão de Licenciamento & APIs</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Quick credentials help badge */}
            {!user && (
              <div className="hidden md:flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 text-xs">
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-slate-600 font-medium">Admin para Testes:</span>
                <span className="font-mono bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] text-indigo-700">admin@admin.com</span>
                <span className="font-mono bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] text-indigo-700">admin123</span>
              </div>
            )}

            {user && (
              <div className="flex items-center space-x-3 text-xs bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
                <span className={`w-2 h-2 rounded-full ${user.is_admin ? 'bg-purple-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></span>
                <span className="font-medium text-slate-700">{user.email}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                  {user.is_admin ? 'ADMIN' : 'CLIENTE'}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="grow max-w-[1600px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 overflow-hidden">
        
        {/* Left Side: Web Dashboards (8 cols) */}
        <div className="xl:col-span-8 flex flex-col h-full overflow-hidden min-h-[500px]">
          
          {/* 1. GUEST / OUTSIDE VIEW: Auth form */}
          {!user && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-6 md:p-8 flex flex-col justify-center h-full max-w-2xl mx-auto w-full">
              <div className="text-center pb-6">
                <div className="bg-indigo-50 p-3 rounded-full inline-block text-indigo-600 mb-3">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Console Administrativo</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Gerencie licenças de clientes, bloqueie acessos, envie notificações em tempo real e verifique telemetria da sua extensão.
                </p>
              </div>

              {authError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-800 p-3.5 rounded-xl text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{authError}</span>
                </div>
              )}

              {authSuccess && (
                <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-xs">
                  {authSuccess}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Endereço de E-mail</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="email@exemplo.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Senha de Acesso</label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Sua senha secreta"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/25 transition flex items-center justify-center space-x-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isLoginView ? 'Entrar no Painel' : 'Cadastrar Minha Conta'}</span>
                </button>
              </form>

              <div className="border-t border-slate-100 mt-6 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsLoginView(!isLoginView);
                    setAuthError(null);
                    // Autofill for user signup or admin login helper
                    if (isLoginView) {
                      setAuthEmail('novo_cliente@example.com');
                      setAuthPassword('cliente123');
                    } else {
                      setAuthEmail('admin@admin.com');
                      setAuthPassword('admin123');
                    }
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-bold text-xs"
                >
                  {isLoginView ? 'Não possui uma conta? Cadastre-se aqui' : 'Já possui conta? Faça o Login'}
                </button>
              </div>

              {/* Quick instructions box */}
              <div className="mt-6 bg-indigo-50 border border-indigo-100/60 p-4 rounded-xl text-xs text-indigo-900 space-y-1.5">
                <h4 className="font-bold flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Instruções Rápidas de Teste:</span>
                </h4>
                <p className="text-slate-600 leading-normal">
                  1. Entre como <b>admin@admin.com</b> (senha: <b>admin123</b>) para gerenciar o painel administrativo geral.
                </p>
                <p className="text-slate-600 leading-normal">
                  2. Use o <b>simulador do software</b> à direita para ativar chaves de licença (ex: <b>LIC-TRIAL-8888-8888</b>) em tempo real.
                </p>
                <p className="text-slate-600 leading-normal">
                  3. Suspenda ou delete chaves no console admin e veja o <b>Construtor Sem Limites</b> reportar imediatamente o bloqueio de segurança!
                </p>
              </div>
            </div>
          )}

          {/* 2. AUTHENTICATED ADMIN PANEL */}
          {user && token && user.is_admin && (
            <AdminPanel token={token} onLogout={handleLogout} refreshTrigger={refreshTrigger} />
          )}

          {/* 3. AUTHENTICATED CLIENT PORTAL (My Licenses, download assets) */}
          {user && token && !user.is_admin && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-5 md:p-6 flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Área do Cliente</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Visualize suas licenças de uso e faça download de builds estáveis</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  Sair da Conta
                </button>
              </div>

              {/* Licenses and extension releases */}
              <div className="grow overflow-y-auto space-y-6 pt-5">
                
                {/* Licenses Owned list */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <Database className="w-4 h-4 text-indigo-600" />
                    <span>Minhas Chaves de Licença Ativas</span>
                  </h3>

                  {myLicenses.length === 0 ? (
                    <div className="bg-slate-50 p-6 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                      Você ainda não comprou ou resgatou chaves de licença.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {myLicenses.map((lic) => (
                        <div key={lic.id} className="border border-slate-100 bg-slate-50 p-4 rounded-xl shadow-sm space-y-2 relative overflow-hidden">
                          {/* Key indicator */}
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CHAVE DE LICENÇA</span>
                              <div className="font-mono font-extrabold text-sm text-slate-800 mt-0.5">{lic.key}</div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                              lic.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {lic.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1 text-[11px] pt-1.5 border-t border-slate-200/50">
                            <div>
                              <span className="text-slate-400 block">Tipo:</span>
                              <span className="font-bold text-slate-700 uppercase">{lic.type}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Expiração:</span>
                              <span className="font-bold text-slate-700">
                                {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Nenhuma (Lifetime)'}
                              </span>
                            </div>
                          </div>

                          {/* Devices connected stats */}
                          <div className="text-[10px] pt-1 border-t border-slate-200/50 text-slate-500 flex justify-between items-center">
                            <span>Dispositivos: {lic.devices?.length || 0} de {lic.max_devices} slots</span>
                          </div>

                          {/* Render sub devices */}
                          {lic.devices && lic.devices.length > 0 && (
                            <div className="mt-2 space-y-1 bg-white p-2 rounded-lg border border-slate-100">
                              <span className="text-[9px] text-slate-400 font-bold block uppercase mb-1">Máquinas Ativas:</span>
                              {lic.devices.map((dev: any) => (
                                <div key={dev.id} className="flex justify-between items-center text-[10px] font-mono border-b border-slate-50 last:border-b-0 pb-1 last:pb-0">
                                  <span className="text-slate-700 truncate max-w-[150px] font-semibold">{dev.device_name}</span>
                                  <span className={`px-1 py-0.2 rounded text-[8px] font-bold ${dev.is_online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                    {dev.is_online ? 'ONLINE' : 'OFFLINE'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Download build assets */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>Download e Manual de Instalação</span>
                  </h3>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs leading-relaxed text-slate-600">
                    <p>
                      Para utilizar o software <b>Construtor Sem Limites</b> em seu navegador de forma segura, siga o passo a passo a seguir:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 mt-1 text-slate-500">
                      <li>Baixe a build estável no botão abaixo (.zip).</li>
                      <li>Extraia o conteúdo do arquivo compactado em uma pasta local do seu computador.</li>
                      <li>Abra o navegador e acesse <code>chrome://extensions/</code>.</li>
                      <li>Ative o <b>Modo do Desenvolvedor</b> no canto superior direito.</li>
                      <li>Clique em <b>Carregar sem Compactação</b> e selecione a pasta que você extraiu.</li>
                    </ol>

                    {releases.length > 0 ? (
                      <div className="pt-2">
                        <a
                          href={releases[0].download_url}
                          download
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold inline-flex items-center space-x-2 transition shadow"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download Construtor Sem Limites (v{releases[0].latest_version})</span>
                        </a>
                      </div>
                    ) : (
                      <div className="p-3 bg-white border border-slate-100 rounded-lg text-[11px] text-slate-400 italic">
                        Nenhuma build de arquivo foi carregada pelo administrador ainda.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Chrome Extension Simulator Sandbox (4 cols) */}
        <div className="xl:col-span-4 flex flex-col h-full overflow-hidden">
          <ExtensionSimulator onActivityTriggered={handleRefreshTrigger} />
        </div>

      </main>

      {/* Footer System Credits */}
      <footer className="bg-white border-t border-slate-250 text-slate-400 py-3 px-6 text-center text-[10px] shrink-0 font-mono">
        Construtor Sem Limites | Painel de Licenciamento & APIs Integradas | Porta Local do Servidor: 3000
      </footer>

    </div>
  );
}
