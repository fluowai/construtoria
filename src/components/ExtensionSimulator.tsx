import React, { useState, useEffect, useRef } from 'react';
import { Shield, Zap, RefreshCw, Radio, Bell, Download, Terminal, Smartphone, HelpCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface ConsoleLog {
  type: 'info' | 'success' | 'error' | 'outgoing' | 'incoming';
  text: string;
  timestamp: string;
}

interface ExtensionSimulatorProps {
  onActivityTriggered: () => void; // Atualiza as métricas do admin quando houver ação
}

export function ExtensionSimulator({ onActivityTriggered }: ExtensionSimulatorProps) {
  // Estados do Cliente
  const [email, setEmail] = useState('user@user.com');
  const [licenseKey, setLicenseKey] = useState('LIC-TRIAL-8888-8888');
  const [fingerprint, setFingerprint] = useState('chrome-ext-fingerprint-macbook-pro');
  const [deviceName, setDeviceName] = useState('Meu Macbook Pro');
  
  const [isActivated, setIsActivated] = useState(false);
  const [licenseDetails, setLicenseDetails] = useState<any>(null);
  const [heartbeatActive, setHeartbeatActive] = useState(false);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState<string | null>(null);
  const [onlineDevicesCount, setOnlineDevicesCount] = useState<number>(0);
  
  const [pushNotification, setPushNotification] = useState<any>(null);
  const [version, setVersion] = useState('1.0.0');
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([
    { type: 'info', text: 'Extensão Construtor Sem Limites inicializada (background.js).', timestamp: new Date().toLocaleTimeString() },
    { type: 'info', text: 'Aguardando ativação de licença do usuário...', timestamp: new Date().toLocaleTimeString() }
  ]);

  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = (type: ConsoleLog['type'], text: string) => {
    setConsoleLogs(prev => [
      { type, text, timestamp: new Date().toLocaleTimeString() },
      ...prev.slice(0, 49) // Mantém os últimos 50 logs
    ]);
  };

  // Loop automático do heartbeat
  useEffect(() => {
    if (heartbeatActive) {
      addLog('info', 'Iniciou loop automático de sincronização (heartbeat a cada 15s).');
      // Primeiro heartbeat imediato
      triggerHeartbeat();

      heartbeatTimerRef.current = setInterval(() => {
        triggerHeartbeat();
      }, 15000); 
    } else {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        addLog('info', 'Sincronização automática interrompida.');
      }
    }

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [heartbeatActive, licenseKey, fingerprint]);

  const triggerActivate = async () => {
    addLog('outgoing', `POST /api/license/activate\nCorpo da Requisição: ${JSON.stringify({ email, license_key: licenseKey, fingerprint, device_name: deviceName }, null, 2)}`);
    
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          license_key: licenseKey,
          fingerprint,
          device_name: deviceName
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        addLog('incoming', `Resposta (200 OK):\n${JSON.stringify(data, null, 2)}`);
        setIsActivated(true);
        setLicenseDetails(data.license);
        addLog('success', `Licença ativada com sucesso! Tipo: ${data.license.type.toUpperCase()}. Limite de máquinas: ${data.license.max_devices}`);
        onActivityTriggered();
      } else {
        addLog('error', `Falha na Ativação (${res.status}):\n${data.message || 'Erro desconhecido'}`);
        setIsActivated(false);
        setLicenseDetails(null);
        setHeartbeatActive(false);
      }
    } catch (err: any) {
      addLog('error', `Erro de Rede: ${err.message}`);
    }
  };

  const triggerValidate = async () => {
    addLog('outgoing', `POST /api/license/validate\nCorpo da Requisição: ${JSON.stringify({ license_key: licenseKey, fingerprint }, null, 2)}`);
    
    try {
      const res = await fetch('/api/license/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: licenseKey,
          fingerprint
        })
      });

      const data = await res.json();

      if (res.ok && data.valid) {
        addLog('incoming', `Resposta:\n${JSON.stringify(data, null, 2)}`);
        addLog('success', `A licença é VÁLIDA. Expiração: ${data.license.expires_at ? new Date(data.license.expires_at).toLocaleDateString() : 'Vitalícia'}`);
        setLicenseDetails(prev => ({ ...prev, ...data.license }));
      } else {
        addLog('error', `Licença INVÁLIDA:\n${data.reason || 'Não validada pelo servidor'}`);
        setIsActivated(false);
        setLicenseDetails(null);
        setHeartbeatActive(false);
      }
      onActivityTriggered();
    } catch (err: any) {
      addLog('error', `Erro de Validação: ${err.message}`);
    }
  };

  const triggerHeartbeat = async () => {
    addLog('outgoing', `POST /api/license/heartbeat\nCorpo da Requisição: ${JSON.stringify({ license_key: licenseKey, fingerprint }, null, 2)}`);
    
    try {
      const res = await fetch('/api/license/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: licenseKey,
          fingerprint
        })
      });

      const data = await res.json();

      if (res.ok && data.valid) {
        addLog('incoming', `Resposta:\n${JSON.stringify(data, null, 2)}`);
        setLastHeartbeatTime(new Date().toLocaleTimeString());
        setOnlineDevicesCount(data.devices_online);
        
        // Trata notificações push recebidas
        if (data.notifications && data.notifications.length > 0) {
          const latest = data.notifications[0];
          setPushNotification(latest);
          addLog('info', `📬 Nova notificação recebida do servidor: "${latest.title}"`);
        }
        
        addLog('success', `Heartbeat bem-sucedido. Máquinas online para esta licença: ${data.devices_online}`);
      } else {
        addLog('error', `Heartbeat falhou. A licença foi suspensa ou tornou-se inválida:\n${data.reason || 'Erro desconhecido'}`);
        setIsActivated(false);
        setLicenseDetails(null);
        setHeartbeatActive(false);
      }
      onActivityTriggered();
    } catch (err: any) {
      addLog('error', `Erro de Conexão no Heartbeat: ${err.message}`);
    }
  };

  const triggerVersionCheck = async () => {
    addLog('outgoing', `GET /api/extension/check-version?version=${version}`);
    
    try {
      const res = await fetch(`/api/extension/check-version?version=${version}`);
      const data = await res.json();

      if (res.ok) {
        addLog('incoming', `Resposta:\n${JSON.stringify(data, null, 2)}`);
        setUpdateInfo(data);
        if (data.update_available) {
          addLog('info', `🔥 Nova versão disponível! Versão v${data.latest_version} está pronta para download.`);
        } else {
          addLog('success', `O Construtor Sem Limites já está na versão mais recente (v${version})`);
        }
      } else {
        addLog('error', `Falha ao verificar atualizações de versão.`);
      }
      onActivityTriggered();
    } catch (err: any) {
      addLog('error', `Erro na verificação de versão: ${err.message}`);
    }
  };

  return (
    <div id="ext-simulator" className="bg-slate-50 border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full max-h-[820px]">
      {/* Barra superior estilo Chrome - Clássica Clara */}
      <div className="bg-slate-100 px-4 py-3 flex items-center justify-between text-slate-700 border-b border-slate-200 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <span className="w-3 h-3 bg-rose-400 rounded-full inline-block"></span>
            <span className="w-3 h-3 bg-amber-400 rounded-full inline-block"></span>
            <span className="w-3 h-3 bg-emerald-400 rounded-full inline-block"></span>
          </div>
          <span className="text-xs font-mono text-slate-500 pl-2 font-semibold">Simulador de Popup Chrome</span>
        </div>
        <div className="flex items-center space-x-1 bg-slate-200 px-2.5 py-1 rounded-md text-[11px] font-mono text-slate-700 font-bold">
          <Shield className="w-3.5 h-3.5 text-indigo-600" />
          <span>v{version}</span>
        </div>
      </div>

      {/* Janela de Conteúdo do Simulador */}
      <div className="p-4 flex flex-col space-y-4 overflow-y-auto grow">
        {/* Configurações de Máquina Simulada */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
            <span>Simulador de Hardware (Fingerprint)</span>
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[10px] text-slate-400 font-medium">Nome do Dispositivo</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 font-medium">Fingerprint Único</label>
              <input
                type="text"
                value={fingerprint}
                onChange={(e) => setFingerprint(e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Painel da Extensão em si */}
        <div className="bg-white p-4 rounded-xl border-2 border-indigo-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-base">
                C
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800">Construtor Sem Limites</h3>
                <p className="text-[10px] text-slate-400 font-medium">Licenciamento & Autenticação</p>
              </div>
            </div>
            
            {/* Indicador de Status */}
            <div className="flex items-center space-x-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isActivated ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <span className="text-[10px] font-bold uppercase text-slate-500">
                {isActivated ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>

          {/* Formulário de Ativação */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wide">E-mail do Usuário</label>
              <input
                type="email"
                placeholder="cliente@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wide">Chave de Licença</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  placeholder="LIC-XXXX-XXXX-XXXX"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  className="w-full pl-3 pr-12 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button 
                  onClick={() => setLicenseKey('LIC-TRIAL-8888-8888')}
                  className="absolute right-2 top-1.5 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                  title="Inserir chave de teste padrão"
                >
                  Teste
                </button>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={triggerActivate}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1 shadow-sm transition"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Ativar Chave</span>
              </button>

              <button
                disabled={!isActivated}
                onClick={triggerValidate}
                className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 shadow-sm transition disabled:opacity-50"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>Validar</span>
              </button>
            </div>
          </div>

          {/* Detalhes de Conectividade e Loop de Verificação */}
          {isActivated && licenseDetails && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex justify-between text-slate-700 text-[11px]">
                <span className="font-bold text-emerald-800">Licença Ativa:</span>
                <span className="font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
                  {licenseDetails.type}
                </span>
              </div>
              {licenseDetails.expires_at && (
                <div className="text-[10px] text-slate-500">
                  Expira em: <span className="font-semibold text-slate-700">{new Date(licenseDetails.expires_at).toLocaleString()}</span>
                </div>
              )}
              
              <div className="border-t border-emerald-100 pt-2 flex items-center justify-between">
                <div className="flex items-center space-x-1 text-[10px] text-slate-500 font-medium">
                  <Radio className={`w-3.5 h-3.5 ${heartbeatActive ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
                  <span>Sincronizar Loop (15s)</span>
                </div>
                <button
                  onClick={() => setHeartbeatActive(!heartbeatActive)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition ${heartbeatActive ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                >
                  {heartbeatActive ? 'Parar' : 'Sincronizar'}
                </button>
              </div>

              {lastHeartbeatTime && (
                <div className="text-[9px] text-slate-400 text-right font-mono">
                  Último ping: {lastHeartbeatTime} | Ativas online: {onlineDevicesCount}
                </div>
              )}
            </div>
          )}

          {/* Rodapé Interno do Popup */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <button
              onClick={triggerVersionCheck}
              className="text-slate-500 hover:text-slate-800 flex items-center space-x-1 font-semibold"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Verificar Versão</span>
            </button>

            {updateInfo?.update_available && (
              <a
                href={updateInfo.download_url}
                target="_blank"
                rel="noreferrer"
                className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[10px] font-semibold flex items-center space-x-1 hover:bg-amber-200"
              >
                <Download className="w-3 h-3" />
                <span>Instalar v{updateInfo.latest_version}</span>
              </a>
            )}
          </div>
        </div>

        {/* Notificações Push em Tempo Real */}
        {pushNotification && (
          <div className="bg-indigo-50 border-l-4 border-indigo-600 rounded-r-lg p-3 shadow-md text-xs relative animate-fade-in flex space-x-2 shrink-0">
            <Bell className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="grow">
              <h5 className="font-bold text-indigo-900">{pushNotification.title}</h5>
              <p className="text-slate-600 text-[11px] mt-0.5">{pushNotification.message}</p>
            </div>
            <button 
              onClick={() => setPushNotification(null)}
              className="text-slate-400 hover:text-slate-700 font-bold text-xs"
            >
              ×
            </button>
          </div>
        )}

        {/* Console de Rede do Simulador - Estilo Claro */}
        <div className="bg-slate-100 rounded-xl p-3 border border-slate-200 flex flex-col space-y-2 grow min-h-[160px] overflow-hidden">
          <div className="flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-200 pb-1.5 shrink-0">
            <span className="font-mono flex items-center space-x-1 font-bold">
              <Terminal className="w-3 h-3 text-indigo-600" />
              <span>Log de Atividade de Rede</span>
            </span>
            <button
              onClick={() => setConsoleLogs([])}
              className="hover:text-slate-800 font-bold font-mono"
            >
              Limpar
            </button>
          </div>

          <div className="grow overflow-y-auto text-[10px] font-mono space-y-1.5 scrollbar-thin">
            {consoleLogs.length === 0 ? (
              <p className="text-slate-400 italic">Nenhuma atividade de rede registrada até o momento.</p>
            ) : (
              consoleLogs.map((log, idx) => (
                <div key={idx} className="border-b border-slate-200/60 pb-1 last:border-0">
                  <div className="flex justify-between text-[8px] text-slate-400">
                    <span className={`font-bold uppercase ${
                      log.type === 'outgoing' ? 'text-amber-600' :
                      log.type === 'incoming' ? 'text-blue-600' :
                      log.type === 'success' ? 'text-emerald-600' :
                      log.type === 'error' ? 'text-rose-600' : 'text-slate-500'
                    }`}>
                      {log.type === 'outgoing' ? 'Requisição ➔' :
                       log.type === 'incoming' ? 'Resposta ➔' :
                       log.type === 'success' ? 'Sucesso ✓' :
                       log.type === 'error' ? 'Falha ✗' : 'Informação ℹ'}
                    </span>
                    <span>{log.timestamp}</span>
                  </div>
                  <pre className="text-slate-600 overflow-x-auto whitespace-pre-wrap leading-tight mt-0.5 font-mono text-[9px]">
                    {log.text}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExtensionSimulator;
