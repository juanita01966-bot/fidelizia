'use client';

import React, { useState, useRef, useCallback } from 'react';
import { 
  Sparkles, 
  MapPin, 
  RotateCw, 
  Calendar, 
  Gift, 
  ShieldCheck, 
  Smartphone,
  Crown, 
  Percent, 
  Shield, 
  QrCode,
  Award,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { StampsVisualizer } from './StampsVisualizer';
import { 
  LoyaltyTier, 
  CardPattern, 
  LoyaltyProgramMode, 
  CardMorphology, 
  CardGradientConfig,
  RewardMilestone 
} from '@/types/domain';
import { getTierMeta } from '@/lib/store/fidelizia-store';
import { cn } from '@/lib/utils';

export interface LivePassPreviewProps {
  merchantName: string;
  customerName: string;
  passSerialNumber: string;
  currentStamps: number;
  totalNeeded: number;
  rewardDescription: string;
  passType: 'apple' | 'google';
  brandColor?: string;
  loyaltyTier?: LoyaltyTier;
  loyaltyProgramMode?: LoyaltyProgramMode;
  cardMorphology?: CardMorphology;
  cardGradient?: CardGradientConfig;
  rewardMilestones?: RewardMilestone[];
  totalRewardsRedeemed?: number;
  customReward?: string | null;
  discountPercentage?: number | null;
  nextReservationDate?: string | null;
  locationAddress?: string;
  cardPattern?: CardPattern;
  showEmvChip?: boolean;
  showHologram?: boolean;
  className?: string;
}

// Generador de matriz de QR en SVG nativo sin dependencias externas
function SvgQrCode({ value, size = 130 }: { value: string; size?: number }) {
  const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const grid = 21;
  const cells: boolean[][] = [];

  for (let r = 0; r < grid; r++) {
    cells[r] = [];
    for (let c = 0; c < grid; c++) {
      const isTopLeft = r < 7 && c < 7;
      const isTopRight = r < 7 && c >= grid - 7;
      const isBottomLeft = r >= grid - 7 && c < 7;

      if (isTopLeft || isTopRight || isBottomLeft) {
        const localR = isTopLeft ? r : isTopRight ? r : r - (grid - 7);
        const localC = isTopLeft ? c : isTopRight ? c - (grid - 7) : c;
        const isBorder = localR === 0 || localR === 6 || localC === 0 || localC === 6;
        const isCenter = localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4;
        cells[r][c] = isBorder || isCenter;
      } else {
        const bit = ((hash * (r + 1) * (c + 1) * 31) % 100) > 48;
        cells[r][c] = bit;
      }
    }
  }

  const cellSize = size / grid;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="bg-white p-2 rounded-lg shadow-md">
      {cells.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#09090b"
            />
          ) : null
        )
      )}
    </svg>
  );
}

// Micro-Chip EMV Virtual con Acabado Adaptado al Rango y Micro-Líneas Láser
function EmvChip({ 
  gradient = 'from-amber-200 via-amber-400 to-amber-600',
  border = 'border-amber-300/60'
}: { 
  gradient?: string;
  border?: string;
}) {
  return (
    <div className={cn("w-11 h-8 rounded-md p-0.5 shadow-md relative overflow-hidden shrink-0 border", bgGradientOrClass(gradient), border)}>
      <div className="w-full h-full bg-black/25 backdrop-blur-[1px] rounded-[4px] relative flex flex-col justify-between p-1">
        {/* Contactos de circuito impreso grabado en oro */}
        <div className="w-full h-[1px] bg-black/50" />
        <div className="w-full h-[1px] bg-black/50" />
        <div className="absolute inset-x-2.5 top-0 bottom-0 border-x border-black/50" />
        <div className="w-3.5 h-2.5 mx-auto rounded-full border border-black/50 bg-white/20 shadow-inner" />
      </div>
    </div>
  );
}

function bgGradientOrClass(grad: string) {
  if (grad.startsWith('from-')) {
    return `bg-gradient-to-br ${grad}`;
  }
  return grad;
}

