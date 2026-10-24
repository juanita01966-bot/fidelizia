'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  QrCode, 
  Settings, 
  Sparkles, 
  ShieldCheck, 
  LogOut, 
  Lock, 
  EyeOff, 
  Crown, 
  Percent, 
  Gift, 
  Sliders, 
  Plus, 
  Trash2, 
  Save, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Edit3, 
  X, 
  Palette, 
  KeyRound, 
  Filter, 
  Check, 
  ShieldAlert, 
  CreditCard,
  UserCheck,
  Cpu,
  Layers,
  Sparkle,
  Square,
  SlidersHorizontal,
  Award,
  RefreshCw,
  BellRing,
  Search,
  Smartphone,
  Zap,
  CheckCheck,
  History
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { getSessionManager, UserRole } from '@/lib/store/auth-session';
import { 
  getStore, 
  getTierMeta, 
  calculateCustomerTier, 
  DEFAULT_TIER_CONFIG 
} from '@/lib/store/fidelizia-store';
import { 
  Customer, 
  TierConfig, 
  LoyaltyTier, 
  Employee, 
  CardPattern,
  LoyaltyProgramMode,
  CardMorphology,
  CardGradientConfig,
  RewardMilestone
} from '@/types/domain';
import { LivePassPreview } from '@/components/passes/LivePassPreview';
import { ReservationsCalendarView } from './ReservationsCalendarView';
import { formatCurrency, cn } from '@/lib/utils';
import { soundEngine } from '@/lib/audio/sound-effects';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';

// PESTAÑAS CANÓNICAS DEL DSB (INCLUYE NOTIFICACIONES PUSH A WALLETS)
type DashboardTab = 'overview' | 'customers' | 'notifications' | 'bookings' | 'settings';

// SUB-NAVBAR INTERNA EN LA ZONA DE CONFIGURACIONES
type SettingsSubTab = 'cards' | 'tiers_customers' | 'staff_pins' | 'security';

export const GRADIENT_PRESETS = [
  { id: 'obsidian', name: 'Deep Space-Black', from: '#09090b', via: '#18181b', to: '#09090b', angle: 135, desc: 'Obsidiana con Doppelrand titanio' },
  { id: 'purple_pbr', name: 'Midnight PBR Purple', from: '#1a0b2e', via: '#2e1065', to: '#0f051d', angle: 135, desc: 'Púrpura táctico profundo' },
  { id: 'roasted_gold', name: 'Café Canelo Roasted Gold', from: '#1c130d', via: '#2a1a0e', to: '#0d0805', angle: 135, desc: 'Tostión de café y oro champaña' },
  { id: 'emerald', name: 'Emerald Botanical', from: '#042f2e', via: '#064e3b', to: '#021814', angle: 135, desc: 'Esmeralda botánico profundo' },
  { id: 'cobalt', name: 'Royal Cobalt Blue', from: '#0f172a', via: '#1e3a8a', to: '#030712', angle: 135, desc: 'Azul cobalto de alta banca' },
  { id: 'carbon', name: 'Cyberpunk Carbon', from: '#121214', via: '#1f1f23', to: '#0a0a0c', angle: 135, desc: 'Fibra de carbono mate' },
];

export const MORPHOLOGY_OPTIONS: { id: CardMorphology; label: string; desc: string }[] = [
  { id: 'orthogonal', label: 'SHARP 90°', desc: 'Ortogonal puro con Doppelrand 1px' },
  { id: 'chamfered', label: 'BISEL 45°', desc: 'Cortes tácticos achaflanados' },
  { id: 'rounded', label: 'CURVO 16px', desc: 'Radio suave de alta relojería' },
  { id: 'cutout', label: 'MUESCAS VIP', desc: 'Cortes cóncavos en bordes' },
];

