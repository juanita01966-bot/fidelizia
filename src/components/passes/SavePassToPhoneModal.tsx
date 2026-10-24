'use client';

import React, { useState } from 'react';
import { 
  Smartphone, 
  Share2, 
  PlusSquare, 
  Bell, 
  CheckCircle2, 
  MessageSquare, 
  X, 
  ArrowRight,
  Sparkles,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { requestPushPermissionAndSendWelcome, generateWhatsAppPassLink } from '@/lib/pwa/pwa-helper';
import { toast } from 'sonner';

interface SavePassToPhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  serialNumber: string;
  merchantName: string;
}

export function SavePassToPhoneModal({
  isOpen,
  onClose,
  customerName,
  serialNumber,
  merchantName,
}: SavePassToPhoneModalProps) {
  const [activeTab, setActiveTab] = useState<'install' | 'notifications' | 'whatsapp'>('install');
  const [notificationsGranted, setNotificationsGranted] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );
  const [isRequestingNotification, setIsRequestingNotification] = useState(false);

  if (!isOpen) return null;

  const isIos = typeof window !== 'undefined' && /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());

  const handleActivateNotifications = async () => {
    setIsRequestingNotification(true);
    try {
      const res = await requestPushPermissionAndSendWelcome(customerName);
      if (res.granted) {
        setNotificationsGranted(true);
        toast.success('¡Notificaciones Push activadas en tu teléfono!', {
          description: 'Revisa tu barra de notificaciones, te acabamos de enviar un saludo.',
        });
      } else if (res.status === 'denied') {
        toast.error('Permiso denegado', {
          description: 'Puedes activarlo en la configuración del navegador de tu teléfono.',
        });
      }
    } finally {
      setIsRequestingNotification(false);
    }
  };

  const handleShareWhatsApp = () => {
    const link = generateWhatsAppPassLink(merchantName, customerName, serialNumber);
    window.open(link, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 text-left">
      <div className="bg-surface-200 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
        {/* Header con botón de cerrar */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-surface-100/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Guardar Tarjeta en tu Celular</h3>
              <p className="text-[11px] text-zinc-400">Acceso permanente & Notificaciones</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs de Selección */}
        <div className="grid grid-cols-3 border-b border-white/[0.08] bg-surface-100/30 text-xs font-mono">
          <button
            onClick={() => setActiveTab('install')}
            className={`py-2.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'install'
                ? 'border-brand-500 text-brand-300 font-bold bg-brand-500/10'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>1. Instalar</span>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`py-2.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'notifications'
                ? 'border-brand-500 text-brand-300 font-bold bg-brand-500/10'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>2. Avisos</span>
          </button>
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`py-2.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'whatsapp'
                ? 'border-brand-500 text-brand-300 font-bold bg-brand-500/10'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>3. WhatsApp</span>
          </button>
        </div>

        {/* Contenido según Tab */}
        <div className="p-5 space-y-4">
          {activeTab === 'install' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-brand-950/40 border border-brand-500/20 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 leading-relaxed">
                  <strong className="text-white block font-medium mb-0.5">
                    ¿Cómo tener la tarjeta siempre a mano?
                  </strong>
                  Agrégala a tu pantalla de inicio como una aplicación. Se abrirá a pantalla completa y jamás tendrás que volver a registrarte.
                </div>
              </div>

              {isIos ? (
                /* Pasos para iPhone / Safari */
                <div className="space-y-3 bg-surface-100/70 p-4 rounded-xl border border-white/5">
                  <div className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    Pasos en Safari (iPhone):
                  </div>
                  <div className="flex items-start gap-3 text-xs text-zinc-300">
                    <div className="w-6 h-6 rounded bg-surface-300 flex items-center justify-center shrink-0 text-white font-mono font-bold text-[11px]">
                      1
                    </div>
                    <div>
                      Toca el botón <strong className="text-white font-semibold">Compartir</strong> <Share2 className="w-3.5 h-3.5 inline mx-1 text-blue-400" /> en la barra inferior de Safari.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs text-zinc-300">
                    <div className="w-6 h-6 rounded bg-surface-300 flex items-center justify-center shrink-0 text-white font-mono font-bold text-[11px]">
                      2
                    </div>
                    <div>
                      Desliza hacia abajo y selecciona <strong className="text-white font-semibold">"Agregar a inicio"</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-emerald-400" />.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs text-zinc-300">
                    <div className="w-6 h-6 rounded bg-surface-300 flex items-center justify-center shrink-0 text-white font-mono font-bold text-[11px]">
                      3
                    </div>
                    <div>
                      Toca <strong className="text-white font-semibold">"Agregar"</strong> arriba a la derecha. ¡Tu tarjeta quedará guardada como una app!
                    </div>
                  </div>
                </div>
              ) : (
                /* Pasos para Android / Chrome */
                <div className="space-y-3 bg-surface-100/70 p-4 rounded-xl border border-white/5">
                  <div className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Pasos en Chrome (Android):
                  </div>
                  <div className="flex items-start gap-3 text-xs text-zinc-300">
                    <div className="w-6 h-6 rounded bg-surface-300 flex items-center justify-center shrink-0 text-white font-mono font-bold text-[11px]">
                      1
                    </div>
                    <div>
                      Toca los <strong className="text-white font-semibold">tres puntos ⋮</strong> en la esquina superior derecha del navegador.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs text-zinc-300">
                    <div className="w-6 h-6 rounded bg-surface-300 flex items-center justify-center shrink-0 text-white font-mono font-bold text-[11px]">
                      2
                    </div>
                    <div>
                      Selecciona <strong className="text-white font-semibold">"Instalar aplicación"</strong> o <strong className="text-white font-semibold">"Agregar a la pantalla principal"</strong>.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs text-zinc-300">
                    <div className="w-6 h-6 rounded bg-surface-300 flex items-center justify-center shrink-0 text-white font-mono font-bold text-[11px]">
                      3
                    </div>
                    <div>
                      Confirma <strong className="text-white font-semibold">"Instalar"</strong>. ¡El ícono de Café Canelo aparecerá en tu teléfono!
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-purple-950/40 border border-brand-500/20 flex items-start gap-3">
                <Bell className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 leading-relaxed">
                  <strong className="text-white block font-medium mb-0.5">
                    Notificaciones en tu Pantalla de Bloqueo
                  </strong>
                  Recibe avisos automáticos cada vez que acumules un sello en caja, cuando tu café gratis esté listo, o promociones 2x1 exclusivas.
                </div>
              </div>

              {notificationsGranted ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">¡Notificaciones Activadas!</span>
                    <span className="text-[11px] text-zinc-400">
                      Tu teléfono ya está conectado para recibir alertas de sellos y premios.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">
                    Pulsa el botón abajo y acepta el permiso cuando el teléfono te pregunte si deseas permitir notificaciones:
                  </p>
                  <Button
                    onClick={handleActivateNotifications}
                    isLoading={isRequestingNotification}
                    className="w-full bg-gradient-to-r from-brand-600 to-purple-700 hover:from-brand-500 hover:to-purple-600 text-white text-xs font-semibold py-3 rounded-xl shadow-glow-purple flex items-center justify-center gap-2"
                  >
                    <Bell className="w-4 h-4" />
                    <span>Activar Notificaciones en mi Teléfono</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'whatsapp' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/20 flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 leading-relaxed">
                  <strong className="text-white block font-medium mb-0.5">
                    Respaldo Seguro en tu WhatsApp
                  </strong>
                  Enviate el enlace directo de tu tarjeta a tu propio chat de WhatsApp o mensajes guardados. Así nunca la perderás aunque cambies de celular.
                </div>
              </div>

              <div className="bg-surface-100/70 p-3.5 rounded-xl border border-white/5 space-y-2">
                <div className="text-[11px] font-mono text-zinc-400">Tu Tarjeta Oficial:</div>
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>{customerName}</span>
                  <span className="font-mono text-brand-300 text-[11px]">{serialNumber}</span>
                </div>
              </div>

              <Button
                onClick={handleShareWhatsApp}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Enviar Enlace Directo a mi WhatsApp</span>
              </Button>
            </div>
          )}
        </div>

        {/* Footer del Modal */}
        <div className="p-3 border-t border-white/[0.08] bg-surface-100/80 flex items-center justify-between text-[11px] text-zinc-400">
          <span>{merchantName} · Sistema Local-First</span>
          <button
            onClick={onClose}
            className="text-brand-300 hover:text-white font-medium"
          >
            Listo, volver a la tarjeta
          </button>
        </div>
      </div>
    </div>
  );
}