// Ondas de Radiofrecuencia NFC / Contactless
function NfcContactlessWave({ color = '#d4a373' }: { color?: string }) {
  return (
    <svg width="15" height="18" viewBox="0 0 20 24" fill="none" className="shrink-0 opacity-80" xmlns="http://www.w3.org/2000/svg">
      <path d="M 4 19 C 1.5 15 1.5 9 4 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M 8 21 C 4.5 16 4.5 8 8 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M 12 23 C 7.5 17 7.5 7 12 1" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Insignia de Red de Lealtad (Foil Metálico con Aros Entrelazados)
function CardNetworkBadge({ label = 'LOYALTY PASS', color = '#d4a373' }: { label?: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 opacity-90 select-none">
      <div className="relative w-6 h-3.5">
        <div 
          className="absolute left-0 w-3.5 h-3.5 rounded-full border opacity-80"
          style={{ borderColor: color, backgroundColor: `${color}35` }}
        />
        <div 
          className="absolute right-0 w-3.5 h-3.5 rounded-full border opacity-80 mix-blend-screen"
          style={{ borderColor: '#ffffff', backgroundColor: 'rgba(255,255,255,0.25)' }}
        />
      </div>
      <span className="text-[7.5px] font-mono tracking-[0.2em] font-extrabold uppercase text-zinc-300">
        {label}
      </span>
    </div>
  );
}

// Número de Tarjeta Troquelado en Relieve
function EmbossedMembershipNumber({ 
  serialNumber, 
  color = '#d4a373' 
}: { 
  serialNumber: string; 
  color?: string; 
}) {
  const clean = serialNumber.replace(/\D/g, '').padEnd(8, '42');
  const group1 = clean.slice(0, 4) || '9042';
  const group2 = clean.slice(4, 8) || '5518';
  
  return (
    <div className="my-2 py-1 px-2.5 rounded-lg bg-black/50 border border-white/10 backdrop-blur-sm flex items-center justify-between shadow-inner">
      <div className="flex items-center gap-2 text-[11px] font-mono font-bold tracking-[0.24em] text-zinc-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        <span className="text-zinc-500 text-[10px]">PASS</span>
        <span className="tracking-widest">••••</span>
        <span>{group1}</span>
        <span style={{ color }}>{group2}</span>
      </div>
      <div className="text-right text-[7.5px] font-mono text-zinc-400">
        <span className="block uppercase tracking-wider text-zinc-500 text-[6.5px]">Vence</span>
        <span className="text-zinc-300 font-bold">10/29</span>
      </div>
    </div>
  );
}

// Banda Magnética Táctica en el Reverso
function MagneticStripe() {
  return (
    <div className="w-full h-8 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-y border-white/10 relative my-2 overflow-hidden shadow-inner">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.08)_50%,transparent_100%)]" />
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[6.5px] font-mono tracking-[0.25em] text-zinc-400 uppercase">
        MAGNETIC ENCRYPTED TRACK · ISO-7813 STANDARD
      </div>
    </div>
  );
}

// Panel de Firma y Código de Seguridad CVC
function SignaturePanel({ 
  customerName, 
  cvc = '842' 
}: { 
  customerName: string; 
  cvc?: string; 
}) {
  return (
    <div className="px-0.5 my-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-7 bg-zinc-200/90 rounded px-2.5 flex items-center justify-between border border-white/20 shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 opacity-15 bg-[repeating-linear-gradient(45deg,#000,#000_2px,transparent_2px,transparent_5px)]" />
          <span className="font-serif italic text-zinc-900 text-xs tracking-wider relative z-10 select-none">
            {customerName}
          </span>
          <span className="text-[7px] font-mono text-zinc-600 uppercase tracking-widest relative z-10">
            Firma Titular
          </span>
        </div>
        <div className="w-12 h-7 bg-black/60 rounded border border-white/15 flex flex-col items-center justify-center shrink-0 shadow-inner">
          <span className="text-[6px] font-mono text-zinc-500 uppercase">CVC</span>
          <span className="text-[9.5px] font-mono font-bold text-amber-300 tracking-widest">{cvc}</span>
        </div>
      </div>
    </div>
  );
}

