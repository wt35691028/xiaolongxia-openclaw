/* eslint-disable max-lines, max-lines-per-function, complexity */
/**
 * 1. **修改原因**：将角色选择下拉框中的角色名称从硬编码改为使用i18n翻译，支持多语言显示
 * 2. **解决问题**：解决角色名称在不同语言环境下显示不一致的问题，提升国际化支持
 * 3. **影响范围已评估**：仅影响ProfileEditorModal组件中的角色选择下拉框显示，不影响其他功能
 */
import {
  Banknote,
  Briefcase,
  Building2,
  Camera,
  CheckCircle,
  CreditCard,
  Globe,
  Hash,
  ImagePlus,
  Key,
  Loader2,
  Lock,
  MapPin,
  Mail,
  RefreshCw,
  Save,
  ScanBarcode,
  ShieldCheck,
  Siren,
  Smartphone,
  Trash2,
  AlertTriangle,
  User,
  X,
} from 'lucide-react';
// Award, Phone 已移除，未使用
import type React from 'react';
import { useEffect, useState } from 'react';
import { performOCR } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { type DbHotel, type DbStaff, Role } from '../types';
import SmartCameraOverlay, { type CameraStep } from './SmartCameraOverlay';
import { useTranslation } from '../services/i18n';
import { hotelService } from '../services/split/hotels/HotelService';
import { resolveAssignedHotelIds } from '../utils/parseHotelIds';

const DeleteButtonWithConfirmation: React.FC<{ onDelete: () => void }> = ({ onDelete }) => {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  if (step === 0) {
    return (
      <button
        onClick={() => setStep(1)}
        className="px-4 py-2.5 text-rose-600 hover:bg-rose-50 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
      >
        <Trash2 size={16} />
        删除员工
      </button>
    );
  }
  if (step === 1) {
    return (
      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
        <span className="text-xs font-bold text-slate-600">确定要删除吗？</span>
        <button
          onClick={() => setStep(2)}
          className="px-3 py-1.5 bg-rose-100 text-rose-700 rounded text-xs font-bold hover:bg-rose-200"
        >
          确定
        </button>
        <button
          onClick={() => setStep(0)}
          className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded text-xs font-bold hover:bg-slate-200"
        >
          取消
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
      <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
        <AlertTriangle size={12} />
        操作不可恢复！
      </span>
      <button
        onClick={onDelete}
        className="px-3 py-1.5 bg-rose-600 text-white rounded text-xs font-bold hover:bg-rose-700 shadow-sm shadow-rose-200"
      >
        确认删除
      </button>
      <button
        onClick={() => setStep(0)}
        className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded text-xs font-bold hover:bg-slate-200"
      >
        取消
      </button>
    </div>
  );
};

interface ProfileEditorModalProps {
  staff: DbStaff;
  isNew: boolean;
  mode: 'admin' | 'self' | 'assignment';
  availableHotels?: DbHotel[];
  onClose: () => void;
  onSave: (staff: DbStaff) => void;
  onDelete?: () => void;
}

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-blue-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-slate-500',
];

const NATIONALITIES = [
  { code: 'CN', label: '中国 (China)', idLabel: '身份证号' },
  { code: 'US', label: '美国 (USA)', idLabel: 'SSN / 护照号' },
  { code: 'JP', label: '日本 (Japan)', idLabel: '个人编号 / 在留卡' },
  { code: 'KR', label: '韩国 (Korea)', idLabel: '身份证 / 护照' },
  { code: 'OTHER', label: '其他 (Other)', idLabel: '证件号码' },
];

const ID_DOCUMENT_TYPES = [
  { value: 'id_card', label: '身份证' },
  { value: 'residence_card', label: '在留卡' },
  { value: 'drivers_license', label: '驾照' },
  { value: 'passport', label: '护照' },
];

