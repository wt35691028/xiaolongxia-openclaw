/* eslint-disable max-lines-per-function, complexity */
import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Code2,
  CreditCard,
  Database,
  DollarSign,
  Layers,
  Loader2,
  Server,
  Shield,
  UserCog,
} from 'lucide-react';
import { useTranslation } from '../services/i18n';
import { supabase } from '../services/supabaseClient';
import { settingsService, DEFAULT_PAYROLL_STANDARDS } from '../services/split/settings/SettingsService';
import {
  AppSettings,
  DbHotel,
  ProfileSectionConfig,
  Role,
  XpSettings,
} from '../types';
import { useCurrentUser } from '../hooks/useCurrentUser';
import DeveloperConsole from './DeveloperConsole';
import SettingsPayroll from './SettingsPayroll';
import SettingsXpSystem from './SettingsXpSystem';
import { TaskTypeManager } from './TaskTypeManager';
import {
  AccountSection,
  AISettings,
  DebugSection,
  DistributorCommissionPanel,
  GeneralSettings,
  MobileMenuConfigPanel,
  ModuleToggles,
  NotificationSettings,
  ProfileConfigPanel,
  SubscriptionSection,
  TaskCreationPanel,
} from './settings';

const SettingsPage: React.FC = () => {
  const { currentUser, loading: userLoading } = useCurrentUser();
  const { t, language, setLanguage } = useTranslation();
  const [activeTab, setActiveTab] = useState('api');

  // 账号设置相关状态
  const [editedName, setEditedName] = useState('');
  const [editedColor, setEditedColor] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountSaveSuccess, setAccountSaveSuccess] = useState(false);
  const [accountErrorMsg, setAccountErrorMsg] = useState('');
  const [authUser, setAuthUser] = useState<any>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [config, setConfig] = useState<AppSettings>({} as AppSettings);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [hotels, setHotels] = useState<DbHotel[]>([]);
  const [activeTypeCategory, setActiveTypeCategory] = useState<'room' | 'public'>('room');

  // 初始化账号表单数据
  useEffect(() => {
    if (currentUser) {
      setEditedName(currentUser.name || '');
      setEditedColor(currentUser.avatar_color || 'bg-indigo-500');
    }
  }, [currentUser]);

  // 加载Auth用户数据
  useEffect(() => {
    const loadAuthUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setAuthUser(user);
    };
    loadAuthUser();
  }, []);

  // 加载初始设置
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('app_settings').select('config').eq('id', 'main').single();
      if (data?.config) {
        const dbConfig = data.config as AppSettings;
        // 深合并 payrollStandards：以 DEFAULT 为底，用数据库值覆盖（避免角色缺失）
        const mergedPayrollStandards = {
          ...DEFAULT_PAYROLL_STANDARDS,
          ...(dbConfig.payrollStandards || {}),
        };
        setConfig({ ...dbConfig, payrollStandards: mergedPayrollStandards });
      }
    };
    fetchSettings();
  }, []);

  // 加载酒店数据（使用 fallback：frontend_hotels 不存在时查 frontend_hotels_view，避免 404）
  useEffect(() => {
    const fetchHotels = async () => {
      const { fetchFrontendHotels } = await import('../services/frontendHotelsFallback');
      const { data } = await fetchFrontendHotels(supabase);
      if (data) setHotels(data as DbHotel[]);
    };
    fetchHotels();
  }, []);

  const handleAccountSave = async () => {
    if (!currentUser) return;

    setAccountSaving(true);
    setAccountErrorMsg('');
    setAccountSaveSuccess(false);

    try {
      const { error } = await supabase
        .from('staff')
        .update({ name: editedName, avatar_color: editedColor })
        .eq('id', currentUser.id);

      if (error) throw error;
      window.location.reload();
      setAccountSaveSuccess(true);
      setTimeout(() => setAccountSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save account settings:', err);
      setAccountErrorMsg(err.message || '保存失败');
    } finally {
      setAccountSaving(false);
    }
  };

  const accountHasChanges =
    currentUser && (editedName !== currentUser.name || editedColor !== currentUser.avatar_color);

  const createdDate = authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    : '未知';

  const availableColors = [
    { name: '靛蓝', value: 'bg-indigo-500' },
    { name: '蓝色', value: 'bg-blue-500' },
    { name: '紫色', value: 'bg-purple-500' },
    { name: '粉红', value: 'bg-pink-500' },
    { name: '玫瑰', value: 'bg-rose-500' },
    { name: '橙色', value: 'bg-orange-500' },
    { name: '琥珀', value: 'bg-amber-500' },
    { name: '翡翠', value: 'bg-emerald-500' },
    { name: '青色', value: 'bg-cyan-500' },
    { name: '石板', value: 'bg-slate-500' },
  ];

  const updateSetting = (newSettings: Partial<AppSettings>) => {
    setSaveStatus('saving');
    const merged = { ...config, ...newSettings };
    setConfig(merged);
    setTimeout(async () => {
      try {
        await settingsService.saveSettings(merged);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to save settings:', err);
        setSaveStatus('idle'); // 或者 error 状态
      }
    }, 300);
  };

  const updateXpSetting = (newXpSettings: Partial<XpSettings>) => {
    const updatedSettings = { ...config.xpSettings, ...newXpSettings };
    updateSetting({ xpSettings: updatedSettings });
  };

  const updateProfileConfig = (role: string, updates: Partial<ProfileSectionConfig>) => {
    const currentProfileConfig = config.profileConfig || {};
    const roleConfig = currentProfileConfig[role] || {
      showXp: true,
      showStats: true,
      showIncome: true,
      showAwards: true,
      showSystemSettings: true,
    };

    const updatedProfileConfig = {
      ...currentProfileConfig,
      [role]: { ...roleConfig, ...updates },
    };
    updateSetting({ profileConfig: updatedProfileConfig as Record<string, ProfileSectionConfig> });
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value as 'zh-CN' | 'en-US' | 'ja-JP';
    setLanguage(newLang);
    updateSetting({ language: newLang });
  };

  const getActiveTaskTypes = () => {
    const types = config.task_types;
    if (Array.isArray(types)) {
      return activeTypeCategory === 'room' ? types : [];
    }
    return types?.[activeTypeCategory] || [];
  };

  const handleSaveTaskTypes = (newTypes: string[]) => {
    const currentTypes = config.task_types || { room: [], public: [] };
    let updatedTypes: string[] | { room: string[]; public: string[] };

    if (Array.isArray(currentTypes)) {
      updatedTypes = {
        room: activeTypeCategory === 'room' ? newTypes : currentTypes,
        public: activeTypeCategory === 'public' ? newTypes : [],
      };
    } else {
      updatedTypes = {
        ...currentTypes,
        [activeTypeCategory]: newTypes,
      };
    }
    updateSetting({ task_types: updatedTypes });
  };

  const allTabs = [
    { id: 'account', label: '账号设置', icon: UserCog, roles: [] },
    { id: 'api', label: t('settings.tab.api'), icon: Server, roles: [Role.ADMIN, Role.SUPER_ADMIN, Role.OWNER, Role.CHAIRMAN] },
    { id: 'general', label: t('settings.tab.general'), icon: Building2, roles: [Role.MANAGER, Role.GENERAL_MANAGER, Role.OWNER, Role.ADMIN, Role.SUPER_ADMIN, Role.CHAIRMAN] },
    { id: 'modules', label: '模块管理', icon: Layers, roles: [Role.ADMIN, Role.SUPER_ADMIN, Role.OWNER, Role.CHAIRMAN] },
    { id: 'tasks', label: '任务配置', icon: ClipboardList, roles: [Role.MANAGER, Role.GENERAL_MANAGER, Role.OWNER, Role.ADMIN, Role.SUPER_ADMIN, Role.CHAIRMAN] },
    { id: 'payroll', label: '薪酬标准', icon: DollarSign, roles: [Role.OWNER, Role.ADMIN, Role.SUPER_ADMIN, Role.CHAIRMAN, Role.GENERAL_MANAGER] },
    { id: 'xp', label: '经验值系统', icon: Award, roles: [Role.MANAGER, Role.GENERAL_MANAGER, Role.OWNER, Role.ADMIN, Role.SUPER_ADMIN, Role.CHAIRMAN] },
    { id: 'subscription', label: t('settings.tab.sub'), icon: CreditCard, roles: [Role.OWNER, Role.SUPER_ADMIN, Role.CHAIRMAN] },
    { id: 'developer', label: '开发者中心', icon: Code2, roles: [Role.ADMIN, Role.SUPER_ADMIN, Role.OWNER, Role.CHAIRMAN] },
    { id: 'debug', label: t('settings.tab.debug'), icon: Database, roles: [Role.ADMIN, Role.SUPER_ADMIN, Role.OWNER, Role.CHAIRMAN] },
    { id: 'notifications', label: '通知偏好', icon: Bell, roles: [] },
    { id: 'security', label: '安全隐私', icon: Shield, roles: [] },
  ];

  const Tabs = allTabs.filter((tab) => {
    if (userLoading) return true;
    if (!currentUser) return tab.roles.length === 0;
    if (tab.roles.length === 0) return true;
    return tab.roles.includes(currentUser.role as Role);
  });

  useEffect(() => {
    if (!userLoading && Tabs.length > 0 && !Tabs.find((t) => t.id === activeTab)) {
      setActiveTab(Tabs[0].id);
    }
  }, [userLoading, currentUser, activeTab, Tabs]);

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
          <p className="text-sm text-slate-600">加载用户信息...</p>
        </div>
      </div>
    );
  }

  if (Tabs.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center max-w-md p-6">
          <AlertCircle size={48} className="text-rose-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">无法加载设置页面</h3>
          <p className="text-sm text-slate-600 mb-4">当前用户信息未正确加载,或您没有权限访问任何设置选项。</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">刷新页面</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
            <Server size={16} />
          </div>
          <h2 className="text-sm font-bold text-slate-900">{t('settings.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && <span className="text-[10px] text-indigo-500 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> 自动保存中...</span>}
          {saveStatus === 'saved' && <span className="text-[10px] text-emerald-600 flex items-center gap-1 animate-in fade-in"><CheckCircle2 size={10} /> 已保存</span>}
        </div>
      </div>
      {successMsg && <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-4 py-2 rounded shadow-lg animate-in slide-in-from-top-2 fade-in z-50 flex items-center gap-2 pointer-events-none"><CheckCircle2 size={14} /> {successMsg}</div>}
      {errorMsg && <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-xs px-4 py-2 rounded shadow-lg animate-in slide-in-from-top-2 fade-in z-50 flex items-center gap-2 pointer-events-none"><AlertCircle size={14} /> {errorMsg}</div>}

      <div className="md:hidden bg-white border-b border-slate-200 overflow-x-auto flex px-2 scrollbar-hide shrink-0">
        {Tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex w-48 bg-white border-r border-slate-200 py-4 flex-col gap-1 px-2 shrink-0">
          {Tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === tab.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}>
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <div className="max-w-4xl mx-auto pb-10">
            {activeTab === 'account' && (
              <AccountSection
                currentUser={currentUser}
                editedName={editedName}
                editedColor={editedColor}
                accountSaving={accountSaving}
                accountSaveSuccess={accountSaveSuccess}
                accountErrorMsg={accountErrorMsg}
                authUser={authUser}
                createdDate={createdDate}
                accountHasChanges={accountHasChanges}
                availableColors={availableColors}
                onEditedNameChange={setEditedName}
                onEditedColorChange={setEditedColor}
                onAccountSave={handleAccountSave}
              />
            )}

            {activeTab === 'developer' && <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-10rem)]"><DeveloperConsole /></div>}

            {activeTab === 'modules' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Layers size={14} /> 功能模块配置</h3>
                  <p className="text-xs text-slate-500">自定义显示的菜单与功能</p>
                </div>
                <ModuleToggles modules={config.modules} onChange={(newModules) => updateSetting({ modules: newModules })} />
                <div className="p-4 bg-blue-50 text-blue-700 text-xs rounded-lg flex items-center gap-2 border border-blue-100">
                  <AlertCircle size={14} /> 禁用模块将隐藏对应的左侧菜单入口和移动端功能。核心数据将被保留。
                </div>
                <DistributorCommissionPanel config={config} updateSetting={updateSetting} />
                <MobileMenuConfigPanel modules={config.modules} onUpdate={(newModules) => updateSetting({ modules: newModules })} />
                <ProfileConfigPanel config={config.profileConfig} onUpdate={updateProfileConfig} />
              </div>
            )}

            {activeTab === 'payroll' && <SettingsPayroll config={config} updateSetting={updateSetting} hotels={hotels} />}

            {activeTab === 'general' && (
              <GeneralSettings
                config={config}
                updateSetting={updateSetting}
                setConfig={setConfig}
                setSuccessMsg={setSuccessMsg}
                language={language}
                handleLanguageChange={handleLanguageChange}
              />
            )}

            {activeTab === 'tasks' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><ClipboardList size={14} className="text-indigo-600" /> 任务类型配置</h3>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                      <button onClick={() => setActiveTypeCategory('room')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTypeCategory === 'room' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>客房任务</button>
                      <button onClick={() => setActiveTypeCategory('public')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTypeCategory === 'public' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>公区任务</button>
                    </div>
                  </div>
                  <TaskTypeManager availableTypes={getActiveTaskTypes()} onSaveTypes={handleSaveTaskTypes} variant="manager" />
                </div>
                <TaskCreationPanel config={config} updateSetting={updateSetting} />
              </div>
            )}

            {activeTab === 'debug' && <DebugSection config={config} updateSetting={updateSetting} setSuccessMsg={setSuccessMsg} setErrorMsg={setErrorMsg} />}

            {activeTab === 'api' && <AISettings config={config} updateSetting={updateSetting} setConfig={setConfig} setSuccessMsg={setSuccessMsg} />}

            {activeTab === 'xp' && <SettingsXpSystem config={config} updateXpSetting={updateXpSetting} updateSetting={updateSetting} />}

            {activeTab === 'subscription' && <SubscriptionSection config={config} updateSetting={updateSetting} setSuccessMsg={setSuccessMsg} />}

            {activeTab === 'notifications' && <NotificationSettings config={config} updateSetting={updateSetting} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