// Sello Holográfico Iridiscente Reflectante Adaptado a 60 FPS
function HologramSeal({ 
  gradient = 'from-[#d4a373] via-[#8b5cf6] via-[#38bdf8] to-[#ec4899]' 
}: { 
  gradient?: string; 
}) {
  return (
    <div className={cn("w-8 h-8 rounded-full p-[1.5px] shadow-[0_0_15px_rgba(139,92,246,0.45)] shrink-0 animate-pulse bg-gradient-to-tr", gradient)}>
      <div className="w-full h-full rounded-full bg-[#0a0a0f]/90 backdrop-blur-sm flex items-center justify-center border border-white/20">
        <Sparkles className="w-3.5 h-3.5 text-champagne" />
      </div>
    </div>
  );
}

// Fondo de Tramas y Texturas Vectoriales PBR
function CardPatternBackground({ 
  pattern = 'guilloche', 
  color = '#8b5cf6' 
}: { 
  pattern: CardPattern; 
  color: string; 
}) {
  switch (pattern) {
    case 'carbon_fiber':
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="carbonPattern" width="12" height="12" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="#141416" />
              <rect x="6" width="6" height="6" fill="#08080a" />
              <rect y="6" width="6" height="6" fill="#08080a" />
              <rect x="6" y="6" width="6" height="6" fill="#141416" />
              <line x1="0" y1="0" x2="6" y2="6" stroke={color} strokeWidth="0.4" opacity="0.3" />
              <line x1="6" y1="0" x2="12" y2="6" stroke="#ffffff" strokeWidth="0.3" opacity="0.1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#carbonPattern)" />
        </svg>
      );

    case 'grid_matrix':
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="cardGrid" width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M 16 0 L 0 0 0 16" fill="none" stroke={color} strokeWidth="0.6" strokeDasharray="1,3" />
              <circle cx="8" cy="8" r="0.75" fill={color} opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cardGrid)" />
          {/* Miras tácticas angulares en las esquinas */}
          <path d="M 8 16 L 8 8 L 16 8" fill="none" stroke={color} strokeWidth="1" />
          <path d="M 334 16 L 334 8 L 326 8" fill="none" stroke={color} strokeWidth="1" />
          <path d="M 8 460 L 8 468 L 16 468" fill="none" stroke={color} strokeWidth="1" />
          <path d="M 334 460 L 334 468 L 326 468" fill="none" stroke={color} strokeWidth="1" />
        </svg>
      );

    case 'brushed_titanium':
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="brushedLines" width="100" height="4" patternUnits="userSpaceOnUse">
              <line x1="0" y1="1" x2="100" y2="1" stroke={color} strokeWidth="0.5" opacity="0.4" />
              <line x1="0" y1="3" x2="100" y2="3" stroke="#ffffff" strokeWidth="0.4" opacity="0.15" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#brushedLines)" />
        </svg>
      );

    case 'luxury_filigree':
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="calc(100% - 20px)" height="calc(100% - 20px)" rx="12" fill="none" stroke={color} strokeWidth="1" strokeDasharray="8,4" />
          <rect x="14" y="14" width="calc(100% - 28px)" height="calc(100% - 28px)" rx="10" fill="none" stroke="#d4a373" strokeWidth="0.6" opacity="0.6" />
          <circle cx="20" cy="20" r="2" fill="#d4a373" />
          <circle cx="calc(100% - 20px)" cy="20" r="2" fill="#d4a373" />
          <circle cx="20" cy="calc(100% - 20px)" r="2" fill="#d4a373" />
          <circle cx="calc(100% - 20px)" cy="calc(100% - 20px)" r="2" fill="#d4a373" />
        </svg>
      );

    case 'guilloche':
    default:
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="guillocheWaves" width="60" height="60" patternUnits="userSpaceOnUse">
              <path
                d="M 0 30 Q 15 10 30 30 T 60 30 M 0 35 Q 15 15 30 35 T 60 35 M 0 25 Q 15 5 30 25 T 60 25"
                fill="none"
                stroke={color}
                strokeWidth="0.65"
              />
              <path
                d="M 30 0 Q 10 15 30 30 T 30 60 M 35 0 Q 15 15 35 30 T 35 60 M 25 0 Q 5 15 25 30 T 25 60"
                fill="none"
                stroke={color}
                strokeWidth="0.45"
                opacity="0.6"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#guillocheWaves)" />
          <ellipse cx="50%" cy="40%" rx="130" ry="80" fill="none" stroke={color} strokeWidth="0.8" opacity="0.3" strokeDasharray="3,3" />
          <ellipse cx="50%" cy="40%" rx="120" ry="72" fill="none" stroke="#d4a373" strokeWidth="0.5" opacity="0.25" />
        </svg>
      );
  }
}

