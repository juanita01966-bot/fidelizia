'use client';

import React from 'react';
import { 
  Sparkles, 
  Check, 
  Coffee, 
  Gift, 
  Cookie, 
  Percent, 
  Star,
  Award,
  CupSoda
} from 'lucide-react';
import { RewardMilestone } from '@/types/domain';
import { cn } from '@/lib/utils';

interface StampsVisualizerProps {
  currentStamps: number;
  totalNeeded: number;
  brandColor?: string;
  milestones?: RewardMilestone[];
}

function renderMilestoneIcon(iconType?: string, className = "w-3 h-3") {
  switch (iconType) {
    case 'cookie':
      return <Cookie className={className} />;
    case 'gift':
      return <Gift className={className} />;
    case 'percent':
      return <Percent className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'star':
      return <Star className={className} />;
    case 'cup':
      return <CupSoda className={className} />;
    case 'coffee':
    default:
      return <Coffee className={className} />;
  }
}

export function StampsVisualizer({
  currentStamps,
  totalNeeded = 10,
  brandColor = '#8b5cf6',
  milestones = [],
}: StampsVisualizerProps) {
  const stamps = Array.from({ length: totalNeeded }, (_, i) => i + 1);

  return (
    <div className="w-full text-left">
      <div className="flex items-center justify-between mb-2.5 text-xs font-mono text-zinc-400">
        <span className="flex items-center gap-1.5 text-zinc-300 font-semibold tracking-wide">
          <Sparkles className="w-3.5 h-3.5 text-champagne shrink-0" />
          <span>PROGRESO DE LEALTAD</span>
        </span>
        <span className="text-white font-bold bg-black/40 px-2 py-0.5 rounded border border-white/10 font-mono">
          {currentStamps} / {totalNeeded} SELLOS
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
        {stamps.map((stampNum) => {
          const isStamped = stampNum <= currentStamps;
          const isNext = stampNum === currentStamps + 1;
          const isGoal = stampNum === totalNeeded;
          const milestone = milestones.find((m) => m.stamp_number === stampNum);

          return (
            <div
              key={stampNum}
              className={cn(
                'group aspect-square rounded-xl relative flex flex-col items-center justify-center transition-all duration-300 overflow-hidden',
                // Físicas PBR de hendidura en bajo relieve o relieve troquelado
                isStamped
                  ? 'border shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.25)] text-white'
                  : 'bg-gradient-to-b from-black/80 via-zinc-950/90 to-black border-white/[0.08] text-zinc-600 shadow-[inset_0_2px_5px_rgba(0,0,0,0.85)]',
                isNext && 'border-champagne/80 bg-champagne/10 animate-pulse text-champagne-light shadow-[0_0_15px_rgba(212,163,115,0.35)]',
                isGoal && !isStamped && 'border-amber-400/60 bg-amber-500/10 text-amber-300'
              )}
              style={
                isStamped
                  ? {
                      backgroundColor: `${brandColor}22`,
                      borderColor: `${brandColor}80`,
                      boxShadow: `inset 0 1px 3px rgba(255,255,255,0.2), 0 0 14px ${brandColor}35`,
                    }
                  : undefined
              }
              title={milestone ? `Hito #${stampNum}: ${milestone.reward}` : undefined}
            >
              {/* Bisel perimetral CNC de precisión de 1px (Doppelrand) */}
              <div className="absolute inset-0.5 rounded-[9px] border border-white/[0.04] pointer-events-none" />

              {/* Reflejo especular diagonal sutil */}
              <div className="absolute -inset-full bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent rotate-45 pointer-events-none" />

              {/* Contenido del Sello */}
              {isStamped ? (
                <div className="flex flex-col items-center justify-center relative z-10">
                  <div 
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full text-white flex items-center justify-center shadow-lg relative border border-white/30 transform transition-transform group-hover:scale-110"
                    style={{ backgroundColor: brandColor }}
                  >
                    <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                  </div>
                  <span className="text-[9px] font-mono mt-0.5 font-bold tracking-tight" style={{ color: brandColor }}>
                    #{stampNum}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center relative z-10 transition-transform group-hover:scale-105">
                  {milestone ? (
                    <div className="text-champagne/80 flex items-center justify-center">
                      {renderMilestoneIcon(milestone.icon, 'w-3.5 h-3.5')}
                    </div>
                  ) : (
                    <Coffee className={cn('w-3.5 h-3.5', isGoal ? 'text-amber-400' : 'text-zinc-600')} />
                  )}
                  <span className="text-[8.5px] font-mono mt-0.5 text-zinc-500 font-semibold">
                    #{stampNum}
                  </span>
                </div>
              )}

              {/* Micro-Insignia de Hito de Premio en la Esquina */}
              {milestone && (
                <div 
                  className={cn(
                    "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center shadow-sm z-20 border text-[8px]",
                    isStamped 
                      ? "bg-emerald-500 text-white border-black/40 shadow-glow-emerald" 
                      : "bg-champagne text-zinc-950 border-black/60 shadow-md font-bold"
                  )}
                  title={milestone.reward}
                >
                  {isStamped ? '✓' : '🎁'}
                </div>
              )}

              {/* Estrella de Meta Final si no tiene hito explícito */}
              {!milestone && isGoal && (
                <div 
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-sm z-20 border border-black/50"
                  style={{ backgroundColor: brandColor }}
                >
                  <span className="text-[7.5px] text-white font-black">★</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lista Desplegable de Hitos Intermedios (Si Existen) */}
      {milestones && milestones.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-white/[0.08] flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider font-bold">
            Escalera de Premios:
          </span>
          {milestones.map((m) => (
            <span
              key={m.stamp_number}
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-mono border",
                currentStamps >= m.stamp_number
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold"
                  : "bg-surface-100 border-white/10 text-zinc-400"
              )}
            >
              <span>#{m.stamp_number}:</span>
              <span className="truncate max-w-[110px]">{m.reward}</span>
              {currentStamps >= m.stamp_number && <span className="text-emerald-400">✓</span>}
            </span>
          ))}
        </div>
      )}

      {/* Barra Milimétrica de Progreso con Micro-Detalle */}
      <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center justify-between text-[8px] font-mono text-zinc-400 mb-1">
          <span>{Math.round((currentStamps / totalNeeded) * 100)}% COMPLETADO</span>
          <span className="text-zinc-300 font-bold">
            {currentStamps >= totalNeeded 
              ? '🎉 ¡PREMIO DISPONIBLE!' 
              : `Faltan ${totalNeeded - currentStamps} para reclamar`}
          </span>
        </div>
        <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden border border-white/5">
          <div 
            className="h-full rounded-full transition-all duration-500 shadow-sm"
            style={{ 
              width: `${Math.min(100, (currentStamps / totalNeeded) * 100)}%`,
              backgroundColor: brandColor 
            }}
          />
        </div>
      </div>
    </div>
  );
}