const ProfileEditorModal: React.FC<ProfileEditorModalProps> = ({
  staff,
  isNew,
  mode,
  availableHotels,
  onClose,
  onSave,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<DbStaff>({
    ...staff,
    nationality: staff.nationality || 'CN',
  });
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'id_card' | 'bank_card'>('id_card');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [hotels, setHotels] = useState<DbHotel[]>(availableHotels || []);
  const [idDocumentType, setIdDocumentType] = useState('id_card');

  useEffect(() => {
    // assignment 模式必须展示全部酒店（让管理员为他人完整分配），
    // 不能用 availableHotels（它只包含当前管理员自己所属的酒店子集）
    if (mode !== 'assignment' && availableHotels && availableHotels.length > 0) {
      setHotels(availableHotels);
      return;
    }

    const fetchHotels = async () => {
      if (mode === 'assignment') {
        // assignment模式：直接查hotels表，获取所有active酒店（不受tenant/角色过滤）
        const { data } = await supabase
          .from('hotels')
          .select('id, name, status, tenant_id')
          .eq('status', 'active')
          .not('id', 'in', '(h_unmatched,__unassigned__)');
        if (data && data.length > 0) {
          setHotels(data as unknown as DbHotel[]);
        }
        return;
      }
      // 非assignment模式：走原来的frontend_hotels_view逻辑
      const { data } = await hotelService.getFrontendHotels();
      if (data) {
        const currentTenant = localStorage.getItem('hotelex_tenant_id') || 'demo_org';
        const isSuperAdmin = localStorage.getItem('hotelex_user_role') === 'Super Admin' || localStorage.getItem('hotelex_user_role') === 'Admin';
        const activeHotels = (data as DbHotel[]).filter((h) => {
          if (h.status === 'inactive' || h.status === 'disabled') return false;
          if (h.id === 'h_unmatched' || h.id === '__unassigned__') return false;
          if (!isSuperAdmin && h.tenant_id && h.tenant_id !== currentTenant) return false;
          return true;
        });
        setHotels(activeHotels);
      }
    };
    fetchHotels();
  }, []);

  // Initialize credentials for new users
  useEffect(() => {
    if (isNew && !formData.badge_id) {
      regenerateCredentials();
    }
  }, [isNew]);

  const regenerateCredentials = () => {
    const newBadge = Math.floor(10000 + Math.random() * 90000).toString(); // 5 digits
    const newCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits
    setFormData((prev) => ({
      ...prev,
      badge_id: newBadge,
      access_code: newCode,
    }));
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    try {
      await supabase.from('staff').delete().eq('id', formData.id);
      alert('员工已删除');
      onClose();
    } catch (e) {
      alert('删除失败，请稍后重试');
      console.error(e);
    }
  };

  const handleScan = (type: 'id_card' | 'bank_card') => {
    setCameraMode(type);
    setShowCamera(true);
  };

  // 选择图片上传（图库）
  const handleSelectImage = (type: 'id_card' | 'bank_card') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) {
          setCameraMode(type);
          await handleCapture(base64);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleCapture = async (image: string) => {
    setShowCamera(false);
    setOcrLoading(true);
    try {
      const result = await performOCR(image, cameraMode);
      if (result) {
        // 【修复 - 2025-12-01】使用 Partial<DbStaff> 替代 any
        // 问题：使用 any 类型会失去类型安全性
        // 解决：使用 Partial<DbStaff> 确保类型安全
        setFormData((prev) => {
          const update: DbStaff = { ...prev };
          if (cameraMode === 'id_card') {
            if (result.name) update.name = result.name;
            if (result.id_number) update.id_card_number = result.id_number;
          } else {
            if (result.bank_name) update.bank_name = result.bank_name;
            if (result.card_number) update.bank_card_number = result.card_number;
          }
          return update;
        });
      }
    } catch (error) {
      console.error('OCR Error', error);
      alert('识别失败，请手动输入');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleAutoLocation = () => {
    if (!navigator.geolocation) {
      alert('您的浏览器不支持地理定位功能');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setFormData((prev) => ({
          ...prev,
          address: `📍 当前定位 [Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}]`,
          home_location: { lat: latitude, lng: longitude },
        }));
        setLocating(false);
      },
      (err) => {
        console.warn('[ProfileEditor] GPS failed:', err);
        setLocating(false);
        // 容错机制：仅提示警告，不阻断用户手动输入
        alert('无法自动获取位置，请手动输入地址 (GPS Error)');
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  };

  const steps: CameraStep[] = [
    {
      label: cameraMode === 'id_card' ? '拍摄证件正面' : '拍摄银行卡正面',
      sub: '请确保文字清晰可见',
      icon: ScanBarcode,
    },
  ];

  const currentIdLabel =
    NATIONALITIES.find((n) => n.code === formData.nationality)?.idLabel || '证件号码';

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 min-h-[100dvh] sm:min-h-0">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>

      {/* 移动端：全宽全高贴合屏幕；桌面端：居中卡片 */}
      <div className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl px-4 py-4 sm:p-6 relative z-10 shadow-2xl animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300 h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 sm:mb-6 shrink-0">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            {isNew ? '录入员工档案' : mode === 'assignment' ? '分配酒店' : '编辑个人资料'}
            {ocrLoading && <Loader2 size={16} className="animate-spin text-indigo-600" />}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Body - min-h-0 使 flex 子项可正确滚动；隐藏滚动条更贴近原生 */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide space-y-6 sm:space-y-8 pb-4 pr-1 sm:pr-2">
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative group cursor-pointer">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-md ${formData.avatar_color}`}
              >
                {formData.name ? formData.name.charAt(0) : <User size={32} />}
              </div>
              {mode === 'admin' && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1 bg-white p-1 rounded-full shadow border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                  {AVATAR_COLORS.slice(0, 4).map((c) => (
                    <button
                      key={c}
                      onClick={() => setFormData({ ...formData, avatar_color: c })}
                      className={`w-3 h-3 rounded-full ${c}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Basic Info Summary (Read-only for assignment mode) */}
          {mode === 'assignment' && (
            <div className="text-center space-y-1">
              <h4 className="text-lg font-bold text-slate-900">{formData.name}</h4>
              <p className="text-sm text-slate-500">
                {t(`role.${formData.role.toLowerCase().replace(' ', '_')}`)} · {formData.phone}
              </p>
            </div>
          )}

          {/* Full Sections (Hidden in assignment mode) */}
          {mode !== 'assignment' && (
            <>
              {/* Section 1: Basic Info */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <User size={14} /> 基本信息
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      姓名
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                      placeholder="真实姓名"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      手机号
                    </label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                      placeholder="联系电话"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      电子邮箱 (Google Login)
                    </label>
                    <div className="relative">
                      <Mail
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                        placeholder="绑定 Google 账号邮箱"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                    国籍 / 地区
                  </label>
                  <div className="relative">
                    <Globe
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <select
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-indigo-500 appearance-none"
                    >
                      {NATIONALITIES.map((n) => (
                        <option key={n.code} value={n.code}>
                          {n.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      职位 (Role)
                    </label>
                    <div className="relative">
                      <Briefcase
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      {mode === 'admin' ? (
                        <select
                          value={formData.role}
                          onChange={(e) =>
                            setFormData({ ...formData, role: e.target.value as Role })
                          }
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 appearance-none"
                        >
                          {Object.values(Role).map((r) => (
                            <option key={r} value={r}>
                              {t(`role.${r.toLowerCase().replace(' ', '_')}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={t(`role.${formData.role.toLowerCase().replace(' ', '_')}`)}
                          readOnly
                          className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold text-slate-500 cursor-not-allowed"
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      状态 (Status)
                    </label>
                    <div className="relative">
                      <div
                        className={`absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${formData.status === 'on-duty'
                          ? 'bg-emerald-500'
                          : formData.status === 'break'
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                          }`}
                      ></div>
                      {mode === 'admin' ? (
                        <select
                          value={formData.status}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              status: e.target.value as any,
                            })
                          }
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 appearance-none"
                        >
                          <option value="on-duty">在岗 (On-duty)</option>
                          <option value="off-duty">下班 (Off-duty)</option>
                          <option value="break">休息 (Break)</option>
                          <option value="pending_approval">待审核 (Pending)</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={
                            formData.status === 'on-duty'
                              ? '在岗'
                              : formData.status === 'off-duty'
                                ? '下班'
                                : formData.status === 'break'
                                  ? '休息'
                                  : '待审核'
                          }
                          readOnly
                          className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold text-slate-500 cursor-not-allowed"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: 证件提交 */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <ShieldCheck size={14} /> 证件提交
                </h4>
                {/* 证件种类选择 */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                    证件种类
                  </label>
                  <select
                    value={idDocumentType}
                    onChange={(e) => setIdDocumentType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500 appearance-none"
                  >
                    {ID_DOCUMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* 证件号码 + 上传按钮 */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      证件号码
                    </label>
                    <input
                      type="text"
                      value={formData.id_card_number || ''}
                      onChange={(e) => setFormData({ ...formData, id_card_number: e.target.value })}
                      placeholder={ID_DOCUMENT_TYPES.find((t) => t.value === idDocumentType)?.label + '号码'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500 transition-all"
                    />
                    {formData.id_card_number && (
                      <CheckCircle
                        size={14}
                        className="absolute right-3 bottom-3 text-emerald-500"
                      />
                    )}
                  </div>
                  {/* 拍照上传 */}
                  <div className="self-end flex flex-col gap-1">
                    <button
                      onClick={() => handleScan('id_card')}
                      className="bg-indigo-50 text-indigo-600 p-2.5 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-100"
                      title="拍照识别证件"
                    >
                      <Camera size={18} />
                    </button>
                    {/* 选择图片上传 */}
                    <button
                      onClick={() => handleSelectImage('id_card')}
                      className="bg-violet-50 text-violet-600 p-2.5 rounded-lg hover:bg-violet-100 transition-colors border border-violet-100"
                      title="从图库选择证件照片"
                    >
                      <ImagePlus size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 3: Financial */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <CreditCard size={14} /> 财务信息 (工资卡)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      开户银行 (Bank Name)
                    </label>
                    <div className="relative">
                      <Building2
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        value={formData.bank_name || ''}
                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        placeholder="例如：招商银行"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      开户行用户名称 (户名)
                    </label>
                    <div className="relative">
                      <User
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        value={formData.bank_account_holder || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, bank_account_holder: e.target.value })
                        }
                        placeholder="银行卡户名"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                  </div>
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      银行卡号 (Account No.)
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Banknote
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          value={formData.bank_card_number || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bank_card_number: e.target.value,
                            })
                          }
                          placeholder="卡号"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                        />
                      </div>
                      <button
                        onClick={() => handleScan('bank_card')}
                        className="bg-emerald-50 text-emerald-600 p-2.5 rounded-lg hover:bg-emerald-100 transition-colors border border-emerald-100"
                        title="扫描银行卡"
                      >
                        <Camera size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Account & Security (Login) */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Lock size={14} /> 账号与安全 (Login)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      登录账号 (手机号)
                    </label>
                    <div className="relative">
                      <Smartphone
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      {mode === 'admin' ? (
                        <input
                          type="text"
                          value={formData.phone || ''}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                          placeholder="输入手机号作为登录账号"
                        />
                      ) : (
                        <input
                          type="text"
                          value={formData.phone || ''}
                          readOnly
                          className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold text-slate-500 cursor-not-allowed"
                          placeholder="联系管理员修改"
                        />
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">* 账号即为联系手机号</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      登录密码 (Access Code)
                    </label>
                    <div className="relative">
                      <Key
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        value={formData.access_code || ''}
                        onChange={(e) => setFormData({ ...formData, access_code: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                        placeholder="设置新密码"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 5: Contact & Emergency */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Siren size={14} /> 居住地与紧急联系人
                </h4>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                    居住地址 (可定位)
                  </label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-3 text-slate-400" />
                    <textarea
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-20 py-2.5 text-sm outline-none focus:border-indigo-500 resize-none h-20"
                      placeholder="输入详细住址，或点击右下角定位..."
                    />
                    <button
                      onClick={handleAutoLocation}
                      type="button"
                      disabled={locating}
                      className="absolute right-2 bottom-2 p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-[10px] font-bold flex items-center gap-1 border border-indigo-100"
                    >
                      {locating ? (
                        <Loader2 className="animate-spin" size={12} />
                      ) : (
                        <MapPin size={12} />
                      )}{' '}
                      定位
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      紧急联系人姓名
                    </label>
                    <input
                      type="text"
                      value={formData.emergency_contact || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergency_contact: e.target.value,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500"
                      placeholder="姓名"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                      紧急联系电话
                    </label>
                    <input
                      type="text"
                      value={formData.emergency_phone || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergency_phone: e.target.value,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500"
                      placeholder="电话"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Admin Section: Credentials & Role */}
          {(mode === 'admin' || mode === 'assignment') && (
            <div className="bg-slate-900 text-slate-200 p-4 rounded-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-2">
                <h4 className="text-xs font-bold uppercase flex items-center gap-2 text-indigo-400">
                  <Key size={12} /> 管理员专区
                </h4>
                {isNew && (
                  <button
                    onClick={regenerateCredentials}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw size={10} /> 重置 ID
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {mode === 'admin' && (
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">工号 ID</label>
                    <div className="relative">
                      <Hash
                        size={12}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"
                      />
                      <input
                        type="text"
                        value={formData.badge_id || ''}
                        readOnly={!isNew}
                        className={`w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-2 py-2 text-xs font-bold text-white focus:border-indigo-500 outline-none ${!isNew ? 'opacity-70 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>
                )}
                <div className={mode === 'assignment' ? 'col-span-2' : ''}>
                  <label className="block text-[10px] text-slate-500 mb-1">
                    所属酒店 (Assigned Hotel)
                  </label>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 max-h-32 overflow-y-auto custom-scrollbar">
                    {hotels.map((h) => {
                      // 【修复 - 2026-02-21】所属酒店展示统一数据源，避免 hotel_ids 与 assigned_hotels 不一致导致取消分配后仍显示/收到任务
                      // 问题：仅用 hotel_ids 时，若历史数据只有 assigned_hotels 会显示不全；仅用 assigned_hotels 时，取消池袋后未同步则仍显示池袋
                      // 解决：优先 hotel_ids，其次 assigned_hotels，最后 hotel_id，保证与清扫端过滤逻辑一致
                      // 【修复 - 2026-03-09】使用统一工具 resolveAssignedHotelIds 解析 TEXT 字段中的 JSON 字符串，防止 Array.isArray() 过滤掉正常数据
                      const safeIds = resolveAssignedHotelIds(formData);
                      const isSelected = safeIds.includes(h.id);
                      return (
                        <label
                          key={h.id}
                          className="flex items-center gap-2 p-1.5 hover:bg-slate-700 rounded cursor-pointer transition-colors"
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-500'}`}
                          >
                            {isSelected && <CheckCircle size={10} className="text-white" />}
                          </div>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isSelected}
                            onChange={(e) => {
                              let newIds: string[];
                              if (e.target.checked) {
                                newIds = [...safeIds, h.id];
                              } else {
                                newIds = safeIds.filter((id) => id !== h.id);
                              }
                              // 【修复 - 2026-02-21】保存时同时更新 hotel_ids 与 assigned_hotels，避免清扫端/其他模块读 assigned_hotels 仍看到旧分配
                              // 解决：员工取消池袋分配后仍收到池袋清扫任务 — 双字段保持一致，任务过滤以 hotel_ids 为准时也需 assigned_hotels 同步
                              setFormData({
                                ...formData,
                                hotel_ids: newIds,
                                hotel_id: newIds.length > 0 ? newIds[0] : undefined,
                                assigned_hotels: newIds,
                              });
                            }}
                          />
                          <span
                            className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-400'}`}
                          >
                            {h.name}
                          </span>
                        </label>
                      );
                    })}
                    {hotels.length === 0 && (
                      <div className="text-[10px] text-slate-500 text-center py-2">
                        暂无酒店数据
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer - 移动端底部预留安全区 */}
        <div className="pt-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 border-t border-slate-100 shrink-0">
          <button
            onClick={() => {
              // 【修复 - 2026-02-21】保存时强制同步 assigned_hotels 与 hotel_ids，确保取消池袋等变更落库后清扫端只看到当前分配
              // 【修复 - 2026-03-09】使用 resolveAssignedHotelIds 以防数据库加载过来的 JSON TEXT 字符串未被正确识别并意外缩水为空数组
              const ids = resolveAssignedHotelIds(formData);
              onSave({ ...formData, hotel_ids: ids, assigned_hotels: ids, hotel_id: ids[0] });
            }}
            disabled={!formData.name || !formData.phone}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} /> {isNew ? '确认录入' : '保存更改'}
          </button>
          {mode === 'admin' && !isNew && (
            <div className="mt-3 flex justify-center">
              <DeleteButtonWithConfirmation onDelete={handleDelete} />
            </div>
          )}
        </div>
      </div>

      {/* Camera Overlay */}
      {showCamera && (
        <SmartCameraOverlay
          steps={steps}
          currentStep={0}
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
          isProcessing={ocrLoading}
        />
      )}
    </div>
  );
};

export default ProfileEditorModal;