// Configuración de Identidad Visual Canónica por Rango de Lealtad
export function getTierCardVisuals(
  tier: LoyaltyTier = 'bronze', 
  customPattern?: CardPattern, 
  customBrandColor?: string
) {
  switch (tier) {
    case 'champion':
      return {
        label: 'CHAMPION VIP',
        tierTitle: 'CHAMPION SUPREME PASS',
        watermarkTier: 'TIER 4 · CHAMPION SUPREME',
        accentColor: customBrandColor || '#8b5cf6',
        cardBg: 'bg-gradient-to-b from-[#210e3d] via-[#0d0619] to-[#05020a]',
        cardBorder: 'border-purple-500/60',
        cardShadow: 'shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9),0_0_40px_-5px_rgba(139,92,246,0.65)]',
        pattern: customPattern || 'guilloche',
        chipBg: 'from-amber-300 via-purple-400 to-amber-500',
        chipBorder: 'border-purple-400/80',
        hologramGrad: 'from-[#d4a373] via-[#8b5cf6] via-[#38bdf8] to-[#ec4899]',
        badgeText: 'text-purple-200',
        badgeBg: 'bg-gradient-to-r from-purple-900/60 to-purple-600/40',
        badgeBorder: 'border-purple-400/60',
        iconColor: '#c084fc',
        glowAura: 'bg-purple-600/20',
      };
    case 'gold':
      return {
        label: 'ORO PRESTIGE',
        tierTitle: 'GOLD PRESTIGE PASS',
        watermarkTier: 'TIER 3 · GOLD VIP PRIVILEGE',
        accentColor: '#d4a373',
        cardBg: 'bg-gradient-to-b from-[#281c08] via-[#160f04] to-[#090601]',
        cardBorder: 'border-amber-400/50',
        cardShadow: 'shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85),0_0_35px_-6px_rgba(212,163,115,0.45)]',
        pattern: customPattern || 'luxury_filigree',
        chipBg: 'from-amber-200 via-amber-400 to-amber-600',
        chipBorder: 'border-amber-300/90',
        hologramGrad: 'from-amber-300 via-yellow-400 to-amber-600',
        badgeText: 'text-amber-200',
        badgeBg: 'bg-amber-500/25',
        badgeBorder: 'border-amber-400/50',
        iconColor: '#f59e0b',
        glowAura: 'bg-amber-500/20',
      };
    case 'silver':
      return {
        label: 'PLATA ELITE',
        tierTitle: 'SILVER FREQUENT PASS',
        watermarkTier: 'TIER 2 · SILVER ELITE',
        accentColor: '#94a3b8',
        cardBg: 'bg-gradient-to-b from-[#182029] via-[#0d1217] to-[#05070a]',
        cardBorder: 'border-slate-400/40',
        cardShadow: 'shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85),0_0_25px_-8px_rgba(148,163,184,0.35)]',
        pattern: customPattern || 'grid_matrix',
        chipBg: 'from-slate-200 via-slate-400 to-slate-600',
        chipBorder: 'border-slate-300/80',
        hologramGrad: 'from-slate-400 via-cyan-400 to-slate-200',
        badgeText: 'text-slate-200',
        badgeBg: 'bg-slate-500/25',
        badgeBorder: 'border-slate-400/40',
        iconColor: '#cbd5e1',
        glowAura: 'bg-slate-400/20',
      };
    case 'bronze':
    default:
      return {
        label: 'BRONCE CLASSIC',
        tierTitle: 'BRONZE MEMBER PASS',
        watermarkTier: 'TIER 1 · BRONZE CLASSIC',
        accentColor: '#d97706',
        cardBg: 'bg-gradient-to-b from-[#241308] via-[#140b04] to-[#080402]',
        cardBorder: 'border-amber-700/40',
        cardShadow: 'shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85),0_0_25px_-8px_rgba(180,83,9,0.35)]',
        pattern: customPattern || 'brushed_titanium',
        chipBg: 'from-amber-600 via-amber-700 to-amber-900',
        chipBorder: 'border-amber-600/70',
        hologramGrad: 'from-amber-700 via-amber-500 to-yellow-600',
        badgeText: 'text-amber-300',
        badgeBg: 'bg-amber-700/25',
        badgeBorder: 'border-amber-600/40',
        iconColor: '#d97706',
        glowAura: 'bg-amber-700/20',
      };
  }
}