export function UnifiedDashboard() {
  const sessionManager = getSessionManager();
  const store = getStore();

  const [session, setSession] = useState(sessionManager.getSession());
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('cards');

  // Estado reactivo del store
  const [customers, setCustomers] = useState(store.customers);
  const [transactions, setTransactions] = useState(store.transactions);
  const [passes, setPasses] = useState(store.passes);
  const [fraudAlerts, setFraudAlerts] = useState(store.fraudAlerts);
  const [reservations, setReservations] = useState(store.reservations);
  const [employees, setEmployees] = useState(store.employees);
  const [merchant, setMerchant] = useState(store.merchant);

  // Filtro de Rangos en Clientes
  const [tierFilter, setTierFilter] = useState<LoyaltyTier | 'all'>('all');

  // Modal In-Situ de Registro de Cliente
  const [isRegisterCustomerOpen, setIsRegisterCustomerOpen] = useState(false);
  const [regFullName, setRegFullName] = useState('');
  const [regPhone, setRegPhone] = useState('+573');
  const [regBirthdate, setRegBirthdate] = useState('');
  const [regPassType, setRegPassType] = useState<'apple' | 'google'>('google');

  // Modal de Beneficios Diferenciados por Rango (Admin Only)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [benefitReward, setBenefitReward] = useState('');
  const [selectedRewardOption, setSelectedRewardOption] = useState<string>('');
  const [benefitDiscount, setBenefitDiscount] = useState<number | ''>('');

  // Modal de Ofertas Push para Clientes en Riesgo
  const [isPushOfferModalOpen, setIsPushOfferModalOpen] = useState(false);
  const [targetRiskCustomerId, setTargetRiskCustomerId] = useState<string | null>(null);
  const [selectedPushOffer, setSelectedPushOffer] = useState<string>(
    '☕ 2x1 en Bebidas de Especialidad esta semana'
  );
  const [customPushMessage, setCustomPushMessage] = useState('');

  // SECCIÓN PRINCIPAL: NOTIFICACIONES PUSH A WALLETS (2x1 DIRECTO POR CLIENTE)
  const [pushTargetMode, setPushTargetMode] = useState<'individual' | 'segment'>('individual');
  const [selectedPushCustomerId, setSelectedPushCustomerId] = useState<string | null>(null);
  const [pushSelectedSegment, setPushSelectedSegment] = useState<'all' | 'champion' | 'loyal' | 'at_risk'>('all');
  const [pushTitle, setPushTitle] = useState('☕ ¡2x1 en Bebidas de Especialidad!');
  const [pushMessage, setPushMessage] = useState('¡Presenta tu pase digital en barra y disfruta 2x1 en toda nuestra carta de cafés y bebidas frías! Válido hoy.');
  const [pushCustomerSearch, setPushCustomerSearch] = useState('');
  const [isSendingPushNotification, setIsSendingPushNotification] = useState(false);
  const [pushHistoryLog, setPushHistoryLog] = useState<Array<{
    id: string;
    targetName: string;
    title: string;
    body: string;
    time: string;
    status: 'delivered' | 'pending';
    passType: string;
  }>>([
    {
      id: 'push-sample-1',
      targetName: 'Todos los Comensales (Campaña General)',
      title: '☕ ¡2x1 en Café Canelo Hoy!',
      body: '¡Presenta tu tarjeta digital en barra y lleva 2 bebidas por el precio de 1! Válido hoy.',
      time: 'Hoy a las 09:30 AM',
      status: 'delivered',
      passType: 'Google Wallet & Apple Wallet'
    },
    {
      id: 'push-sample-2',
      targetName: 'Clientes VIP Champions',
      title: '⭐ ¡Doble Sello de Bonificación!',
      body: 'Por ser cliente VIP, hoy cada consumo te suma el doble de sellos hacia tu regalo.',
      time: 'Ayer a las 04:15 PM',
      status: 'delivered',
      passType: 'Google Wallet & Apple Wallet'
    }
  ]);

  const PUSH_TEMPLATES = [
    {
      id: '2x1-cafe',
      label: '☕ 2x1 Café de Especialidad',
      title: '☕ ¡2x1 en Bebidas de Especialidad!',
      message: '¡Presenta tu pase digital en barra y disfruta 2x1 en toda nuestra carta de cafés y bebidas frías! Válido hoy.',
    },
    {
      id: '2x1-croissant',
      label: '🥐 2x1 en Repostería',
      title: '🥐 ¡2x1 en Repostería Francesa!',
      message: '¡Hoy 2x1 en croissants de mantequilla y repostería artesanal horneada en casa! Muestra este pase en caja.',
    },
    {
      id: 'double-stamps',
      label: '⭐ Doble Sello Hoy',
      title: '⭐ ¡Doble Sello en tu Visita!',
      message: '¡Hoy cada consumo en Café Canelo te otorga 2 sellos en lugar de 1! Avanza más rápido hacia tu recompensa.',
    },
    {
      id: 'free-reward',
      label: '🎁 Cortesía en Barra',
      title: '🎁 ¡Tienes una Cortesía Reservada!',
      message: '¡Te tenemos una degustación especial o shot de espresso reservado a tu nombre en barra! Válido hoy.',
    },
    {
      id: 'custom',
      label: '✍️ Personalizado',
      title: '✨ ¡Sorpresa Especial en Café Canelo!',
      message: 'Tenemos algo preparado especialmente para ti. Presenta tu tarjeta de cliente frecuente en barra.',
    },
  ];

  // Umbrales de Rangos (Tiers)
  const [tierConfig, setTierConfig] = useState<TierConfig>(
    store.merchant.tier_config || DEFAULT_TIER_CONFIG
  );

  // Modal de Modificación Manual de Rango de Cliente (Protegido con AdminMaster2026@)
  const [tierChangeTarget, setTierChangeTarget] = useState<{
    customer: Customer;
    newTier: LoyaltyTier;
  } | null>(null);
  const [tierChangeSecurityKey, setTierChangeSecurityKey] = useState('');

  // Las 3 Opciones Preconfiguradas de Recompensas
  const [promoOptions, setPromoOptions] = useState<[string, string, string]>(
    store.merchant.preconfigured_rewards || [
      'Café Americano de Especialidad (Cortesía)',
      'Galleta Artesanal de Avena & Canela',
      'Doble Sello de Bonificación en Próxima Visita',
    ]
  );

  // Diseñador Ultra-Premium de Tarjeta (Apple & Google Wallet)
  const [loyaltyProgramModeInput, setLoyaltyProgramModeInput] = useState<LoyaltyProgramMode>(
    store.merchant.loyalty_program_mode || 'multi_tier'
  );
  const [cardMorphologyInput, setCardMorphologyInput] = useState<CardMorphology>(
    store.merchant.card_morphology || 'orthogonal'
  );
  const [cardGradientInput, setCardGradientInput] = useState<CardGradientConfig>(
    store.merchant.card_gradient || {
      preset: 'obsidian',
      from: '#09090b',
      via: '#18181b',
      to: '#09090b',
      angle: 135,
    }
  );
  const [rewardMilestonesInput, setRewardMilestonesInput] = useState<RewardMilestone[]>(
    store.merchant.reward_milestones || [
      { id: 'ms-1', stamp_number: 3, reward: 'Galleta Artesanal o Shot Espresso', icon: 'cookie' },
      { id: 'ms-2', stamp_number: 6, reward: 'Croissant Francés o Bebida Fría', icon: 'cup' },
      { id: 'ms-3', stamp_number: 10, reward: 'Café de Especialidad + Postre de Autor', icon: 'gift' },
    ]
  );
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [newMilestoneStamp, setNewMilestoneStamp] = useState<number>(5);
  const [newMilestoneReward, setNewMilestoneReward] = useState<string>('');
  const [newMilestoneIcon, setNewMilestoneIcon] = useState<string>('coffee');

  const [brandColorInput, setBrandColorInput] = useState(store.merchant.brand_color || '#8b5cf6');
  const [stampsNeededInput, setStampsNeededInput] = useState(store.merchant.stamps_needed || 10);
  const [rewardDescInput, setRewardDescInput] = useState(
    store.merchant.reward_description || 'Café de Especialidad + Croissant'
  );
  const [cardPatternInput, setCardPatternInput] = useState<CardPattern>(
    store.merchant.card_pattern || 'guilloche'
  );
  const [showEmvChipInput, setShowEmvChipInput] = useState<boolean>(
    store.merchant.show_emv_chip ?? true
  );
  const [showHologramInput, setShowHologramInput] = useState<boolean>(
    store.merchant.show_hologram ?? true
  );
  const [designerPreviewTier, setDesignerPreviewTier] = useState<LoyaltyTier>('champion');

  // Seguridad & Credenciales Maestras
  const [securityKeyInput, setSecurityKeyInput] = useState('');
  const [newAdminPasswordInput, setNewAdminPasswordInput] = useState('');
  const [cooldownHoursInput, setCooldownHoursInput] = useState(store.merchant.cooldown_hours || 3);
  const [geofenceMetersInput, setGeofenceMetersInput] = useState(
    store.merchant.scanner_geofence_meters || 250
  );

  // Formulario de Nuevo Empleado (con PIN + Contraseña DSB)
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpPin, setNewEmpPin] = useState('');
  const [newEmpDsbPassword, setNewEmpDsbPassword] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'cashier' | 'manager'>('cashier');
  const [isAddingEmp, setIsAddingEmp] = useState(false);

  // Escuchar mutaciones del store y de sesión
  useEffect(() => {
    const unsubSession = sessionManager.subscribe(() => {
      setSession(sessionManager.getSession());
    });
    const unsubStore = store.subscribe(() => {
      setCustomers([...store.customers]);
      setTransactions([...store.transactions]);
      setPasses([...store.passes]);
      setFraudAlerts([...store.fraudAlerts]);
      setReservations([...store.reservations]);
      setEmployees([...store.employees]);
      setMerchant({ ...store.merchant });
      if (store.merchant.tier_config) {
        setTierConfig(store.merchant.tier_config);
      }
      if (store.merchant.preconfigured_rewards) {
        setPromoOptions(store.merchant.preconfigured_rewards);
      }
      if (store.merchant.card_pattern) {
        setCardPatternInput(store.merchant.card_pattern);
      }
      if (typeof store.merchant.show_emv_chip === 'boolean') {
        setShowEmvChipInput(store.merchant.show_emv_chip);
      }
      if (typeof store.merchant.show_hologram === 'boolean') {
        setShowHologramInput(store.merchant.show_hologram);
      }
      if (store.merchant.loyalty_program_mode) {
        setLoyaltyProgramModeInput(store.merchant.loyalty_program_mode);
      }
      if (store.merchant.card_morphology) {
        setCardMorphologyInput(store.merchant.card_morphology);
      }
      if (store.merchant.card_gradient) {
        setCardGradientInput(store.merchant.card_gradient);
      }
      if (store.merchant.reward_milestones) {
        setRewardMilestonesInput(store.merchant.reward_milestones);
      }
    });

    return () => {
      unsubSession();
      unsubStore();
    };
  }, [sessionManager, store]);

  // Sincronización transparente con Supabase y Backend
  const [isSyncingRemote, setIsSyncingRemote] = useState(false);

  const fetchRemoteData = async (silent = false) => {
    try {
      setIsSyncingRemote(true);
      // 1. Obtener clientes de Supabase
      const custRes = await fetch('/api/v1/customers');
      if (custRes.ok) {
        const custData = await custRes.json();
        if (custData.customers) {
          store.syncFromRemote({ customers: custData.customers, passes: custData.passes });
          setCustomers([...store.customers]);
          setPasses([...store.passes]);
        }
      }

      // 2. Obtener configuraciones del merchant
      const merchRes = await fetch('/api/v1/merchant/settings');
      if (merchRes.ok) {
        const merchData = await merchRes.json();
        if (merchData.merchant) {
          store.syncFromRemote({ merchant: merchData.merchant });
          setMerchant({ ...store.merchant });
        }
      }
      if (!silent) {
        soundEngine.playScanSuccess();
        toast.success('Directorio y configuraciones sincronizados con Supabase.');
      }
    } catch (e) {
      console.warn('Error fetching remote data in UnifiedDashboard:', e);
    } finally {
      setIsSyncingRemote(false);
    }
  };

  // Sincronización continua en tiempo real (Supabase Realtime + Polling Inteligente + BroadcastChannel)
  useEffect(() => {
    // 1. Carga inicial
    fetchRemoteData(true);

    // 2. Supabase Realtime WebSocket Listener (para comensales desde celulares remotos)
    let channel: any = null;
    try {
      channel = supabase
        .channel('fidelizia-realtime-dashboard')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          (payload: any) => {
            fetchRemoteData(true);
            if (payload?.eventType === 'INSERT' && payload.new) {
              soundEngine.playScanSuccess();
              toast.success(`🎉 ¡Nuevo cliente en tiempo real: ${payload.new.full_name || 'Comensal'}!`, {
                description: 'Se ha sincronizado automáticamente en la tabla.',
              });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wallet_passes' },
          () => {
            fetchRemoteData(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'merchants' },
          () => {
            fetchRemoteData(true);
          }
        )
        .subscribe();
    } catch (realtimeErr) {
      console.warn('[Realtime Supabase] Subscripción fallback:', realtimeErr);
    }

    // 3. Heartbeat Polling Inteligente (cada 4 segundos si la ventana está visible)
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchRemoteData(true);
      }
    }, 4000);

    // 4. BroadcastChannel entre pestañas locales del mismo navegador (<5ms)
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('fidelizia_realtime_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'CUSTOMER_REGISTERED') {
          soundEngine.playScanSuccess();
          toast.success(`🎉 ¡Nuevo cliente registrado: ${event.data.customer?.full_name}!`);
          fetchRemoteData(true);
        }
      };
    } catch (e) {
      // BroadcastChannel opcional
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      clearInterval(intervalId);
      if (bc) {
        bc.close();
      }
    };
  }, []);

  const isAdmin = session.role === 'admin';

  // Deduplicación blindada por número telefónico normalizado o ID
  const deduplicatedCustomers = useMemo(() => {
    const cleanDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
    const seen = new Set<string>();
    const result: Customer[] = [];

    for (const c of customers) {
      const phoneDigits = cleanDigits(c.phone);
      const key = phoneDigits.length >= 7 ? phoneDigits : c.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
    return result;
  }, [customers]);

  // Métricas financieras calculadas (Solo Admin)
  const totalRevenue = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const champions = deduplicatedCustomers.filter((c) => c.rfm_segment === 'champion');
  const loyal = deduplicatedCustomers.filter((c) => c.rfm_segment === 'loyal');
  const atRisk = deduplicatedCustomers.filter((c) => c.rfm_segment === 'at_risk');

  // Conmutador rápido de rol
  const handleToggleRole = (newRole: UserRole) => {
    sessionManager.switchRole(newRole);
    soundEngine.playScanSuccess();
    toast.success(`Perfil conmutado a: ${newRole === 'admin' ? '👑 Admin Master' : '👤 Staff Recepción'}`);
  };

  const handleLogout = () => {
    sessionManager.logout();
    soundEngine.playFraudAlert();
    toast.info('Sesión cerrada correctamente');
  };

  // 1. REGISTRO IN-SITU DE NUEVO CLIENTE (SIN SALIR DEL DSB)
  const handleRegisterCustomerInSitu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFullName.trim() || regFullName.trim().length < 3) {
      toast.error('El nombre debe tener al menos 3 caracteres');
      return;
    }
    if (!/^\+[1-9]\d{1,14}$/.test(regPhone.trim())) {
      toast.error('Formato telefónico inválido. Usa estándar internacional (Ej: +573001234567)');
      return;
    }

    try {
      // 1. Petición al backend central conectado a Supabase
      const response = await fetch('/api/v1/customers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: regFullName.trim(),
          phone: regPhone.trim(),
          birthdate: regBirthdate || null,
          passType: regPassType,
          merchantSlug: store.merchant.slug,
        }),
      });

      let customerName = regFullName.trim();
      let passSerial = `PASS-CANELO-${Date.now().toString().slice(-4)}`;

      if (response.ok) {
        const resJson = await response.json();
        customerName = resJson.customer.full_name;
        passSerial = resJson.pass.pass_serial_number;
        store.registerCustomer({
          fullName: customerName,
          phone: regPhone.trim(),
          birthdate: regBirthdate || null,
          passType: regPassType,
        });
      } else {
        const local = store.registerCustomer({
          fullName: regFullName.trim(),
          phone: regPhone.trim(),
          birthdate: regBirthdate || null,
          passType: regPassType,
        });
        customerName = local.customer.full_name;
        passSerial = local.pass.pass_serial_number;
      }

      soundEngine.playRedeemCelebration();
      confetti({ particleCount: 60, spread: 70 });
      toast.success(`¡Cliente registrado con éxito en el sistema!`, {
        description: `${customerName} (${passSerial}) · Pase ${regPassType === 'apple' ? 'Apple' : 'Google'} Wallet activo.`,
      });

      setIsRegisterCustomerOpen(false);
      setRegFullName('');
      setRegPhone('+573');
      setRegBirthdate('');
      fetchRemoteData(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar cliente');
    }
  };

  // 2. MODAL BENEFICIOS VIP CON REGLAS DIFERENCIADAS (BRONCE/PLATA vs ORO/CHAMPION)
  const handleOpenBenefitModal = (customer: Customer) => {
    if (!isAdmin) {
      toast.error('Acceso denegado: Solo el Administrador puede configurar beneficios.');
      return;
    }
    const pass = passes.find((p) => p.customer_id === customer.id);
    const rewardsRedeemed = pass?.total_rewards_redeemed || 0;
    const tier = customer.loyalty_tier || calculateCustomerTier(rewardsRedeemed, tierConfig);

    setEditingCustomer(customer);
    setBenefitReward(customer.custom_reward || '');
    setBenefitDiscount(customer.discount_percentage ?? '');

    const options = merchant.preconfigured_rewards || promoOptions;
    if (customer.custom_reward && options.includes(customer.custom_reward)) {
      setSelectedRewardOption(customer.custom_reward);
    } else if (options.length > 0) {
      setSelectedRewardOption(options[0]);
    } else {
      setSelectedRewardOption('');
    }
  };

  const handleSaveCustomerBenefits = () => {
    if (!editingCustomer) return;
    const pass = passes.find((p) => p.customer_id === editingCustomer.id);
    const rewardsRedeemed = pass?.total_rewards_redeemed || 0;
    const tier = editingCustomer.loyalty_tier || calculateCustomerTier(rewardsRedeemed, tierConfig);
    const isHighTier = tier === 'gold' || tier === 'champion';

    try {
      let finalReward = selectedRewardOption;
      if (isHighTier && benefitReward.trim()) {
        finalReward = benefitReward.trim();
      }

      let discountVal: number | null = null;
      if (isHighTier && typeof benefitDiscount === 'number' && benefitDiscount > 0) {
        discountVal = Math.min(Math.max(benefitDiscount, 0), 50);
      }

      store.updateCustomerBenefits(editingCustomer.id, finalReward, discountVal);
      soundEngine.playRedeemCelebration();
      confetti({ particleCount: 50, spread: 60 });
      toast.success(`Beneficios actualizados para ${editingCustomer.full_name}`);
      setEditingCustomer(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar beneficio');
    }
  };

  // 3. OFERTAS PUSH SELECCIONABLES PARA CLIENTES EN RIESGO
  const handleOpenPushOfferModal = (customerId?: string) => {
    setTargetRiskCustomerId(customerId || null);
    setIsPushOfferModalOpen(true);
  };

  const handleSendPushOffer = (e: React.FormEvent) => {
    e.preventDefault();
    const offerText = selectedPushOffer === 'custom' ? customPushMessage.trim() : selectedPushOffer;

    if (!offerText) {
      toast.error('Selecciona o redacta una oferta para enviar');
      return;
    }

    const res = store.sendPushCampaign({
      segment: 'at_risk',
      title: '¡Te extrañamos en Café Canelo!',
      body: offerText,
    });

    soundEngine.playRedeemCelebration();
    confetti({ particleCount: 70, spread: 65 });
    toast.success(`¡Oferta push disparada con éxito!`, {
      description: `Impacto en ${res.customersImpacted} comensales en riesgo a través de sus tarjetas Apple & Google Wallet.`,
    });
    setIsPushOfferModalOpen(false);
    setCustomPushMessage('');
  };

  // 3.1 ENVIAR NOTIFICACIÓN PUSH A CLIENTE INDIVIDUAL (2x1) O CAMPAÑA MASIVA A WALLETS
  const handleSendPushToCustomerOrSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushTitle.trim() || !pushMessage.trim()) {
      toast.error('Ingresa el título y el mensaje de la notificación');
      return;
    }

    if (pushTargetMode === 'individual' && !selectedPushCustomerId) {
      toast.error('Selecciona un cliente de la lista para enviarle la notificación');
      return;
    }

    const targetCustomer = pushTargetMode === 'individual'
      ? deduplicatedCustomers.find((c) => c.id === selectedPushCustomerId)
      : null;
    const targetPass = targetCustomer
      ? passes.find((p) => p.customer_id === targetCustomer.id)
      : null;

    setIsSendingPushNotification(true);
    const toastId = toast.loading(
      pushTargetMode === 'individual'
        ? `Enviando notificación push a la Wallet de ${targetCustomer?.full_name || 'cliente'}...`
        : `Disparando campaña push masiva a Wallets...`
    );

    try {
      const payload: any = {
        title: pushTitle.trim(),
        body: pushMessage.trim(),
      };

      if (pushTargetMode === 'individual') {
        payload.customerId = targetCustomer?.id;
        payload.targetCustomerName = targetCustomer?.full_name;
        if (targetPass?.pass_serial_number) {
          payload.serialNumber = targetPass.pass_serial_number;
        }
      } else {
        payload.segment = pushSelectedSegment;
      }

      const res = await fetch('/api/v1/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al emitir la notificación push');
      }

      soundEngine.playRedeemCelebration();
      confetti({ particleCount: 70, spread: 65 });

      toast.success(
        pushTargetMode === 'individual'
          ? `¡Notificación enviada a la Wallet de ${targetCustomer?.full_name}!`
          : `¡Campaña push enviada a ${data.recipientsCount || 'todos los'} clientes!`,
        {
          id: toastId,
          description: `Impacto directo en pantalla de bloqueo (${data.googleWalletDelivered ?? 1} pases actualizados).`,
        }
      );

      // Registrar en el historial de la pantalla
      const newEntry = {
        id: `push-${Date.now()}`,
        targetName: pushTargetMode === 'individual' 
          ? (targetCustomer?.full_name || 'Cliente')
          : `Segmento: ${pushSelectedSegment === 'all' ? 'Todos los Clientes' : pushSelectedSegment}`,
        title: pushTitle.trim(),
        body: pushMessage.trim(),
        time: 'Hace un momento',
        status: 'delivered' as const,
        passType: targetPass?.pass_type === 'apple' ? 'Apple Wallet' : 'Google Wallet',
      };
      setPushHistoryLog((prev) => [newEntry, ...prev]);

    } catch (err: unknown) {
      soundEngine.playFraudAlert();
      toast.error(err instanceof Error ? err.message : 'Error al enviar notificación push', {
        id: toastId,
      });
    } finally {
      setIsSendingPushNotification(false);
    }
  };

  // 4. GUARDAR LAS 3 OPCIONES PRECONFIGURADAS DE RECOMPENSAS
  const handleSavePromoOptions = () => {
    try {
      store.updatePreconfiguredRewards(promoOptions);
      soundEngine.playScanSuccess();
      toast.success('Las 3 opciones preconfiguradas de promoción fueron actualizadas.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar opciones');
    }
  };

  // 5. GUARDAR DISEÑO ULTRA-PREMIUM DE TARJETA EN CALIENTE (CON SINCRONIZACIÓN EN GOOGLE WALLET API)
  const handleSaveCardDesign = async () => {
    const payload = {
      brand_color: brandColorInput,
      stamps_needed: Number(stampsNeededInput),
      reward_description: rewardDescInput.trim(),
      card_pattern: cardPatternInput,
      show_emv_chip: showEmvChipInput,
      show_hologram: showHologramInput,
      loyalty_program_mode: loyaltyProgramModeInput,
      card_morphology: cardMorphologyInput,
      card_gradient: cardGradientInput,
      reward_milestones: rewardMilestonesInput,
    };

    // Actualización reactiva inmediata en local
    store.updateMerchantSettings(payload);

    const toastId = toast.loading('Sincronizando diseño con Supabase y Google Wallet API...');
    try {
      const res = await fetch('/api/v1/merchant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        soundEngine.playScanSuccess();
        toast.success(
          data.googleWalletSync 
            ? '¡Diseño propagado a Google Wallet y Supabase con éxito!'
            : 'Diseño guardado en Supabase (Google Wallet operando en modo local)',
          {
            id: toastId,
            description: 'Las tarjetas de fidelización en los teléfonos de tus clientes se actualizarán automáticamente.',
          }
        );
      } else {
        soundEngine.playScanSuccess();
        toast.success('Diseño guardado localmente en tu navegador.', { id: toastId });
      }
    } catch (err: unknown) {
      soundEngine.playScanSuccess();
      toast.success('Diseño guardado en memoria local.', { id: toastId });
    }
  };

  const handleAddMilestone = () => {
    if (!newMilestoneReward.trim()) {
      toast.error('Ingresa la descripción del premio para este hito');
      return;
    }
    const stampNum = Number(newMilestoneStamp);
    if (isNaN(stampNum) || stampNum <= 0) {
      toast.error('El número de sello debe ser mayor a 0');
      return;
    }
    if (rewardMilestonesInput.some((m) => m.stamp_number === stampNum)) {
      toast.error(`Ya existe un hito asignado en el sello #${stampNum}`);
      return;
    }

    const updated = [
      ...rewardMilestonesInput,
      {
        id: `ms-${Date.now()}`,
        stamp_number: stampNum,
        reward: newMilestoneReward.trim(),
        icon: (newMilestoneIcon as any) || 'coffee',
      },
    ].sort((a, b) => a.stamp_number - b.stamp_number);

    setRewardMilestonesInput(updated);
    setIsAddingMilestone(false);
    setNewMilestoneReward('');
    soundEngine.playScanSuccess();
    toast.success(`Hito en Sello #${stampNum} añadido a la escalera.`);
  };

  const handleDeleteMilestone = (stampNumber: number) => {
    const updated = rewardMilestonesInput.filter((m) => m.stamp_number !== stampNumber);
    setRewardMilestonesInput(updated);
    soundEngine.playScanSuccess();
    toast.info(`Hito del Sello #${stampNumber} eliminado.`);
  };

  // 6. GUARDAR UMBRALES DE RANGOS (TIERS)
  const handleSaveTierConfig = () => {
    try {
      store.updateTierConfig(tierConfig);
      soundEngine.playScanSuccess();
      toast.success('Umbrales de fidelidad actualizados y rangos recalculados.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar umbrales');
    }
  };

  // 7. CAMBIO MANUAL DE RANGO DE CLIENTE CON CLAVE MAESTRA
  const handleConfirmTierChangeWithMasterKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierChangeTarget) return;

    if (!tierChangeSecurityKey.trim()) {
      toast.error('Ingresa la contraseña de seguridad maestra');
      return;
    }

    const res = store.updateCustomerTierManually(
      tierChangeTarget.customer.id,
      tierChangeTarget.newTier,
      tierChangeSecurityKey.trim()
    );

    if (!res.success) {
      soundEngine.playFraudAlert();
      toast.error(res.error || 'Contraseña de seguridad maestra incorrecta');
      return;
    }

    soundEngine.playRedeemCelebration();
    confetti({ particleCount: 70, spread: 60 });
    const meta = getTierMeta(tierChangeTarget.newTier);
    toast.success(
      `¡Rango de ${tierChangeTarget.customer.full_name} actualizado a ${meta.label} con éxito!`
    );
    setTierChangeTarget(null);
    setTierChangeSecurityKey('');
  };

  // 8. SEGURIDAD: CAMBIAR CONTRASEÑA MAESTRA EXIGIENDO AdminMaster2026@
  const handleChangeAdminPasswordWithMasterKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityKeyInput.trim()) {
      toast.error('Debes ingresar la contraseña de seguridad maestra');
      return;
    }
    if (!newAdminPasswordInput.trim() || newAdminPasswordInput.trim().length < 4) {
      toast.error('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }

    const res = sessionManager.setAdminPasswordWithSecurityKey(
      securityKeyInput.trim(),
      newAdminPasswordInput.trim()
    );

    if (!res.success) {
      soundEngine.playFraudAlert();
      toast.error(res.error || 'Contraseña de seguridad maestra incorrecta');
      return;
    }

    soundEngine.playScanSuccess();
    toast.success('¡Contraseña de Administrador actualizada correctamente!');
    setSecurityKeyInput('');
    setNewAdminPasswordInput('');
  };

  // 9. GUARDAR PARÁMETROS OPERATIVOS (COOLDOWN Y GEOCERCA)
  const handleSaveOperationalSecurity = () => {
    try {
      store.updateMerchantSettings({
        cooldown_hours: Number(cooldownHoursInput),
        scanner_geofence_meters: Number(geofenceMetersInput),
      });
      soundEngine.playScanSuccess();
      toast.success('Parámetros de cooldown y geocerca actualizados.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  // 10. GESTIÓN DE EMPLEADOS: PIN + CONTRASEÑA DSB
  const handleAddNewEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) {
      toast.error('Ingresa el nombre del empleado');
      return;
    }
    if (!/^\d{4}$/.test(newEmpPin.trim())) {
      toast.error('El PIN debe tener exactamente 4 dígitos numéricos');
      return;
    }
    if (!newEmpDsbPassword.trim() || newEmpDsbPassword.trim().length < 4) {
      toast.error('La contraseña para ingreso al DSB debe tener al menos 4 caracteres');
      return;
    }

    try {
      store.addEmployee({
        merchant_id: store.merchant.id,
        location_id: store.locations[0]?.id || null,
        name: newEmpName.trim(),
        pin_hash: newEmpPin.trim(),
        dsb_password: newEmpDsbPassword.trim(),
        role: newEmpRole,
        is_active: true,
      });
      soundEngine.playScanSuccess();
      toast.success(`Empleado "${newEmpName}" añadido con PIN y contraseña DSB.`);
      setNewEmpName('');
      setNewEmpPin('');
      setNewEmpDsbPassword('');
      setIsAddingEmp(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al añadir empleado');
    }
  };

  const handleUpdateEmployeePin = (empId: string, newPin: string) => {
    try {
      store.updateEmployee(empId, { pin_hash: newPin });
      soundEngine.playScanSuccess();
      toast.success('PIN de empleado actualizado.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar PIN');
    }
  };

  const handleDeleteEmployee = (empId: string) => {
    try {
      store.deleteEmployee(empId);
      soundEngine.playFraudAlert();
      toast.info('Empleado eliminado del sistema.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  // Filtrado de clientes según el rango seleccionado (sobre lista deduplicada)
  const filteredCustomers = useMemo(() => {
    if (tierFilter === 'all') return deduplicatedCustomers;
    return deduplicatedCustomers.filter((c) => {
      const pass = passes.find((p) => p.customer_id === c.id);
      const rewardsRedeemed = pass?.total_rewards_redeemed || 0;
      const tier = c.loyalty_tier || calculateCustomerTier(rewardsRedeemed, tierConfig);
      return tier === tierFilter;
    });
  }, [customers, tierFilter, passes, tierConfig]);

  // Filtrado de clientes para la sección de Notificaciones Push
  const searchedPushCustomers = useMemo(() => {
    if (!pushCustomerSearch.trim()) return deduplicatedCustomers;
    const q = pushCustomerSearch.toLowerCase().trim();
    return deduplicatedCustomers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    );
  }, [deduplicatedCustomers, pushCustomerSearch]);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row text-left">
      {/* ============================================================== */}
      {/* BARRA LATERAL TÁCTICA IZQUIERDA (4 PESTAÑAS CANÓNICAS LIMPIAS) */}
      {/* ============================================================== */}
      <aside className="w-full md:w-64 bg-surface-200 border-r border-white/[0.08] flex flex-col justify-between shrink-0 p-4 md:sticky md:top-0 md:h-screen">
        <div className="space-y-6">
          {/* Header Marca */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center shadow-glow-purple border border-brand-400/40">
              <Sparkles className="w-5 h-5 text-champagne" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                DYNAMIND <span className="text-brand-400 font-mono text-xs">DSB</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-mono block">Café Canelo & Roasters</span>
            </div>
          </div>

          {/* Tarjeta de Operador en Turno & Switch de Rol */}
          <div className="bg-surface-100 p-3 rounded-xl border border-white/5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-zinc-500">Operador en Turno</span>
              <Badge variant={isAdmin ? 'tactical' : 'warning'}>
                {isAdmin ? '👑 Admin' : '👤 Staff'}
              </Badge>
            </div>
            <p className="text-xs font-semibold text-white truncate">{session.operatorName}</p>

            {/* Selector Rápido de Rol */}
            <div className="grid grid-cols-2 gap-1 bg-black/40 p-1 rounded-md border border-white/5 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => handleToggleRole('admin')}
                className={`py-1 rounded text-center transition-colors ${
                  isAdmin ? 'bg-purple-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                👑 Admin
              </button>
              <button
                type="button"
                onClick={() => handleToggleRole('staff')}
                className={`py-1 rounded text-center transition-colors ${
                  !isAdmin ? 'bg-amber-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                👤 Staff
              </button>
            </div>
          </div>

          {/* Menú de Navegación Lateral (Solo 4 Pestañas Canónicas Limpias) */}
          <nav className="space-y-1 text-xs font-mono">
            <span className="text-[10px] font-mono uppercase text-zinc-500 px-2 block mb-1">
              Centro de Mando
            </span>

            {/* 1. Tablero Operativo */}
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'overview'
                  ? 'bg-brand-500/20 text-white font-bold border border-brand-400/30 shadow-sm'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-purple-400" />
              <span>Tablero Operativo</span>
            </button>

            {/* 2. Clientes & Fidelidad */}
            <button
              onClick={() => setActiveTab('customers')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'customers'
                  ? 'bg-brand-500/20 text-white font-bold border border-brand-400/30'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 text-zinc-400" />
              <span>Clientes & Fidelidad</span>
            </button>

            {/* 3. Notificaciones Push a Wallets (2x1, Doble Sello, Cortesías) */}
            <button
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                activeTab === 'notifications'
                  ? 'bg-brand-500/20 text-white font-bold border border-brand-400/30 shadow-sm'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BellRing className="w-4 h-4 text-purple-400" />
                <span>Notificaciones Push</span>
              </div>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                2x1
              </span>
            </button>

            {/* 4. Agenda de Reservas & Calendario */}
            <button
              onClick={() => setActiveTab('bookings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'bookings'
                  ? 'bg-brand-500/20 text-white font-bold border border-brand-400/30'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4 text-purple-400" />
              <span>Agenda de Reservas</span>
            </button>

            {/* 4. Ajustes & Personalización (Con Diseñador 3D y Seguridad) */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                activeTab === 'settings'
                  ? 'bg-brand-500/20 text-white font-bold border border-brand-400/30'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-zinc-400" />
                <span>Ajustes & Configuración</span>
              </div>
              {!isAdmin && <Lock className="w-3 h-3 text-amber-500" />}
            </button>
          </nav>
        </div>

        {/* Footer Barra Lateral */}
        <div className="pt-4 border-t border-white/5 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono text-zinc-400 hover:bg-white/5 hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
          <a
            href="/"
            className="block text-center text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors font-mono"
          >
            ← Salir al Sitio Web
          </a>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      {/* ============================================================== */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {/* ============================================================== */}
        {/* TAB 1: OVERVIEW / TABLERO OPERATIVO */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Tablero Operativo {isAdmin ? '· Vista Ejecutiva' : '· Vista Mostrador POS'}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {isAdmin 
                    ? 'Supervisión integral de recaudos, lealtad y alertas de seguridad.' 
                    : 'Control de clientes, escaneo de visitas y calendario de citas en punto de venta.'}
                </p>
              </div>

              <div className="flex gap-2">
                <a href="/#/scan" className="text-xs">
                  <Button variant="primary" size="sm" className="shadow-glow-purple">
                    <QrCode className="w-3.5 h-3.5 mr-1" />
                    Abrir Escáner POS (/#/scan)
                  </Button>
                </a>
              </div>
            </div>

            {/* Tarjetas de Resumen Operativo */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">Clientes Registrados</span>
                  <CardTitle className="text-2xl font-mono text-white mt-1">{customers.length}</CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-zinc-500 font-mono">
                  {champions.length} VIPs · {loyal.length} Leales
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">Tarjetas Activas</span>
                  <CardTitle className="text-2xl font-mono text-champagne-light mt-1">{passes.length}</CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-zinc-500 font-mono">
                  Apple & Google Wallet
                </CardContent>
              </Card>

              {/* Tarjeta con Ceguera Financiera para Staff */}
              <Card>
                <CardHeader className="pb-2">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    {isAdmin ? 'Recaudo Facturado' : 'Visitas Selladas'}
                  </span>
                  <CardTitle className="text-2xl font-mono text-emerald-400 mt-1">
                    {isAdmin ? formatCurrency(totalRevenue) : `${transactions.length} Visitas`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-zinc-500 font-mono">
                  {isAdmin ? `${transactions.length} tickets procesados` : 'Auditoría en mostrador'}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">Alertas Antifraude</span>
                  <CardTitle className="text-2xl font-mono text-rose-400 mt-1">{fraudAlerts.length}</CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-zinc-500 font-mono">
                  Bloqueos automáticos
                </CardContent>
              </Card>
            </div>

            {/* Alertas Antifraude Activas (Si existen) */}
            {fraudAlerts.length > 0 && (
              <Card className="border-rose-500/30 bg-rose-950/10">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center justify-between text-rose-300">
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      Alertas Antifraude Registradas en el Local
                    </span>
                    <Badge variant="danger">{fraudAlerts.length} alertas</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {fraudAlerts.slice(0, 3).map((fa) => (
                    <div
                      key={fa.id}
                      className="p-3 bg-surface-100 rounded-lg border border-white/5 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <span className="font-bold text-rose-400 block uppercase tracking-wide">
                          {fa.alert_type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          Severidad: {fa.severity} · {new Date(fa.created_at).toLocaleString('es-CO')}
                        </span>
                      </div>
                      {!fa.is_resolved && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            store.resolveFraudAlert(fa.id);
                            soundEngine.playScanSuccess();
                            toast.success('Alerta resuelta.');
                          }}
                          className="text-[10px] h-6 px-2"
                        >
                          Resolver
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Feed de Operaciones Recientes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Últimos Tickets Procesados</span>
                    <Badge variant="default">{transactions.length} visitas</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {transactions.slice(0, 5).map((tx) => {
                      const cust = customers.find((c) => c.id === tx.customer_id);
                      return (
                        <div
                          key={tx.id}
                          className="p-2.5 bg-surface-100 rounded-lg border border-white/5 flex items-center justify-between text-xs font-mono"
                        >
                          <div>
                            <span className="font-bold text-white block">{tx.ticket_number}</span>
                            <span className="text-[10px] text-zinc-400">{cust?.full_name || 'Cliente'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-emerald-400 font-bold block">
                              {isAdmin ? formatCurrency(tx.amount) : `+${tx.stamps_awarded} sello`}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {new Date(tx.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Próximas Reservas de Mesas</span>
                    <Badge variant="tactical">{reservations.length} agendadas</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {reservations.slice(0, 5).map((res) => {
                      const cust = customers.find((c) => c.id === res.customer_id);
                      return (
                        <div
                          key={res.id}
                          className="p-2.5 bg-surface-100 rounded-lg border border-white/5 flex items-center justify-between text-xs font-mono"
                        >
                          <div>
                            <span className="font-bold text-white block">{cust?.full_name || 'Comensal'}</span>
                            <span className="text-[10px] text-zinc-400">{res.guests_count} personas · {res.notes || 'Normal'}</span>
                          </div>
                          <div className="text-right">
                            <Badge variant="success">Confirmada</Badge>
                            <span className="text-[10px] text-zinc-400 block mt-1">
                              {new Date(res.date_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: CLIENTES & FIDELIDAD (MODAL IN-SITU, FILTRO RANGOS, EN RIESGO) */}
        {/* ============================================================== */}
        {activeTab === 'customers' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Directorio de Clientes & Fidelidad</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Rangos de lealtad calculados por canjes, asignación de beneficios y reactivación de clientes en riesgo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => fetchRemoteData()}
                  disabled={isSyncingRemote}
                  className="text-xs border border-white/10 hover:border-purple-400/40"
                  title="Recarga en tiempo real los clientes y tarjetas registrados desde Supabase"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isSyncingRemote && "animate-spin text-purple-400")} />
                  {isSyncingRemote ? 'Sincronizando...' : 'Sincronizar Supabase'}
                </Button>
                <Button 
                  variant="primary" 
                  size="sm"
                  onClick={() => setIsRegisterCustomerOpen(true)}
                  className="shadow-glow-purple font-bold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Registrar Nuevo Cliente
                </Button>
              </div>
            </div>

            {/* SECCIÓN DESTACADA: CLIENTES EN RIESGO DE ABANDONO */}
            {atRisk.length > 0 && (
              <div className="bg-gradient-to-r from-rose-950/40 via-surface-200 to-surface-200 border border-rose-500/30 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Clientes en Riesgo de Abandono ({atRisk.length})</span>
                        <Badge variant="danger">Sin visitas &gt;20 días</Badge>
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Incentívalos a volver enviando una oferta seleccionable directamente a su Wallet.
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="champagne"
                    size="sm"
                    onClick={() => handleOpenPushOfferModal()}
                    className="shrink-0 font-bold"
                  >
                    <Send className="w-3.5 h-3.5 mr-1" />
                    Disparar Oferta Push a Todos
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-white/5">
                  {atRisk.map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 bg-black/40 rounded-lg border border-white/5 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <span className="font-bold text-white block">{c.full_name}</span>
                        <span className="text-[10px] text-zinc-400">{c.phone}</span>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenPushOfferModal(c.id)}
                        className="text-[10px] h-6 px-2"
                      >
                        Oferta Push
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOTONES DE FILTRO POR RANGO */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3 text-purple-400" />
                Filtrar por Rango:
              </span>

              {/* Todos */}
              <button
                type="button"
                onClick={() => setTierFilter('all')}
                className={`px-3 py-1.5 rounded-lg border transition-all ${
                  tierFilter === 'all'
                    ? 'bg-purple-600 text-white font-bold border-purple-400 shadow-glow-purple'
                    : 'bg-surface-100 text-zinc-400 border-white/10 hover:text-white'
                }`}
              >
                Todos ({customers.length})
              </button>

              {/* Bronce */}
              <button
                type="button"
                onClick={() => setTierFilter('bronze')}
                className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                  tierFilter === 'bronze'
                    ? 'bg-amber-800 text-white font-bold border-amber-600'
                    : 'bg-surface-100 text-amber-500 border-white/10 hover:text-white'
                }`}
              >
                <Crown className="w-3 h-3 text-amber-500" />
                Bronce
              </button>

              {/* Plata */}
              <button
                type="button"
                onClick={() => setTierFilter('silver')}
                className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                  tierFilter === 'silver'
                    ? 'bg-slate-700 text-white font-bold border-slate-500'
                    : 'bg-surface-100 text-slate-300 border-white/10 hover:text-white'
                }`}
              >
                <Crown className="w-3 h-3 text-slate-300" />
                Plata
              </button>

              {/* Oro */}
              <button
                type="button"
                onClick={() => setTierFilter('gold')}
                className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                  tierFilter === 'gold'
                    ? 'bg-amber-600 text-white font-bold border-yellow-500'
                    : 'bg-surface-100 text-amber-400 border-white/10 hover:text-white'
                }`}
              >
                <Crown className="w-3 h-3 text-amber-400" />
                Oro
              </button>

              {/* Champion */}
              <button
                type="button"
                onClick={() => setTierFilter('champion')}
                className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                  tierFilter === 'champion'
                    ? 'bg-purple-700 text-white font-bold border-purple-400 shadow-glow-purple'
                    : 'bg-surface-100 text-purple-400 border-white/10 hover:text-white'
                }`}
              >
                <Crown className="w-3 h-3 text-purple-400" />
                Champion VIP
              </button>
            </div>

            {/* TABLA DE CLIENTES FILTRADA */}
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono min-w-[700px]">
                  <thead className="bg-surface-100 border-b border-white/5 text-zinc-400 uppercase">
                    <tr>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Rango de Lealtad</th>
                      <th className="py-3 px-4">Bonos Redimidos</th>
                      <th className="py-3 px-4">Sellos</th>
                      <th className="py-3 px-4">Beneficio VIP Asignado</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-zinc-500">
                          No se encontraron clientes bajo este rango.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.map((c) => {
                        const pass = passes.find((p) => p.customer_id === c.id);
                        const rewardsRedeemed = pass?.total_rewards_redeemed || 0;
                        const tier = c.loyalty_tier || calculateCustomerTier(rewardsRedeemed, tierConfig);
                        const tierMeta = getTierMeta(tier);

                        return (
                          <tr key={c.id} className="hover:bg-white/[0.02]">
                            <td className="py-3 px-4">
                              <span className="font-sans font-semibold text-white block">{c.full_name}</span>
                              <span className="text-[10px] text-zinc-400">{c.phone}</span>
                            </td>

                            {/* Rango con Etiqueta de Color Oficial */}
                            <td className="py-3 px-4">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm',
                                  tierMeta.bgColor,
                                  tierMeta.color,
                                  tierMeta.borderColor
                                )}
                              >
                                <Crown className="w-3 h-3" style={{ color: tierMeta.hex }} />
                                {tierMeta.label}
                              </span>
                            </td>

                            {/* Bonos Redimidos */}
                            <td className="py-3 px-4 font-bold text-champagne-light">
                              {rewardsRedeemed} {rewardsRedeemed === 1 ? 'bono' : 'bonos'}
                            </td>

                            {/* Sellos de Tarjeta */}
                            <td className="py-3 px-4 text-zinc-300">
                              {pass ? `${pass.current_stamps}/${store.merchant.stamps_needed}` : '0'}
                            </td>

                            {/* Beneficio VIP Asignado */}
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1 max-w-[200px]">
                                {c.discount_percentage && c.discount_percentage > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold w-fit">
                                    <Percent className="w-2.5 h-2.5" />
                                    {c.discount_percentage}% OFF en Tienda
                                  </span>
                                ) : null}
                                {c.custom_reward ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-champagne/15 text-champagne-light text-[10px] truncate w-fit">
                                    <Gift className="w-2.5 h-2.5 shrink-0" />
                                    {c.custom_reward}
                                  </span>
                                ) : null}
                                {!c.discount_percentage && !c.custom_reward && (
                                  <span className="text-zinc-500 text-[10px]">Sin beneficio extra</span>
                                )}
                              </div>
                            </td>

                            {/* Botón de Configuración (Solo Admin) */}
                            <td className="py-3 px-4 text-right">
                              {isAdmin ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleOpenBenefitModal(c)}
                                  className="text-[11px] h-7 px-2.5"
                                >
                                  <Edit3 className="w-3 h-3 mr-1 text-champagne" />
                                  Beneficios
                                </Button>
                              ) : (
                                <span className="text-[10px] text-zinc-600 font-mono">Solo Admin</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* MODAL 1: REGISTRO DE CLIENTE IN-SITU (VENTANA EMERGENTE SIN SALIR DEL DSB) */}
            {isRegisterCustomerOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                <div className="w-full max-w-md bg-surface-200 border border-purple-500/30 rounded-xl p-5 text-left shadow-2xl relative">
                  <button
                    onClick={() => setIsRegisterCustomerOpen(false)}
                    className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                      <Plus className="w-4 h-4 text-champagne" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Registrar Nuevo Cliente In-Situ</h3>
                      <p className="text-[11px] text-zinc-400">Emisión instantánea de tarjeta digital sin salir del DSB</p>
                    </div>
                  </div>

                  <form onSubmit={handleRegisterCustomerInSitu} className="space-y-4 text-xs font-mono">
                    <div>
                      <label className="text-zinc-300 block mb-1">Nombre Completo *</label>
                      <input
                        type="text"
                        required
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        placeholder="Ej: Carolina Restrepo"
                        className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-white font-sans"
                      />
                    </div>

                    <div>
                      <label className="text-zinc-300 block mb-1">Teléfono Móvil (WhatsApp) *</label>
                      <input
                        type="tel"
                        required
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="+573001234567"
                        className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-zinc-300 block mb-1">Fecha de Cumpleaños (Opcional)</label>
                      <input
                        type="date"
                        value={regBirthdate}
                        onChange={(e) => setRegBirthdate(e.target.value)}
                        className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-zinc-300 block mb-1">Plataforma de Pase Digital</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRegPassType('apple')}
                          className={`py-2 rounded-lg border text-xs font-mono font-bold transition-all ${
                            regPassType === 'apple'
                              ? 'bg-purple-600/30 border-purple-400 text-white shadow-glow-purple'
                              : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-white'
                          }`}
                        >
                          🍎 Apple Wallet
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegPassType('google')}
                          className={`py-2 rounded-lg border text-xs font-mono font-bold transition-all ${
                            regPassType === 'google'
                              ? 'bg-purple-600/30 border-purple-400 text-white shadow-glow-purple'
                              : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-white'
                          }`}
                        >
                          🌐 Google Wallet
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="md"
                        onClick={() => setIsRegisterCustomerOpen(false)}
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        className="flex-1 font-bold shadow-glow-purple"
                      >
                        Crear Cliente & Pase
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL 2: CONFIGURACIÓN DE BENEFICIOS VIP CON REGLAS DIFERENCIADAS */}
            {editingCustomer && (() => {
              const pass = passes.find((p) => p.customer_id === editingCustomer.id);
              const rewardsRedeemed = pass?.total_rewards_redeemed || 0;
              const tier = editingCustomer.loyalty_tier || calculateCustomerTier(rewardsRedeemed, tierConfig);
              const isHighTier = tier === 'gold' || tier === 'champion';
              const tierMeta = getTierMeta(tier);
              const availableOptions = merchant.preconfigured_rewards || promoOptions;

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                  <div className="w-full max-w-lg bg-surface-200 border border-purple-500/30 rounded-xl p-5 text-left shadow-2xl relative">
                    <button
                      onClick={() => setEditingCustomer(null)}
                      className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                        <Gift className="w-4 h-4 text-champagne" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">{editingCustomer.full_name}</h3>
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
                              tierMeta.bgColor,
                              tierMeta.color,
                              tierMeta.borderColor
                            )}
                          >
                            {tierMeta.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          {editingCustomer.phone} · {rewardsRedeemed} bonos redimidos
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 text-xs font-mono">
                      {/* SELECCIÓN DE RECOMPENSA PRECONFIGURADA (1, 2, 3) */}
                      <div>
                        <label className="text-zinc-300 block mb-1.5 font-bold">
                          Selecciona Artículo / Promoción de Cortesía:
                        </label>
                        <div className="space-y-2">
                          {availableOptions.map((opt, idx) => (
                            <label
                              key={idx}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                selectedRewardOption === opt
                                  ? 'bg-purple-600/20 border-purple-500 text-white'
                                  : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <input
                                type="radio"
                                name="promoOption"
                                checked={selectedRewardOption === opt}
                                onChange={() => {
                                  setSelectedRewardOption(opt);
                                  setBenefitReward(opt);
                                }}
                                className="mt-0.5 accent-purple-500"
                              />
                              <div className="flex-1">
                                <span className="text-white font-medium block">{opt}</span>
                                <span className="text-[10px] text-zinc-500">Opción Preconfigurada #{idx + 1}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* SI ES ORO O CHAMPION: REGALO DE AUTOR PERSONALIZADO */}
                      {isHighTier && (
                        <div>
                          <label className="text-zinc-300 block mb-1 font-bold">
                            O Personalizar Regalo de Autor (Oro & Champion):
                          </label>
                          <input
                            type="text"
                            value={benefitReward}
                            onChange={(e) => {
                              setBenefitReward(e.target.value);
                              setSelectedRewardOption(e.target.value);
                            }}
                            placeholder="Ej: Bolsa Café Geisha 250g de Origen"
                            className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-white"
                          />
                        </div>
                      )}

                      {/* % DE DESCUENTO EN TIENDA (DIFERENCIADO POR RANGO) */}
                      <div className="p-3 rounded-lg border border-white/5 bg-surface-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-zinc-300 font-bold flex items-center gap-1.5">
                            <Percent className="w-3.5 h-3.5 text-emerald-400" />
                            <span>% de Descuento Permanente en Tienda</span>
                          </label>
                          {!isHighTier && (
                            <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Solo Oro & Champion
                            </span>
                          )}
                        </div>

                        {isHighTier ? (
                          <>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                max="50"
                                value={benefitDiscount}
                                onChange={(e) =>
                                  setBenefitDiscount(e.target.value === '' ? '' : Number(e.target.value))
                                }
                                placeholder="Ej: 15 (para 15% OFF)"
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white font-bold"
                              />
                            </div>
                            <span className="text-[10px] text-zinc-400 block">
                              Se aplicará automáticamente al escanear la tarjeta en el POS y se proyectará en la Wallet.
                            </span>
                          </>
                        ) : (
                          <p className="text-[10px] text-zinc-400 leading-relaxed bg-black/30 p-2 rounded border border-white/5">
                            🔒 Los clientes <strong>Bronce</strong> y <strong>Plata</strong> solo pueden acceder a las 3 opciones de regalo/artículo preconfiguradas. El porcentaje de descuento en tienda se desbloquea al alcanzar el rango <strong>Oro</strong> (mínimo {tierConfig.goldMin} bonos redimidos).
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="md"
                          onClick={() => setEditingCustomer(null)}
                          className="flex-1"
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="primary"
                          size="md"
                          onClick={handleSaveCustomerBenefits}
                          className="flex-1 font-bold shadow-glow-purple"
                        >
                          Guardar Beneficios
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MODAL 3: SELECTOR DE OFERTA PUSH PARA CLIENTES EN RIESGO */}
            {isPushOfferModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                <div className="w-full max-w-md bg-surface-200 border border-rose-500/30 rounded-xl p-5 text-left shadow-2xl relative">
                  <button
                    onClick={() => setIsPushOfferModalOpen(false)}
                    className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                    <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                      <Send className="w-4 h-4 text-rose-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Disparar Oferta de Reactivación</h3>
                      <p className="text-[11px] text-zinc-400">
                        {targetRiskCustomerId
                          ? `Para: ${customers.find((c) => c.id === targetRiskCustomerId)?.full_name}`
                          : `Para todos los ${atRisk.length} clientes en riesgo`}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSendPushOffer} className="space-y-4 text-xs font-mono">
                    <div>
                      <label className="text-zinc-300 block mb-2 font-bold">
                        Selecciona la Oferta a Proyectar en la Wallet:
                      </label>
                      <div className="space-y-2">
                        {[
                          '☕ 2x1 en Bebidas de Especialidad esta semana',
                          '🥐 15% OFF en toda la carta presentando tu pase',
                          '🧁 Postre o Croissant de Cortesía en tu próxima visita',
                          '⭐ Doble Sello de Bonificación en tu consumo de hoy',
                          'custom',
                        ].map((offer) => (
                          <label
                            key={offer}
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                              selectedPushOffer === offer
                                ? 'bg-purple-600/20 border-purple-500 text-white'
                                : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <input
                              type="radio"
                              name="pushOfferSelect"
                              checked={selectedPushOffer === offer}
                              onChange={() => setSelectedPushOffer(offer)}
                              className="accent-purple-500"
                            />
                            <span>
                              {offer === 'custom' ? '✨ Redactar Mensaje Personalizado...' : offer}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {selectedPushOffer === 'custom' && (
                      <div>
                        <label className="text-zinc-300 block mb-1 font-bold">Mensaje Personalizado:</label>
                        <textarea
                          rows={2}
                          required
                          value={customPushMessage}
                          onChange={(e) => setCustomPushMessage(e.target.value)}
                          placeholder="Ej: Te tenemos una degustación especial de café reservada hoy..."
                          className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-white font-sans text-xs"
                        />
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="md"
                        onClick={() => setIsPushOfferModalOpen(false)}
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        variant="champagne"
                        size="md"
                        className="flex-1 font-bold"
                      >
                        Enviar Push a Wallet
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: CENTRO DE NOTIFICACIONES PUSH A WALLETS (2x1 DIRECTO)   */}
        {/* ============================================================== */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            {/* Header de la Sección */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-900/40 border border-purple-500/30 flex items-center justify-center shadow-glow-purple">
                  <BellRing className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      Notificaciones Push a Wallets
                    </h2>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      En Vivo
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Envía promociones 2x1, doble sello o cortesías directas a la pantalla de bloqueo de Apple & Google Wallet.
                  </p>
                </div>
              </div>

              {/* Conmutador de Modo: Individual vs Segmentado */}
              <div className="flex items-center bg-surface-100 p-1 rounded-lg border border-white/5 text-xs font-mono self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setPushTargetMode('individual')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                    pushTargetMode === 'individual'
                      ? 'bg-purple-600 text-white font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>A un Cliente (2x1)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPushTargetMode('segment')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                    pushTargetMode === 'segment'
                      ? 'bg-purple-600 text-white font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Campaña Masiva</span>
                </button>
              </div>
            </div>

            {/* Layout Principal de Notificaciones */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* PANEL IZQUIERDO: SELECCIÓN DE DESTINATARIO */}
              <div className="lg:col-span-5 space-y-4">
                {pushTargetMode === 'individual' ? (
                  <Card className="border border-white/10 bg-surface-200/90 shadow-xl">
                    <CardHeader className="pb-3 border-b border-white/5">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-400" />
                          Seleccionar Comensal Destinatario
                        </CardTitle>
                        <Badge variant="tactical" className="text-[10px]">
                          {searchedPushCustomers.length} de {deduplicatedCustomers.length}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-zinc-400">
                        Elige el comensal para proyectar la oferta 2x1 en su pantalla de bloqueo.
                      </CardDescription>

                      {/* Buscador Rápido de Clientes */}
                      <div className="relative mt-2">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={pushCustomerSearch}
                          onChange={(e) => setPushCustomerSearch(e.target.value)}
                          placeholder="Buscar por nombre o teléfono (+57)..."
                          className="w-full bg-surface-100 border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-purple-500"
                        />
                        {pushCustomerSearch && (
                          <button
                            type="button"
                            onClick={() => setPushCustomerSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="p-3">
                      {searchedPushCustomers.length === 0 ? (
                        <div className="py-8 text-center text-zinc-500 text-xs">
                          No se encontraron clientes registrados con ese criterio.
                        </div>
                      ) : (
                        <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                          {searchedPushCustomers.map((cust) => {
                            const pass = passes.find((p) => p.customer_id === cust.id);
                            const rewardsRedeemed = pass?.total_rewards_redeemed || 0;
                            const tier = cust.loyalty_tier || calculateCustomerTier(rewardsRedeemed, tierConfig);
                            const tierMeta = getTierMeta(tier);
                            const isSelected = (selectedPushCustomerId === cust.id) || (!selectedPushCustomerId && cust.id === deduplicatedCustomers[0]?.id);

                            return (
                              <div
                                key={cust.id}
                                onClick={() => setSelectedPushCustomerId(cust.id)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-purple-600/20 border-purple-500 shadow-md ring-1 ring-purple-500/40'
                                    : 'bg-surface-100 border-white/5 hover:border-white/15 hover:bg-white/[0.03]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                                      style={{ backgroundColor: `${tierMeta.hex}25`, color: tierMeta.hex }}
                                    >
                                      {cust.full_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-white truncate">
                                        {cust.full_name}
                                      </p>
                                      <p className="text-[10px] text-zinc-400 font-mono truncate">
                                        {cust.phone}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span
                                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                                      style={{
                                        borderColor: `${tierMeta.hex}40`,
                                        color: tierMeta.hex,
                                        backgroundColor: `${tierMeta.hex}15`,
                                      }}
                                    >
                                      {tierMeta.label}
                                    </span>
                                    <div className="flex items-center gap-1 text-[9px] text-zinc-400 font-mono">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                      <span>{pass ? `${pass.current_stamps}/${store.merchant.stamps_needed} sellos` : 'Pase activo'}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  /* Modo Segmento / Campaña Masiva */
                  <Card className="border border-white/10 bg-surface-200/90 shadow-xl">
                    <CardHeader className="pb-3 border-b border-white/5">
                      <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-purple-400" />
                        Seleccionar Segmento de Clientes
                      </CardTitle>
                      <CardDescription className="text-xs text-zinc-400">
                        Dispara la notificación de forma masiva a todos los pases del grupo.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2">
                      {[
                        {
                          id: 'all',
                          title: 'Todos los Comensales',
                          desc: 'Impacta al 100% de los clientes registrados con tarjeta digital.',
                          count: deduplicatedCustomers.length,
                          color: 'text-purple-400',
                          border: 'border-purple-500/30',
                        },
                        {
                          id: 'champion',
                          title: 'Champions VIP',
                          desc: 'Clientes más fieles con mayor frecuencia y bonos redimidos.',
                          count: champions.length,
                          color: 'text-champagne-light',
                          border: 'border-amber-500/30',
                        },
                        {
                          id: 'loyal',
                          title: 'Clientes Frecuentes',
                          desc: 'Comensales con visitas recurrentes en el último mes.',
                          count: loyal.length,
                          color: 'text-blue-400',
                          border: 'border-blue-500/30',
                        },
                        {
                          id: 'at_risk',
                          title: 'En Riesgo de Inactividad',
                          desc: 'Clientes que no nos visitan hace más de 3 semanas.',
                          count: atRisk.length,
                          color: 'text-rose-400',
                          border: 'border-rose-500/30',
                        },
                      ].map((seg) => (
                        <div
                          key={seg.id}
                          onClick={() => setPushSelectedSegment(seg.id as any)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            pushSelectedSegment === seg.id
                              ? 'bg-purple-600/20 border-purple-500 shadow-sm ring-1 ring-purple-500/40'
                              : 'bg-surface-100 border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${seg.color}`}>
                              {seg.title}
                            </span>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-black/40 border border-white/10 text-zinc-300">
                              {seg.count} clientes
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-1">
                            {seg.desc}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* PANEL DERECHO: COMPOSITOR DE LA OFERTA & LIVE LOCKSCREEN PREVIEW */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="border border-white/10 bg-surface-200/90 shadow-xl">
                  <CardHeader className="pb-3 border-b border-white/5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                          <Zap className="w-4 h-4 text-purple-400" />
                          Compositor de Oferta Push
                        </CardTitle>
                        <CardDescription className="text-xs text-zinc-400">
                          Redacta o elige una plantilla de 1 clic para enviar a la Wallet.
                        </CardDescription>
                      </div>

                      {/* Badge Destinatario Actual */}
                      <div className="bg-surface-100 px-2.5 py-1 rounded border border-white/10 text-[11px] font-mono text-zinc-300">
                        Destinatario:{' '}
                        <span className="text-purple-300 font-bold">
                          {pushTargetMode === 'individual'
                            ? (deduplicatedCustomers.find((c) => c.id === (selectedPushCustomerId || deduplicatedCustomers[0]?.id))?.full_name || 'Selecciona un cliente')
                            : `Segmento (${pushSelectedSegment === 'all' ? 'Todos' : pushSelectedSegment})`}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-4">
                    {/* Plantillas Rápidas de 1 Clic */}
                    <div>
                      <label className="text-[11px] font-mono uppercase text-zinc-400 block mb-2 font-bold">
                        Plantillas Rápidas de 1 Clic (Promociones 2x1 y Cortesías):
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {PUSH_TEMPLATES.map((tmpl) => (
                          <button
                            key={tmpl.id}
                            type="button"
                            onClick={() => {
                              setPushTitle(tmpl.title);
                              setPushMessage(tmpl.message);
                              soundEngine.playScanSuccess();
                            }}
                            className="p-2 rounded-lg bg-surface-100 border border-white/10 hover:border-purple-500/50 hover:bg-purple-600/10 text-left transition-all group"
                          >
                            <span className="text-xs font-bold text-zinc-200 group-hover:text-purple-300 block truncate">
                              {tmpl.label}
                            </span>
                            <span className="text-[10px] text-zinc-400 block truncate mt-0.5">
                              {tmpl.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Formulario de Redacción */}
                    <form onSubmit={handleSendPushToCustomerOrSegment} className="space-y-3 font-mono text-xs">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-zinc-300 font-bold">Título de la Notificación:</label>
                          <span className="text-[10px] text-zinc-500">{pushTitle.length}/60 chars</span>
                        </div>
                        <input
                          type="text"
                          required
                          maxLength={60}
                          value={pushTitle}
                          onChange={(e) => setPushTitle(e.target.value)}
                          placeholder="Ej: ☕ ¡2x1 en Bebidas de Especialidad Hoy!"
                          className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-white font-sans text-xs focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-zinc-300 font-bold">Mensaje / Contenido en Pantalla:</label>
                          <span className="text-[10px] text-zinc-500">{pushMessage.length}/160 chars</span>
                        </div>
                        <textarea
                          rows={3}
                          required
                          maxLength={160}
                          value={pushMessage}
                          onChange={(e) => setPushMessage(e.target.value)}
                          placeholder="Ej: ¡Presenta este pase digital en barra y lleva 2 cafés por el precio de 1! Válido durante el día de hoy."
                          className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-white font-sans text-xs focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      {/* LIVE PHONE LOCKSCREEN PREVIEW */}
                      <div className="pt-2">
                        <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-2 font-bold flex items-center justify-between">
                          <span>Previsualización en Pantalla de Bloqueo del Teléfono:</span>
                          <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Google Wallet & Apple Wallet
                          </span>
                        </label>

                        {/* Marco de Pantalla de Bloqueo Estilizado */}
                        <div className="bg-black/90 rounded-2xl border border-white/15 p-4 shadow-2xl relative overflow-hidden">
                          {/* Barra de Estado del Smartphone */}
                          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pb-2 border-b border-white/5">
                            <span>10:42 AM</span>
                            <div className="flex items-center gap-1.5">
                              <span>5G</span>
                              <span>100%</span>
                            </div>
                          </div>

                          {/* Notificación Emergente Estilo Google Wallet Nativa */}
                          <div className="mt-3 bg-zinc-900/90 rounded-xl border border-white/10 p-3 shadow-lg transition-all">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-md bg-white flex items-center justify-center p-0.5 shadow-sm">
                                  {/* Icono Google Wallet estilizado */}
                                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none">
                                    <path d="M21 18v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
                                    <rect x="15" y="10" width="7" height="6" rx="2" stroke="#34A853" strokeWidth="2"/>
                                    <circle cx="18.5" cy="13" r="1" fill="#EA4335"/>
                                  </svg>
                                </div>
                                <span className="text-[11px] font-bold text-zinc-300 font-sans">
                                  Google Wallet · Café Canelo
                                </span>
                              </div>
                              <span className="text-[9px] text-zinc-500 font-mono">Ahora</span>
                            </div>

                            <p className="text-xs font-bold text-white font-sans">
                              {pushTitle || 'Título de la notificación...'}
                            </p>
                            <p className="text-[11px] text-zinc-300 font-sans mt-0.5 leading-relaxed">
                              {pushMessage || 'Cuerpo del mensaje promocional 2x1...'}
                            </p>

                            <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
                              <span>Toca para ver tu pase digital</span>
                              <span className="text-purple-400 font-bold">TEXT_AND_NOTIFY</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Botón de Envío Primario */}
                      <div className="pt-2">
                        <Button
                          type="submit"
                          variant="champagne"
                          size="lg"
                          disabled={isSendingPushNotification}
                          className="w-full font-bold shadow-glow-purple text-xs sm:text-sm py-3"
                        >
                          {isSendingPushNotification ? (
                            <span className="flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Transmitiendo notificación a la Wallet...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <Send className="w-4 h-4" />
                              {pushTargetMode === 'individual'
                                ? `Disparar Notificación Push a la Wallet de ${
                                    deduplicatedCustomers.find(
                                      (c) => c.id === (selectedPushCustomerId || deduplicatedCustomers[0]?.id)
                                    )?.full_name || 'Comensal'
                                  }`
                                : `Disparar Campaña Masiva a Wallets`}
                            </span>
                          )}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* HISTORIAL DE NOTIFICACIONES RECIENTES ENVIADAS */}
            <Card className="border border-white/10 bg-surface-200/90 shadow-xl">
              <CardHeader className="pb-3 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-purple-400" />
                    <CardTitle className="text-sm font-bold text-white">
                      Bitácora de Notificaciones Emitidas
                    </CardTitle>
                  </div>
                  <Badge variant="tactical" className="text-[10px]">
                    {pushHistoryLog.length} registros
                  </Badge>
                </div>
                <CardDescription className="text-xs text-zinc-400">
                  Historial de promociones 2x1 y mensajes disparados a tarjetas de clientes.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono min-w-[650px]">
                  <thead className="bg-surface-100 border-b border-white/5 text-zinc-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Fecha / Hora</th>
                      <th className="py-2.5 px-4">Destinatario</th>
                      <th className="py-2.5 px-4">Título Promocional</th>
                      <th className="py-2.5 px-4">Mensaje Enviado</th>
                      <th className="py-2.5 px-4 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pushHistoryLog.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                          {log.time}
                        </td>
                        <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                          {log.targetName}
                        </td>
                        <td className="py-3 px-4 text-purple-300 font-sans font-semibold">
                          {log.title}
                        </td>
                        <td className="py-3 px-4 text-zinc-300 font-sans max-w-xs truncate">
                          {log.body}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                            <CheckCheck className="w-3 h-3" />
                            Entregado a Wallet
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: AGENDA DE RESERVAS (CALENDARIO INTERACTIVO DÍA POR DÍA) */}
        {/* ============================================================== */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Agenda de Reservas</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Calendario interactivo día por día sincronizado con los pases Apple & Google Wallet.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/booking/cafe-canelo" target="_blank">
                  <Button variant="primary" size="sm" className="shadow-glow-purple">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Nueva Reserva en Mostrador
                  </Button>
                </Link>
              </div>
            </div>

            {/* Componente de Calendario Visual Estético Día por Día */}
            <ReservationsCalendarView reservations={reservations} />
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: AJUSTES & CONFIGURACIÓN (CON SUB-NAVBAR TÁCTICA) */}
        {/* ============================================================== */}
        {activeTab === 'settings' && !isAdmin && (
          <div className="py-12 flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400 shadow-glow-gold">
              <EyeOff className="w-8 h-8" />
            </div>
            <Badge variant="warning" className="mb-2">
              🛡️ Ceguera Financiera Infranqueable
            </Badge>
            <h3 className="text-xl font-bold text-white">Acceso Restringido para Perfil Staff</h3>
            <p className="text-xs text-zinc-400 mt-2 mb-6 leading-relaxed">
              La sección de Ajustes, Diseñador de Tarjeta y Gestión de PINs está reservada para el <strong>Admin Master</strong>.
            </p>
            <Button
              variant="tactical"
              size="md"
              onClick={() => handleToggleRole('admin')}
              className="gap-2"
            >
              <span>Conmutar a 👑 Admin Master (Prueba Rápida)</span>
            </Button>
          </div>
        )}

        {activeTab === 'settings' && isAdmin && (
          <div className="space-y-6">
            {/* Header General de Ajustes */}
            <div className="border-b border-white/[0.08] pb-4">
              <h2 className="text-2xl font-bold text-white">Ajustes & Configuración del Comercio</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Panel central de control: personalización de tarjetas, categorías de clientes, personal y seguridad.
              </p>
            </div>

            {/* ============================================================== */}
            {/* SUB-NAVBAR HORIZONTAL TÁCTICA DE CONFIGURACIONES */}
            {/* ============================================================== */}
            <div className="flex items-center gap-2 p-1.5 bg-surface-100 rounded-xl border border-white/10 overflow-x-auto font-mono text-xs">
              <button
                type="button"
                onClick={() => setSettingsSubTab('cards')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all font-semibold whitespace-nowrap ${
                  settingsSubTab === 'cards'
                    ? 'bg-purple-600 text-white shadow-glow-purple border border-purple-400/40'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <CreditCard className="w-4 h-4 text-champagne" />
                <span>Diseño de Tarjetas & Promos</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('tiers_customers')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all font-semibold whitespace-nowrap ${
                  settingsSubTab === 'tiers_customers'
                    ? 'bg-purple-600 text-white shadow-glow-purple border border-purple-400/40'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Crown className="w-4 h-4 text-amber-400" />
                <span>Categorías & Rangos de Clientes</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('staff_pins')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all font-semibold whitespace-nowrap ${
                  settingsSubTab === 'staff_pins'
                    ? 'bg-purple-600 text-white shadow-glow-purple border border-purple-400/40'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Users className="w-4 h-4 text-purple-300" />
                <span>Personal & PINs POS</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('security')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all font-semibold whitespace-nowrap ${
                  settingsSubTab === 'security'
                    ? 'bg-purple-600 text-white shadow-glow-purple border border-purple-400/40'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <span>Seguridad & Credenciales</span>
              </button>
            </div>

            {/* ============================================================== */}
            {/* SUB-TAB 1: DISEÑO DE TARJETAS ULTRA-PREMIUM & PROMOS */}
            {/* ============================================================== */}
            {settingsSubTab === 'cards' && (
              <div className="space-y-6 animate-in fade-in">
                {/* SELECTOR DE ARQUITECTURA DE PROGRAMA (MODO DE FIDELIZACIÓN) */}
                <div className="bg-surface-200 border border-white/10 rounded-2xl p-5 shadow-sm font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-purple-400" />
                        <span>Arquitectura del Programa de Fidelidad</span>
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Define si tu comercio opera con jerarquía de rangos progresivos o con una tarjeta única de marca personalizada.
                      </p>
                    </div>
                    <Badge variant="tactical" className="self-start sm:self-auto text-[10px]">
                      {loyaltyProgramModeInput === 'single_card' ? 'Modo: Tarjeta Única' : 'Modo: Rangos Multinivel'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Opción 1: Rangos Multinivel */}
                    <button
                      type="button"
                      onClick={() => setLoyaltyProgramModeInput('multi_tier')}
                      className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden ${
                        loyaltyProgramModeInput === 'multi_tier'
                          ? 'bg-purple-950/40 border-purple-400 shadow-glow-purple text-white ring-1 ring-purple-400/50'
                          : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-white hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Crown className={`w-4 h-4 ${loyaltyProgramModeInput === 'multi_tier' ? 'text-amber-400' : 'text-zinc-500'}`} />
                          <span className="font-bold text-xs uppercase tracking-wider text-white">
                            Sistema de Rangos Multinivel
                          </span>
                        </div>
                        {loyaltyProgramModeInput === 'multi_tier' && (
                          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                        4 Niveles progresivos (Bronce, Plata, Oro y Champion). Cada rango tiene su paleta de color exclusiva, beneficios crecientes y descuentos automáticos.
                      </p>
                    </button>

                    {/* Opción 2: Tarjeta Única de Marca */}
                    <button
                      type="button"
                      onClick={() => setLoyaltyProgramModeInput('single_card')}
                      className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden ${
                        loyaltyProgramModeInput === 'single_card'
                          ? 'bg-purple-950/40 border-purple-400 shadow-glow-purple text-white ring-1 ring-purple-400/50'
                          : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-white hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CreditCard className={`w-4 h-4 ${loyaltyProgramModeInput === 'single_card' ? 'text-champagne' : 'text-zinc-500'}`} />
                          <span className="font-bold text-xs uppercase tracking-wider text-white">
                            Tarjeta Única de Marca Personalizada
                          </span>
                        </div>
                        {loyaltyProgramModeInput === 'single_card' && (
                          <span className="w-2 h-2 rounded-full bg-champagne animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                        Tarjeta de autor con la estética pura de tu tienda, morfología de esquinas (Sharp 90°, Bisel 45°, Curva o Muescas), degradados PBR y premios por hitos acumulados.
                      </p>
                    </button>
                  </div>
                </div>

                {/* GRID DE PERSONALIZACIÓN & PREVISUALIZACIÓN */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Panel de Controles Ultra-Premium */}
                  <div className="lg:col-span-6 bg-surface-200 border border-white/10 rounded-2xl p-5 space-y-5 shadow-sm text-xs font-mono">
                    <div className="border-b border-white/10 pb-3">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Palette className="w-4 h-4 text-champagne" />
                        <span>
                          {loyaltyProgramModeInput === 'single_card'
                            ? 'Estilizado de Tarjeta Única de Marca'
                            : 'Personalizador Visual de Pases Digitales'}
                        </span>
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Morfología anti-clones, degradados PBR y físicas de autor sincronizadas con Apple & Google Wallet.
                      </p>
                    </div>

                    {/* SECCIÓN ESPECÍFICA DE MODO TARJETA ÚNICA */}
                    {loyaltyProgramModeInput === 'single_card' && (
                      <>
                        {/* 1. SELECTOR DE MORFOLOGÍA DE ESQUINAS */}
                        <div>
                          <label className="text-zinc-300 block mb-2 font-bold flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Square className="w-3.5 h-3.5 text-purple-400" />
                              <span>Morfología de Esquinas (Anti-Clones):</span>
                            </span>
                            <span className="text-[10px] text-purple-300 font-bold uppercase">
                              {MORPHOLOGY_OPTIONS.find((m) => m.id === cardMorphologyInput)?.label}
                            </span>
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {MORPHOLOGY_OPTIONS.map((morph) => (
                              <button
                                key={morph.id}
                                type="button"
                                onClick={() => setCardMorphologyInput(morph.id)}
                                className={`p-2.5 rounded-lg border text-left transition-all ${
                                  cardMorphologyInput === morph.id
                                    ? 'bg-purple-600/30 border-purple-400 text-white shadow-glow-purple'
                                    : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-white'
                                }`}
                              >
                                <span className="font-bold text-white block text-[11px]">{morph.label}</span>
                                <span className="text-[9px] text-zinc-500 block mt-0.5">{morph.desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 2. SELECTOR DE DEGRADADOS CANÓNICOS PBR */}
                        <div>
                          <label className="text-zinc-300 block mb-2 font-bold flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-champagne" />
                              <span>Paleta de Degradados PBR Canónicos:</span>
                            </span>
                            <span className="text-[10px] text-champagne font-bold">
                              {cardGradientInput.preset.toUpperCase()}
                            </span>
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {GRADIENT_PRESETS.map((grad) => (
                              <button
                                key={grad.id}
                                type="button"
                                onClick={() =>
                                  setCardGradientInput({
                                    preset: grad.id,
                                    from: grad.from,
                                    via: grad.via,
                                    to: grad.to,
                                    angle: grad.angle,
                                  })
                                }
                                className={`p-2.5 rounded-lg border text-left transition-all flex items-start gap-2.5 ${
                                  cardGradientInput.preset === grad.id
                                    ? 'bg-purple-600/30 border-purple-400 text-white shadow-glow-purple'
                                    : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-white'
                                }`}
                              >
                                <div
                                  className="w-6 h-6 rounded border border-white/20 shrink-0 shadow-sm"
                                  style={{
                                    background: `linear-gradient(${grad.angle}deg, ${grad.from}, ${grad.via || grad.to}, ${grad.to})`,
                                  }}
                                />
                                <div className="min-w-0">
                                  <span className="font-bold text-white block text-[11px] truncate">
                                    {grad.name}
                                  </span>
                                  <span className="text-[9px] text-zinc-500 block truncate">
                                    {grad.desc}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Ajuste Fino de Degradado */}
                          <div className="mt-2.5 p-2.5 bg-surface-100 rounded-lg border border-white/5 flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-zinc-400">Color A:</span>
                              <input
                                type="color"
                                value={cardGradientInput.from}
                                onChange={(e) =>
                                  setCardGradientInput({ ...cardGradientInput, from: e.target.value, preset: 'custom' })
                                }
                                className="w-6 h-6 rounded bg-transparent border border-white/10 cursor-pointer p-0"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-zinc-400">Color B:</span>
                              <input
                                type="color"
                                value={cardGradientInput.to}
                                onChange={(e) =>
                                  setCardGradientInput({ ...cardGradientInput, to: e.target.value, preset: 'custom' })
                                }
                                className="w-6 h-6 rounded bg-transparent border border-white/10 cursor-pointer p-0"
                              />
                            </div>
                            <div className="flex-1 flex items-center gap-1.5 justify-end">
                              <span className="text-[10px] text-zinc-400">Ángulo:</span>
                              <select
                                value={cardGradientInput.angle || 135}
                                onChange={(e) =>
                                  setCardGradientInput({ ...cardGradientInput, angle: Number(e.target.value) })
                                }
                                className="bg-black/60 border border-white/10 rounded px-2 py-1 text-white text-[10px]"
                              >
                                <option value={90}>90° (Vertical)</option>
                                <option value={135}>135° (Diagonal)</option>
                                <option value={180}>180° (Horizontal)</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* 3. ESCALERA DINÁMICA DE PREMIOS POR HITOS */}
                        <div className="p-3 bg-surface-100 rounded-xl border border-white/10 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-white text-[11px] flex items-center gap-1.5">
                                <Award className="w-3.5 h-3.5 text-amber-400" />
                                <span>Escalera de Premios por Hitos (Regalos sin Descontar Sellos)</span>
                              </h4>
                              <p className="text-[10px] text-zinc-400 font-sans mt-0.5">
                                Regalos intermedios que los clientes reclaman manteniendo su acumulado hacia la meta.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="tactical"
                              size="sm"
                              onClick={() => setIsAddingMilestone(!isAddingMilestone)}
                              className="text-[10px] py-1 px-2"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              {isAddingMilestone ? 'Cerrar' : 'Agregar Hito'}
                            </Button>
                          </div>

                          {/* Formulario Inline para Añadir Hito */}
                          {isAddingMilestone && (
                            <div className="p-3 bg-black/60 rounded-lg border border-purple-500/30 space-y-2.5 animate-in fade-in">
                              <span className="text-[10px] font-bold text-purple-300 uppercase block">
                                Configurar Nuevo Hito de Premio:
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[9px] text-zinc-400 block mb-1">Alcanzar Sello #</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={stampsNeededInput}
                                    value={newMilestoneStamp}
                                    onChange={(e) => setNewMilestoneStamp(Number(e.target.value))}
                                    className="w-full bg-surface-100 border border-white/10 rounded px-2.5 py-1.5 text-white"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="text-[9px] text-zinc-400 block mb-1">Premio / Cortesía</label>
                                  <input
                                    type="text"
                                    placeholder="Ej: Galleta de Avena o Shot de Espresso"
                                    value={newMilestoneReward}
                                    onChange={(e) => setNewMilestoneReward(e.target.value)}
                                    className="w-full bg-surface-100 border border-white/10 rounded px-2.5 py-1.5 text-white font-sans"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-zinc-400">Icono:</span>
                                  <select
                                    value={newMilestoneIcon}
                                    onChange={(e) => setNewMilestoneIcon(e.target.value)}
                                    className="bg-surface-100 border border-white/10 rounded px-2 py-1 text-white text-[10px]"
                                  >
                                    <option value="coffee">☕ Café</option>
                                    <option value="cookie">🍪 Galleta</option>
                                    <option value="cup">🥤 Bebida</option>
                                    <option value="gift">🎁 Regalo</option>
                                    <option value="trophy">🏆 Trofeo</option>
                                    <option value="star">⭐ Estrella</option>
                                  </select>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsAddingMilestone(false)}
                                    className="text-[10px] py-1 px-2"
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    onClick={handleAddMilestone}
                                    className="text-[10px] py-1 px-2 shadow-glow-purple"
                                  >
                                    Guardar Hito
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Lista de Hitos Actuales */}
                          {rewardMilestonesInput.length === 0 ? (
                            <p className="text-[10px] text-zinc-500 italic py-1">
                              No hay hitos intermedios configurados. Solo se otorgará la recompensa base final.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {rewardMilestonesInput.map((ms) => (
                                <div
                                  key={ms.id || ms.stamp_number}
                                  className="flex items-center justify-between p-2 rounded-lg bg-surface-200 border border-white/5 text-[11px]"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="px-1.5 py-0.5 rounded bg-purple-600/30 border border-purple-400/40 text-purple-300 font-bold text-[10px]">
                                      Sello #{ms.stamp_number}
                                    </span>
                                    <span className="text-white truncate font-sans">{ms.reward}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMilestone(ms.stamp_number)}
                                    className="p-1 hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 rounded transition-colors ml-2"
                                    title="Eliminar hito"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* SELECTOR DE PATRÓN DE LÍNEAS & DETALLES (COMÚN) */}
                    <div>
                      <label className="text-zinc-300 block mb-2 font-bold flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-400" />
                        <span>Estilo de Líneas & Tramas de Seguridad:</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'guilloche', label: 'Guilloché Ondulado', desc: 'Curvas de alta seguridad' },
                          { id: 'grid_matrix', label: 'Malla Táctica', desc: 'Cuadrícula con miras' },
                          { id: 'brushed_titanium', label: 'Titanio Cepillado', desc: 'Rayado fino metálico' },
                          { id: 'luxury_filigree', label: 'Filigrana de Lujo', desc: 'Doble marco biselado' },
                          { id: 'carbon_fiber', label: 'Fibra de Carbono', desc: 'Tejido mate de fibra' },
                        ].map((pat) => (
                          <button
                            key={pat.id}
                            type="button"
                            onClick={() => setCardPatternInput(pat.id as CardPattern)}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              cardPatternInput === pat.id
                                ? 'bg-purple-600/30 border-purple-400 text-white shadow-glow-purple'
                                : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-white'
                            }`}
                          >
                            <span className="font-bold text-white block text-[11px]">{pat.label}</span>
                            <span className="text-[9px] text-zinc-500">{pat.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* TOGGLES: CHIP EMV Y SELLO HOLOGRÁFICO */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-surface-100 rounded-xl border border-white/5">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                          <Cpu className="w-3.5 h-3.5 text-amber-400" />
                          <span>Chip EMV Oro</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={showEmvChipInput}
                          onChange={(e) => setShowEmvChipInput(e.target.checked)}
                          className="toggle-checkbox accent-purple-500 w-4 h-4 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                          <Sparkles className="w-3.5 h-3.5 text-champagne" />
                          <span>Sello Holograma</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={showHologramInput}
                          onChange={(e) => setShowHologramInput(e.target.checked)}
                          className="toggle-checkbox accent-purple-500 w-4 h-4 cursor-pointer"
                        />
                      </label>
                    </div>

                    {/* Color Primario de Marca (Acento) */}
                    <div>
                      <label className="text-zinc-300 block mb-2 font-bold">Color Primario de Acento / Marca</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={brandColorInput}
                          onChange={(e) => setBrandColorInput(e.target.value)}
                          className="w-10 h-10 rounded-lg bg-surface-100 border border-white/10 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={brandColorInput}
                          onChange={(e) => setBrandColorInput(e.target.value)}
                          className="flex-1 bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-white font-mono"
                        />
                      </div>

                      {/* Presets Canónicos de Juan Pablo Orozco */}
                      <div className="flex gap-2 mt-2">
                        {[
                          { name: 'Púrpura PBR', hex: '#8b5cf6' },
                          { name: 'Oro Champaña', hex: '#d4a373' },
                          { name: 'Esmeralda', hex: '#10b981' },
                          { name: 'Titanio', hex: '#71717a' },
                        ].map((preset) => (
                          <button
                            key={preset.hex}
                            type="button"
                            onClick={() => setBrandColorInput(preset.hex)}
                            className="px-2 py-1 rounded bg-surface-100 hover:bg-white/5 border border-white/10 text-[10px] text-zinc-300 flex items-center gap-1.5"
                          >
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: preset.hex }} />
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sellos Necesarios */}
                    <div>
                      <label className="text-zinc-300 block mb-1 font-bold">Sellos Necesarios para Recompensa Final</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[6, 8, 10, 12].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setStampsNeededInput(num)}
                            className={`py-2 rounded-lg border text-xs font-mono font-bold transition-all ${
                              stampsNeededInput === num
                                ? 'bg-purple-500/20 border-purple-400 text-white shadow-glow-purple'
                                : 'bg-surface-100 border-white/5 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {num} Sellos
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Descripción de Recompensa Final */}
                    <div>
                      <label className="text-zinc-300 block mb-1 font-bold">Descripción de Recompensa Meta (Final)</label>
                      <input
                        type="text"
                        value={rewardDescInput}
                        onChange={(e) => setRewardDescInput(e.target.value)}
                        placeholder="Ej: Café de Especialidad + Croissant de Almendras"
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-white font-sans"
                      />
                    </div>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleSaveCardDesign}
                      className="w-full font-bold shadow-glow-purple"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Guardar y Sincronizar Tarjetas en Vivo
                    </Button>
                  </div>

                  {/* Previsualización en Vivo Dinámica con Selector de Rango */}
                  <div className="lg:col-span-6 flex flex-col items-center">
                    <div className="w-full flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                        {loyaltyProgramModeInput === 'single_card'
                          ? 'Previsualización: Tarjeta Única de Marca (Titular)'
                          : 'Previsualización por Rango de Cliente:'}
                      </span>
                      <span className="text-[10px] font-mono text-purple-400 font-bold uppercase">
                        {loyaltyProgramModeInput === 'single_card'
                          ? 'Titular Oficial'
                          : designerPreviewTier}
                      </span>
                    </div>

                    {/* Selector de Rango para Testear la Tarjeta (Solo visible en modo multinivel) */}
                    {loyaltyProgramModeInput === 'multi_tier' && (
                      <div className="grid grid-cols-4 gap-1.5 p-1 bg-surface-100 rounded-lg border border-white/10 mb-3 w-full">
                        {[
                          { id: 'bronze', label: '🥉 Bronce' },
                          { id: 'silver', label: '🥈 Plata' },
                          { id: 'gold', label: '🥇 Oro' },
                          { id: 'champion', label: '👑 Champion' },
                        ].map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setDesignerPreviewTier(t.id as LoyaltyTier)}
                            className={cn(
                              'py-1 px-1.5 rounded text-[10px] font-mono font-bold transition-all text-center',
                              designerPreviewTier === t.id
                                ? 'bg-purple-600/40 border border-purple-400 text-white shadow-sm'
                                : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <LivePassPreview
                      merchantName={store.merchant.name}
                      customerName="Carlos Mendoza"
                      passSerialNumber="PASS-CANELO-001"
                      currentStamps={stampsNeededInput - 2}
                      totalNeeded={Number(stampsNeededInput)}
                      rewardDescription={rewardDescInput}
                      passType="apple"
                      brandColor={brandColorInput}
                      loyaltyTier={designerPreviewTier}
                      totalRewardsRedeemed={
                        designerPreviewTier === 'champion' ? 12 :
                        designerPreviewTier === 'gold' ? 6 :
                        designerPreviewTier === 'silver' ? 3 : 0
                      }
                      customReward={
                        designerPreviewTier === 'champion' ? 'Bolsa de Café Geisha 250g' :
                        designerPreviewTier === 'gold' ? 'Croissant Almendras de Cortesía' : null
                      }
                      discountPercentage={
                        designerPreviewTier === 'champion' ? 15 :
                        designerPreviewTier === 'gold' ? 10 : null
                      }
                      cardPattern={cardPatternInput}
                      showEmvChip={showEmvChipInput}
                      showHologram={showHologramInput}
                      loyaltyProgramMode={loyaltyProgramModeInput}
                      cardMorphology={cardMorphologyInput}
                      cardGradient={cardGradientInput}
                      rewardMilestones={rewardMilestonesInput}
                    />
                  </div>
                </div>

                {/* EDITOR DE LAS 3 OPCIONES PRECONFIGURADAS DE PROMOCIÓN */}
                <Card className="border-purple-500/20">
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Gift className="w-4 h-4 text-champagne" />
                          <span>Las 3 Opciones Preconfiguradas de Promoción / Cortesía</span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Opciones fijas que se ofrecen a clientes Bronce y Plata en su ficha de fidelidad.
                        </CardDescription>
                      </div>
                      <Button variant="tactical" size="sm" onClick={handleSavePromoOptions}>
                        <Save className="w-3.5 h-3.5 mr-1" />
                        Guardar Opciones
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                      <div className="p-3 bg-surface-100 rounded-lg border border-white/5 space-y-1.5">
                        <span className="text-[10px] font-bold text-purple-400 uppercase block">Opción #1:</span>
                        <input
                          type="text"
                          value={promoOptions[0]}
                          onChange={(e) => setPromoOptions([e.target.value, promoOptions[1], promoOptions[2]])}
                          className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-white"
                        />
                      </div>

                      <div className="p-3 bg-surface-100 rounded-lg border border-white/5 space-y-1.5">
                        <span className="text-[10px] font-bold text-purple-400 uppercase block">Opción #2:</span>
                        <input
                          type="text"
                          value={promoOptions[1]}
                          onChange={(e) => setPromoOptions([promoOptions[0], e.target.value, promoOptions[2]])}
                          className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-white"
                        />
                      </div>

                      <div className="p-3 bg-surface-100 rounded-lg border border-white/5 space-y-1.5">
                        <span className="text-[10px] font-bold text-purple-400 uppercase block">Opción #3:</span>
                        <input
                          type="text"
                          value={promoOptions[2]}
                          onChange={(e) => setPromoOptions([promoOptions[0], promoOptions[1], e.target.value])}
                          className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-white"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-TAB 2: CATEGORÍAS & RANGOS DE CLIENTES (CON CAMBIO MANUAL) */}
            {/* ============================================================== */}
            {settingsSubTab === 'tiers_customers' && (
              <div className="space-y-6 animate-in fade-in">
                {/* 1. Umbrales de Rangos de Fidelidad */}
                <Card className="border-purple-500/30">
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-champagne" />
                          <span>Umbrales de Rangos de Fidelidad (Tiers)</span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Define el número de bonos redimidos necesarios para que un cliente suba de nivel automáticamente.
                        </CardDescription>
                      </div>
                      <Button variant="tactical" size="sm" onClick={handleSaveTierConfig}>
                        <Save className="w-3.5 h-3.5 mr-1" />
                        Guardar Umbrales
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                      {/* Bronce */}
                      <div className="p-3 rounded-lg bg-surface-100 border border-amber-700/30 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-600 font-bold">
                          <Crown className="w-3.5 h-3.5" />
                          <span>BRONCE</span>
                        </div>
                        <p className="text-[10px] text-zinc-400">Mínimo canjes:</p>
                        <input
                          type="number"
                          min="0"
                          value={tierConfig.bronzeMin}
                          onChange={(e) => setTierConfig({ ...tierConfig, bronzeMin: Number(e.target.value) })}
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white font-bold"
                        />
                      </div>

                      {/* Plata */}
                      <div className="p-3 rounded-lg bg-surface-100 border border-slate-400/30 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                          <Crown className="w-3.5 h-3.5" />
                          <span>PLATA</span>
                        </div>
                        <p className="text-[10px] text-zinc-400">Mínimo canjes:</p>
                        <input
                          type="number"
                          min="1"
                          value={tierConfig.silverMin}
                          onChange={(e) => setTierConfig({ ...tierConfig, silverMin: Number(e.target.value) })}
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white font-bold"
                        />
                      </div>

                      {/* Oro */}
                      <div className="p-3 rounded-lg bg-surface-100 border border-amber-500/30 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                          <Crown className="w-3.5 h-3.5" />
                          <span>ORO</span>
                        </div>
                        <p className="text-[10px] text-zinc-400">Mínimo canjes:</p>
                        <input
                          type="number"
                          min="2"
                          value={tierConfig.goldMin}
                          onChange={(e) => setTierConfig({ ...tierConfig, goldMin: Number(e.target.value) })}
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white font-bold"
                        />
                      </div>

                      {/* Champion */}
                      <div className="p-3 rounded-lg bg-surface-100 border border-purple-500/40 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                          <Crown className="w-3.5 h-3.5" />
                          <span>CHAMPION VIP</span>
                        </div>
                        <p className="text-[10px] text-zinc-400">Mínimo canjes:</p>
                        <input
                          type="number"
                          min="3"
                          value={tierConfig.championMin}
                          onChange={(e) => setTierConfig({ ...tierConfig, championMin: Number(e.target.value) })}
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white font-bold text-purple-300"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Directorio de Clientes con Cambio Manual de Rango (Protegido con AdminMaster2026@) */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-purple-400" />
                          <span>Gestión Manual de Rango por Cliente</span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Puedes ascender o ajustar el rango de cualquier cliente de forma discrecional. Por seguridad, la acción exige ingresar la contraseña de seguridad maestra (<code>AdminMaster2026@</code>).
                        </CardDescription>
                      </div>
                      <Badge variant="tactical">
                        {customers.length} miembros registrados
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono min-w-[650px]">
                      <thead className="bg-surface-100 border-b border-white/5 text-zinc-400 uppercase">
                        <tr>
                          <th className="py-3 px-4">Cliente</th>
                          <th className="py-3 px-4">Teléfono</th>
                          <th className="py-3 px-4">Bonos Redimidos</th>
                          <th className="py-3 px-4">Rango Actual</th>
                          <th className="py-3 px-4 text-right">Modificar Rango (Clave Maestra)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {customers.map((c) => {
                          const pass = passes.find((p) => p.customer_id === c.id);
                          const rewardsRedeemed = pass?.total_rewards_redeemed || 0;
                          const currentTier = c.loyalty_tier || calculateCustomerTier(rewardsRedeemed, tierConfig);
                          const tierMeta = getTierMeta(currentTier);

                          return (
                            <tr key={c.id} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-4 font-sans font-semibold text-white">
                                {c.full_name}
                              </td>
                              <td className="py-3 px-4 text-zinc-400">
                                {c.phone}
                              </td>
                              <td className="py-3 px-4 font-bold text-champagne-light">
                                {rewardsRedeemed} bonos
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm',
                                    tierMeta.bgColor,
                                    tierMeta.color,
                                    tierMeta.borderColor
                                  )}
                                >
                                  <Crown className="w-3 h-3" style={{ color: tierMeta.hex }} />
                                  {tierMeta.label}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {(['bronze', 'silver', 'gold', 'champion'] as LoyaltyTier[]).map((tierKey) => {
                                    const isCurrent = currentTier === tierKey;
                                    const meta = getTierMeta(tierKey);
                                    return (
                                      <button
                                        key={tierKey}
                                        type="button"
                                        disabled={isCurrent}
                                        onClick={() => {
                                          setTierChangeTarget({ customer: c, newTier: tierKey });
                                          setTierChangeSecurityKey('');
                                        }}
                                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                                          isCurrent
                                            ? 'opacity-35 cursor-not-allowed bg-white/5 border border-white/5 text-zinc-500'
                                            : 'hover:scale-105 bg-surface-100 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white'
                                        }`}
                                        title={`Cambiar a ${meta.label}`}
                                      >
                                        {tierKey.substring(0, 3)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* MODAL DE SEGURIDAD: CAMBIO MANUAL DE RANGO (EXIGE AdminMaster2026@) */}
                {tierChangeTarget && (() => {
                  const newMeta = getTierMeta(tierChangeTarget.newTier);
                  return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                      <div className="w-full max-w-md bg-surface-200 border border-purple-500/40 rounded-xl p-5 text-left shadow-2xl relative">
                        <button
                          onClick={() => setTierChangeTarget(null)}
                          className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/10">
                          <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                            <Crown className="w-5 h-5 text-champagne" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white">Autorización Maestra de Rango</h3>
                            <p className="text-[11px] text-zinc-400">
                              Modificando rango de <strong>{tierChangeTarget.customer.full_name}</strong> a{' '}
                              <span className="text-purple-300 font-bold">{newMeta.label}</span>
                            </p>
                          </div>
                        </div>

                        <form onSubmit={handleConfirmTierChangeWithMasterKey} className="space-y-4 text-xs font-mono">
                          <div className="p-3 bg-purple-950/20 rounded-lg border border-purple-500/20 text-zinc-300 space-y-1">
                            <span className="text-[10px] text-purple-300 font-bold block uppercase tracking-wider">
                              Confirmación de Seguridad Requerida
                            </span>
                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                              Esta acción ascenderá o ajustará el nivel del miembro en su Apple & Google Wallet y actualizará sus beneficios en el POS.
                            </p>
                          </div>

                          <div>
                            <label className="text-zinc-300 block mb-1 font-bold">
                              Contraseña de Seguridad Maestra *
                            </label>
                            <input
                              type="password"
                              required
                              autoFocus
                              value={tierChangeSecurityKey}
                              onChange={(e) => setTierChangeSecurityKey(e.target.value)}
                              placeholder="Ingresa AdminMaster2026@"
                              className="w-full bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-purple-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-zinc-500 mt-1 block">
                              Por norma de auditoría: <code>AdminMaster2026@</code>
                            </span>
                          </div>

                          <div className="pt-2 flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="md"
                              onClick={() => setTierChangeTarget(null)}
                              className="flex-1"
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="submit"
                              variant="primary"
                              size="md"
                              className="flex-1 font-bold shadow-glow-purple"
                            >
                              Confirmar & Cambiar
                            </Button>
                          </div>
                        </form>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-TAB 3: PERSONAL AUTORIZADO & PINES POS */}
            {/* ============================================================== */}
            {settingsSubTab === 'staff_pins' && (
              <div className="space-y-6 animate-in fade-in">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Users className="w-4 h-4 text-champagne" />
                          <span>Personal Autorizado, PINs & Contraseñas DSB</span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Cada operador tiene su PIN de 4 dígitos para el escáner POS (/#/scan) y su contraseña para ingresar al DSB.
                        </CardDescription>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsAddingEmp(!isAddingEmp)}
                        className="text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {isAddingEmp ? 'Cancelar' : 'Añadir Empleado'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isAddingEmp && (
                      <form onSubmit={handleAddNewEmployee} className="p-4 bg-surface-100 rounded-xl border border-purple-500/30 space-y-3 text-xs font-mono">
                        <h4 className="font-bold text-white">Nuevo Empleado / Cajero</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-zinc-400 block mb-1">Nombre</label>
                            <input
                              type="text"
                              required
                              placeholder="Ej: Carlos"
                              value={newEmpName}
                              onChange={(e) => setNewEmpName(e.target.value)}
                              className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-400 block mb-1">Rol</label>
                            <select
                              value={newEmpRole}
                              onChange={(e) => setNewEmpRole(e.target.value as 'cashier' | 'manager')}
                              className="w-full bg-black/60 border border-white/10 rounded px-2 py-1.5 text-white"
                            >
                              <option value="cashier">Cajero / Staff</option>
                              <option value="manager">Gerente / Supervisor</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-400 block mb-1">PIN Escáner (4 dígitos)</label>
                            <input
                              type="text"
                              required
                              maxLength={4}
                              placeholder="Ej: 5678"
                              value={newEmpPin}
                              onChange={(e) => setNewEmpPin(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-400 block mb-1">Contraseña DSB</label>
                            <input
                              type="text"
                              required
                              placeholder="Mínimo 4 caracteres"
                              value={newEmpDsbPassword}
                              onChange={(e) => setNewEmpDsbPassword(e.target.value)}
                              className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-white font-mono"
                            />
                          </div>
                        </div>
                        <Button type="submit" variant="primary" size="sm" className="w-full font-bold">
                          Guardar Empleado con PIN y Clave DSB
                        </Button>
                      </form>
                    )}

                    <div className="space-y-2 text-xs font-mono">
                      {employees.map((emp) => (
                        <div
                          key={emp.id}
                          className="p-3 bg-surface-100 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white font-sans">{emp.name}</span>
                              <Badge variant={emp.role === 'manager' || emp.role === 'admin' ? 'tactical' : 'default'}>
                                {emp.role === 'manager' || emp.role === 'admin' ? 'Gerente' : 'Cajero'}
                              </Badge>
                            </div>
                            <span className="text-[10px] text-zinc-500 block mt-0.5">
                              ID: {emp.id} · Clave DSB: <code>{emp.dsb_password || 'staff123'}</code>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 bg-black/60 px-2.5 py-1 rounded border border-white/10">
                              <span className="text-[10px] text-zinc-400">PIN POS:</span>
                              <input
                                type="text"
                                maxLength={4}
                                defaultValue={emp.pin_hash}
                                onBlur={(e) => {
                                  if (e.target.value !== emp.pin_hash && e.target.value.length === 4) {
                                    handleUpdateEmployeePin(emp.id, e.target.value);
                                  }
                                }}
                                className="w-12 bg-transparent text-center font-mono font-bold text-champagne focus:outline-none"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteEmployee(emp.id)}
                              className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Eliminar Empleado"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-TAB 4: SEGURIDAD, CREDENCIALES & ANTIFRAUDE */}
            {/* ============================================================== */}
            {settingsSubTab === 'security' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                {/* Cambio de Contraseña Maestra Admin */}
                <Card className="border-purple-500/30">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-purple-400" />
                      <span>Cambiar Contraseña Maestra de Admin</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Requiere ingresar obligatoriamente la <strong>Contraseña de Seguridad Maestra</strong> (<code>AdminMaster2026@</code>) para autorizar el cambio.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleChangeAdminPasswordWithMasterKey} className="space-y-3 text-xs font-mono">
                      <div>
                        <label className="text-zinc-300 block mb-1">Contraseña de Seguridad Maestra *</label>
                        <input
                          type="password"
                          required
                          value={securityKeyInput}
                          onChange={(e) => setSecurityKeyInput(e.target.value)}
                          placeholder="Ingresa AdminMaster2026@"
                          className="w-full bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-zinc-300 block mb-1">Nueva Contraseña de Admin *</label>
                        <input
                          type="text"
                          required
                          value={newAdminPasswordInput}
                          onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                          placeholder="Mínimo 4 caracteres"
                          className="w-full bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-white font-mono"
                        />
                      </div>

                      <Button type="submit" variant="primary" size="md" className="w-full font-bold shadow-glow-purple">
                        Validar Seguridad & Actualizar Contraseña
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Parámetros Operativos del Local (Cooldown & Geocerca) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Parámetros Operativos Antifraude</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Candados de geocerca y cooldown entre consumos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs font-mono">
                    <div>
                      <label className="text-zinc-300 block mb-1">Cooldown Temporal (Horas de Espera)</label>
                      <select
                        value={cooldownHoursInput}
                        onChange={(e) => setCooldownHoursInput(Number(e.target.value))}
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-white font-mono"
                      >
                        <option value={1}>1 Hora entre sellos</option>
                        <option value={2}>2 Horas entre sellos</option>
                        <option value={3}>3 Horas entre sellos (Recomendado)</option>
                        <option value={6}>6 Horas entre sellos</option>
                        <option value={12}>12 Horas entre sellos</option>
                        <option value={24}>24 Horas entre sellos</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-zinc-300 block mb-1">Radio de Geocerca del Escáner POS</label>
                      <select
                        value={geofenceMetersInput}
                        onChange={(e) => setGeofenceMetersInput(Number(e.target.value))}
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-white font-mono"
                      >
                        <option value={50}>50 Metros (Estricto)</option>
                        <option value={100}>100 Metros</option>
                        <option value={250}>250 Metros (Estándar local)</option>
                        <option value={500}>500 Metros (Centro comercial)</option>
                      </select>
                    </div>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleSaveOperationalSecurity}
                      className="w-full font-bold"
                    >
                      <Save className="w-3.5 h-3.5 mr-1" />
                      Guardar Cooldown & Geocerca
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