// Estilos de Morfología de Esquinas (Anti-Clones)
function getMorphologyClasses(morphology: CardMorphology = 'orthogonal') {
  switch (morphology) {
    case 'orthogonal':
      return {
        container: 'rounded-[4px] border',
        doppelrandOuter: 'rounded-[3px] border border-white/[0.12]',
        doppelrandInner: 'rounded-[2px] border border-white/[0.04]',
        style: {} as React.CSSProperties,
      };
    case 'chamfered':
      return {
        container: 'border',
        doppelrandOuter: 'border border-white/[0.12]',
        doppelrandInner: 'border border-white/[0.04]',
        style: {
          clipPath: 'polygon(16px 0%, calc(100% - 16px) 0%, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0% calc(100% - 16px), 0% 16px)',
        } as React.CSSProperties,
      };
    case 'cutout':
      return {
        container: 'rounded-2xl border relative',
        doppelrandOuter: 'rounded-[14px] border border-white/[0.1]',
        doppelrandInner: 'rounded-[10px] border border-white/[0.04]',
        style: {} as React.CSSProperties,
      };
    case 'rounded':
    default:
      return {
        container: 'rounded-2xl border',
        doppelrandOuter: 'rounded-[14px] border border-white/[0.1]',
        doppelrandInner: 'rounded-[10px] border border-white/[0.04]',
        style: {} as React.CSSProperties,
      };
  }
}

export function LivePassPreview({
  merchantName,
  customerName,
  passSerialNumber,
  currentStamps,
  totalNeeded = 10,
  rewardDescription,
  passType,
  brandColor = '#8b5cf6',
  loyaltyTier = 'bronze',
  loyaltyProgramMode = 'multi_tier',
  cardMorphology = 'orthogonal',
  cardGradient,
  rewardMilestones = [],
  totalRewardsRedeemed = 0,
  customReward,
  discountPercentage,
  nextReservationDate,
  locationAddress = 'Calle 85 # 11-53, Chapinero, Bogotá',
  cardPattern,
  showEmvChip = true,
  showHologram = true,
  className,
}: LivePassPreviewProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Estados para física de inclinación 3D (3D Card Tilt) y foco de luz especular
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [sheenPos, setSheenPos] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Normalizar entre -1 y 1
    const normX = (x / rect.width) * 2 - 1;
    const normY = (y / rect.height) * 2 - 1;

    // Inclinación máxima de 7 grados
    setTilt({
      x: -normY * 7,
      y: normX * 7,
    });

    setSheenPos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.18,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setSheenPos((prev) => ({ ...prev, opacity: 0 }));
  }, []);

  // Determinar si opera en modo "Tarjeta Única" o "Sistema de Rangos"
  const isSingleCard = loyaltyProgramMode === 'single_card';

  // Configuración visual según el modo
  const tierVisuals = getTierCardVisuals(loyaltyTier, cardPattern, brandColor);
  const morphClasses = getMorphologyClasses(cardMorphology);

  // Degradado y estilos para Tarjeta Única
  const singleCardBg = cardGradient 
    ? `linear-gradient(${cardGradient.angle || 180}deg, ${cardGradient.from} 0%, ${cardGradient.via ? `${cardGradient.via} 50%, ` : ''}${cardGradient.to} 100%)`
    : `linear-gradient(180deg, #18181b 0%, #09090b 100%)`;

  const activeAccentColor = isSingleCard ? brandColor : tierVisuals.accentColor;
  const activePattern = isSingleCard ? (cardPattern || 'guilloche') : tierVisuals.pattern;

  return (
    <div className={cn('w-full max-w-sm mx-auto select-none', className)}>
      {/* Barra de Controles Superiores */}
      <div className="flex items-center justify-end mb-3 text-xs text-zinc-400 px-1">
        <button
          onClick={() => setIsFlipped(!isFlipped)}
          className="flex items-center gap-1.5 hover:text-white transition-all bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-md text-[11px] font-mono border border-white/10 shadow-sm"
        >
          <RotateCw className="w-3 h-3 text-champagne" />
          {isFlipped ? 'Ver Frente' : 'Girar Reverso'}
        </button>
      </div>

      {/* Contenedor Giratorio 3D con Soporte de Puntero Interactivo */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          perspective: 1200,
        }}
        className="w-full relative transition-transform duration-200 ease-out"
      >
        <div
          className={cn(
            'relative w-full transition-all duration-700 [transform-style:preserve-3d]',
            isFlipped ? '[transform:rotateY(180deg)]' : ''
          )}
          style={{
            transform: isFlipped 
              ? 'rotateY(180deg)' 
              : `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          }}
        >
          {/* ============================================================== */}
          {/* FRENTE DE LA TARJETA ULTRA-PREMIUM CON IDENTIDAD PBR */}
          {/* ============================================================== */}
          <div
            className={cn(
              'w-full [backface-visibility:hidden] p-5 border relative overflow-hidden transition-all duration-500 shadow-2xl',
              morphClasses.container,
              !isSingleCard ? tierVisuals.cardBg : '',
              !isSingleCard ? tierVisuals.cardBorder : 'border-white/15',
              !isSingleCard ? tierVisuals.cardShadow : 'shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9),0_0_35px_-5px_rgba(255,255,255,0.08)]'
            )}
            style={{
              ...morphClasses.style,
              background: isSingleCard ? singleCardBg : undefined,
            }}
          >
            {/* TRAMA VECTORIAL Y LÍNEAS CONFIGURADAS */}
            <CardPatternBackground pattern={activePattern} color={activeAccentColor} />

            {/* Muescas laterales troqueladas (Solo en Morfología Cutout) */}
            {cardMorphology === 'cutout' && (
              <>
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border border-white/20 shadow-inner z-20 pointer-events-none" />
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border border-white/20 shadow-inner z-20 pointer-events-none" />
              </>
            )}

            {/* DOBLE BORDE METÁLICO (DOPPELRAND CANÓNICO) */}
            <div className={cn("absolute inset-1.5 pointer-events-none", morphClasses.doppelrandOuter)} />
            <div className={cn("absolute inset-2.5 pointer-events-none", morphClasses.doppelrandInner)} />

            {/* CAPA DE REFLEJO ESPECULAR DINÁMICO QUE SIGUE AL CURSOR */}
            <div 
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle at ${sheenPos.x}% ${sheenPos.y}%, rgba(255,255,255,${sheenPos.opacity}) 0%, transparent 60%)`,
              }}
            />

            {/* HEADER DE LA TARJETA */}
            <div className="flex items-start justify-between border-b border-white/10 pb-3 mb-2.5 relative z-10">
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-8 h-8 rounded-lg border flex items-center justify-center shadow-md"
                  style={{ backgroundColor: `${activeAccentColor}25`, borderColor: `${activeAccentColor}50` }}
                >
                  <Sparkles className="w-4 h-4 text-champagne" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white tracking-wide">{merchantName}</h4>
                  <p className="text-[10px] font-mono uppercase tracking-widest font-semibold" style={{ color: activeAccentColor }}>
                    {isSingleCard ? 'TARJETA DE LEALTAD' : tierVisuals.tierTitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {showHologram && <HologramSeal gradient={tierVisuals.hologramGrad} />}
              </div>
            </div>

            {/* FILA DE DETALLES TÉCNICOS: CHIP EMV + ONDAS NFC + INSIGNIA O RANGO */}
            <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
              <div className="flex items-center gap-2.5">
                {showEmvChip && <EmvChip gradient={tierVisuals.chipBg} border={tierVisuals.chipBorder} />}
                <NfcContactlessWave color={activeAccentColor} />
                
                {/* Insignia: Rango Multinivel o Miembro de Autor */}
                {isSingleCard ? (
                  <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border shadow-sm bg-white/5 border-white/15 text-zinc-200"
                  >
                    <Award className="w-3.5 h-3.5 shrink-0" style={{ color: activeAccentColor }} />
                    <span>MIEMBRO TITULAR</span>
                    {totalRewardsRedeemed > 0 && (
                      <span className="opacity-80 font-normal">({totalRewardsRedeemed} canjes)</span>
                    )}
                  </div>
                ) : (
                  <div
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border shadow-sm',
                      tierVisuals.badgeBg,
                      tierVisuals.badgeText,
                      tierVisuals.badgeBorder
                    )}
                  >
                    <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: tierVisuals.iconColor }} />
                    <span>{tierVisuals.label}</span>
                    {totalRewardsRedeemed > 0 && (
                      <span className="opacity-80 font-normal">({totalRewardsRedeemed})</span>
                    )}
                  </div>
                )}
              </div>

              {/* Descuento Permanente en Tienda */}
              {discountPercentage && discountPercentage > 0 && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold shadow-sm">
                  <Percent className="w-3 h-3 text-emerald-400" />
                  <span>{discountPercentage}% OFF</span>
                </div>
              )}
            </div>

            {/* NÚMERO DE TARJETA TROQUELADO EN RELIEVE BANCARIO */}
            <div className="relative z-10">
              <EmbossedMembershipNumber serialNumber={passSerialNumber} color={activeAccentColor} />
            </div>

            {/* INFORMACIÓN DEL CLIENTE & RECOMPENSA */}
            <div className="flex items-center justify-between mb-2 relative z-10 px-0.5">
              <div>
                <span className="text-[8.5px] font-mono uppercase tracking-widest text-zinc-400 block font-bold">
                  Miembro Titular
                </span>
                <span className="text-xs sm:text-sm font-semibold text-white tracking-wide">{customerName}</span>
              </div>
              <div className="text-right">
                <span className="text-[8.5px] font-mono uppercase tracking-widest text-zinc-400 block font-bold">
                  Recompensa Meta
                </span>
                <span className="text-xs font-medium text-champagne-light line-clamp-1 max-w-[130px]">
                  {rewardDescription}
                </span>
              </div>
            </div>

            {/* REGALO PERSONALIZADO VIP DE AUTOR (SI TIENE ASIGNADO) */}
            {customReward && (
              <div className="p-2 rounded-xl bg-champagne/10 border border-champagne/30 flex items-center gap-2 mb-2.5 relative z-10">
                <Gift className="w-3.5 h-3.5 text-champagne shrink-0" />
                <div className="text-left">
                  <span className="text-[8.5px] font-mono text-champagne uppercase tracking-wider block font-bold">
                    🎁 Beneficio de Autor
                  </span>
                  <span className="text-xs font-semibold text-white line-clamp-1">{customReward}</span>
                </div>
              </div>
            )}

            {/* SELLOS DE PROGRESO CON COLOR ADAPTADO E HITOS INTERMEDIOS */}
            <div className="bg-black/60 backdrop-blur-sm rounded-xl p-3 border border-white/10 mb-3 relative z-10 shadow-inner">
              <StampsVisualizer 
                currentStamps={currentStamps} 
                totalNeeded={totalNeeded} 
                brandColor={activeAccentColor}
                milestones={rewardMilestones}
              />
            </div>

            {/* ALERTA DE PRÓXIMA RESERVA (SI EXISTE) */}
            {nextReservationDate && (
              <div className="mb-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 flex items-center gap-2 relative z-10">
                <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="text-left">
                  <p className="text-[9px] font-mono text-emerald-300 uppercase tracking-wider">Próxima Reserva</p>
                  <p className="text-xs text-white font-medium">{new Date(nextReservationDate).toLocaleString('es-CO')}</p>
                </div>
              </div>
            )}

            {/* CÓDIGO QR PARA ESCANEO EN CAJA */}
            <div className="flex flex-col items-center justify-center p-3 bg-black/60 backdrop-blur-sm rounded-xl border border-white/10 relative z-10 shadow-inner">
              <SvgQrCode value={passSerialNumber} size={118} />
              <span className="mt-1.5 font-mono text-[9px] tracking-widest text-zinc-300 font-bold">
                {passSerialNumber}
              </span>
              <span className="text-[7.5px] font-mono text-zinc-500 mt-0.5">
                Presenta este código en caja para acumular sellos
              </span>
            </div>

            {/* FOOTER DE LA TARJETA */}
            <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[8px] font-mono text-zinc-400 relative z-10">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Pase Criptográfico Verificado
              </span>
              <CardNetworkBadge label="FIDELIZIA NET" color={activeAccentColor} />
            </div>
          </div>

          {/* ============================================================== */}
          {/* REVERSO DE LA TARJETA: BANDA MAGNÉTICA, POLÍTICAS Y DATOS */}
          {/* ============================================================== */}
          <div
            className={cn(
              'w-full [backface-visibility:hidden] [transform:rotateY(180deg)] p-5 border absolute inset-0 overflow-hidden shadow-2xl flex flex-col justify-between',
              morphClasses.container,
              !isSingleCard ? tierVisuals.cardBg : '',
              !isSingleCard ? tierVisuals.cardBorder : 'border-white/15',
              !isSingleCard ? tierVisuals.cardShadow : 'shadow-2xl'
            )}
            style={{
              ...morphClasses.style,
              background: isSingleCard ? singleCardBg : undefined,
            }}
          >
            {/* TRAMA VECTORIAL EN REVERSO */}
            <CardPatternBackground pattern={activePattern} color={activeAccentColor} />

            <div className="relative z-10 space-y-2">
              <div className="flex items-center justify-between text-[8px] font-mono uppercase text-zinc-400 border-b border-white/10 pb-2">
                <span>{merchantName}</span>
                <span>CUSTOMER SUPPORT 24/7</span>
              </div>

              {/* Banda Magnética */}
              <MagneticStripe />

              {/* Panel de Firma con CVC */}
              <SignaturePanel customerName={customerName} cvc="842" />

              {/* Términos de Fidelidad */}
              <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 text-[8.5px] font-mono text-zinc-400 leading-relaxed text-left">
                <span className="text-zinc-300 font-bold block mb-1">TÉRMINOS DEL PROGRAMA:</span>
                <p>
                  Esta tarjeta es personal e intransferible. Válida para acumular sellos en compras realizadas en {merchantName}. Los sellos no tienen valor monetario ni canje por efectivo.
                </p>
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5 text-zinc-300">
                  <MapPin className="w-3 h-3 text-purple-400 shrink-0" />
                  <span className="truncate">{locationAddress}</span>
                </div>
              </div>
            </div>

            <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[8px] font-mono text-zinc-400">
              <span>FIDELIZIA PLATFORM · VERSIÓN 2.0</span>
              <button
                type="button"
                onClick={() => setIsFlipped(false)}
                className="text-champagne hover:underline"
              >
                Volver al frente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
