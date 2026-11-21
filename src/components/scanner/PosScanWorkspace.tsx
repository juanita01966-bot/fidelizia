'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  QrCode,
  LogOut,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  Users,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { CameraViewfinder } from '@/components/scanner/CameraViewfinder';
import { PinPadModal } from '@/components/scanner/PinPadModal';
import { TicketInputDialog } from '@/components/scanner/TicketInputDialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Location, LoyaltyTier } from '@/types/domain';
import { soundEngine } from '@/lib/audio/sound-effects';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

interface PosEmployeeDto {
  id: string;
  merchant_id: string;
  location_id: string | null;
  name: string;
  username: string | null;
  email: string | null;
  role: 'cashier' | 'manager' | 'admin';
  is_active: boolean;
}

interface PosMerchantDto {
  id: string;
  name: string;
  slug: string;
  stamps_needed: number;
  reward_description: string;
}

interface ScannedPassSummary {
  serial: string;
  customerName: string;
  loyaltyTier: LoyaltyTier;
  currentStamps: number;
  stampsNeeded: number;
  rewardUnlocked: boolean;
  rewardDescription: string;
  customReward: string | null;
  discountPercentage: number | null;
}

export function PosScanWorkspace({ merchantSlug = 'cafe-canelo' }: { merchantSlug?: string }) {
  const [merchant, setMerchant] = useState<PosMerchantDto | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [employees, setEmployees] = useState<PosEmployeeDto[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);

  const [selectedEmployee, setSelectedEmployee] = useState<PosEmployeeDto | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  const [authenticatedEmployee, setAuthenticatedEmployee] = useState<PosEmployeeDto | null>(null);
  const [operatorPin, setOperatorPin] = useState<string>('');

  const [scannedSerial, setScannedSerial] = useState<string | null>(null);
  const [scannedPassSummary, setScannedPassSummary] = useState<ScannedPassSummary | null>(null);
  const [scannerCoords, setScannerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [isManagerPinModalOpen, setIsManagerPinModalOpen] = useState(false);
  const [managerPinError, setManagerPinError] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadPosContext() {
      setIsLoadingContext(true);
      setContextError(null);
      try {
        const res = await fetch(
          `/api/v1/pos/context?merchantSlug=${encodeURIComponent(merchantSlug)}`,
          { signal: controller.signal, cache: 'no-store' }
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'No se pudo cargar el comercio para este punto POS');
        }
        setMerchant(data.merchant);
        setLocations(data.locations || []);
        setEmployees(data.employees || []);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setContextError(err instanceof Error ? err.message : 'Error cargando punto POS');
      } finally {
        setIsLoadingContext(false);
      }
    }
    void loadPosContext();
    return () => controller.abort();
  }, [merchantSlug]);

  const handleSelectStaff = (emp: PosEmployeeDto) => {
    setSelectedEmployee(emp);
    setPinError(null);
    setIsPinModalOpen(true);
    soundEngine.playScanSuccess();
  };

  const handleValidatePin = async (pin: string) => {
    if (!selectedEmployee || !merchant) return;
    setIsVerifyingPin(true);
    setPinError(null);

    try {
      const identifier = selectedEmployee.username || selectedEmployee.email || selectedEmployee.name;
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          merchantSlug: merchant.slug,
          identifier,
          secret: pin,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        soundEngine.playFraudAlert();
        setPinError(data.message || 'PIN incorrecto para este operador');
        return;
      }

      setAuthenticatedEmployee(selectedEmployee);
      setOperatorPin(pin);
      setIsPinModalOpen(false);
      setPinError(null);
      soundEngine.playRedeemCelebration();
      toast.success(`Turno iniciado: ${selectedEmployee.name}`, {
        description: `Rol: ${selectedEmployee.role === 'manager' || selectedEmployee.role === 'admin' ? 'Gerente / Admin' : 'Cajero / Staff'}`,
      });
    } catch {
      soundEngine.playFraudAlert();
      setPinError('Error de conexión al validar PIN');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleScanSuccess = async (
    serial: string,
    coords?: { latitude: number; longitude: number } | null
  ) => {
    setScannedSerial(serial);
    setScannerCoords(coords || null);
    setScannedPassSummary(null);
    setIsTicketDialogOpen(true);

    try {
      const res = await fetch(
        `/api/v1/passes/status?serial=${encodeURIComponent(serial)}&merchantSlug=${encodeURIComponent(merchant?.slug || merchantSlug)}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const summary = (await res.json()) as ScannedPassSummary;
        setScannedPassSummary(summary);
      }
    } catch {
      // Allow ticket entry even if pre-lookup fails; scan-visit validates authoritatively
    }
  };

  const handleProcessTicket = async (data: { ticketNumber: string; amount: number }) => {
    if (!scannedSerial || !authenticatedEmployee || !merchant) return;

    setIsProcessing(true);
    try {
      const primaryLocationId =
        authenticatedEmployee.location_id || locations.find((l) => l.is_active)?.id || null;

      const res = await fetch('/api/v1/pos/scan-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: merchant.id,
          employeePin: operatorPin,
          passSerialNumber: scannedSerial,
          ticketNumber: data.ticketNumber,
          amount: data.amount,
          locationId: primaryLocationId,
          scannerCoordinates: scannerCoords
            ? {
                latitude: scannerCoords.latitude,
                longitude: scannerCoords.longitude,
              }
            : undefined,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.message || resData.error || 'Error al procesar escaneo en caja');
      }

      soundEngine.playScanSuccess();
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.5 },
        colors: ['#8b5cf6', '#d4a373', '#10b981'],
      });

      const customerName = resData.customer?.full_name || 'Cliente';
      const currentStamps = resData.pass?.current_stamps ?? 1;
      const stampsNeeded = merchant.stamps_needed || 10;

      let walletMsg = 'Tarjeta actualizada en servidor.';
      if (resData.walletSync?.google?.attempted) {
        walletMsg = resData.walletSync.google.success
          ? 'Notificación enviada a Google Wallet.'
          : `Google Wallet pendiente (${resData.walletSync.google.error || 'sin guardar aún'}).`;
      } else if (resData.walletSync?.apple?.attempted) {
        walletMsg = resData.walletSync.apple.success
          ? `Push APNs enviado a ${resData.walletSync.apple.sentCount} dispositivo(s) Apple.`
          : 'Pase Apple actualizado para próxima sincronización.';
      }

      toast.success(`¡Sello sumado a ${customerName}!`, {
        description: `Balance: ${currentStamps}/${stampsNeeded} sellos. ${walletMsg}`,
      });

      setIsTicketDialogOpen(false);
      setScannedSerial(null);
      setScannedPassSummary(null);
    } catch (err: unknown) {
      soundEngine.playFraudAlert();
      const msg = err instanceof Error ? err.message : 'Error al procesar escaneo';
      toast.error('Bloqueo o Error en Caja', {
        description: msg,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAuthorizeRedeem = async (managerPin: string) => {
    if (!scannedSerial || !merchant) return;
    setIsRedeeming(true);
    setManagerPinError(null);

    try {
      const res = await fetch('/api/v1/pos/redeem-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: merchant.id,
          passSerialNumber: scannedSerial,
          managerPin,
          stampsToDeduct: merchant.stamps_needed,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        soundEngine.playFraudAlert();
        setManagerPinError(resData.message || 'PIN de Gerente inválido o sellos insuficientes');
        return;
      }

      soundEngine.playRedeemCelebration();
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#d4a373', '#8b5cf6', '#10b981'],
      });

      const redemption = resData.redemption;
      toast.success('¡Recompensa Canjeada con Éxito!', {
        description: `${redemption?.customer_name || 'Cliente'} reclamó: ${redemption?.reward_name || merchant.reward_description}. Sellos restantes: ${redemption?.stamps_remaining ?? 0}`,
      });

      setIsManagerPinModalOpen(false);
      setIsTicketDialogOpen(false);
      setScannedSerial(null);
      setScannedPassSummary(null);
      setManagerPinError(null);
    } catch {
      soundEngine.playFraudAlert();
      setManagerPinError('Error de conexión al autorizar canje');
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleLogout = async () => {
    setAuthenticatedEmployee(null);
    setSelectedEmployee(null);
    setOperatorPin('');
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    soundEngine.playFraudAlert();
    toast.info('Turno cerrado. Selecciona el nuevo operador en caja.');
  };

  if (isLoadingContext) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-zinc-400 text-xs font-mono">
          <Loader2 className="w-7 h-7 animate-spin text-brand-400" />
          <span>Cargando terminal POS segura...</span>
        </div>
      </div>
    );
  }

  if (contextError || !merchant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface-200 border border-red-500/30 rounded-2xl p-6 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h1 className="text-lg font-bold text-white">Terminal POS no disponible</h1>
          <p className="text-xs text-zinc-400">{contextError || 'Comercio no encontrado'}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-brand-300 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (!authenticatedEmployee) {
    return (
      <div className="min-h-screen bg-background relative flex flex-col justify-between text-left p-4 sm:p-6 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-brand-600/15 blur-[140px] pointer-events-none rounded-full" />

        <header className="max-w-xl mx-auto w-full flex items-center justify-between pb-6 border-b border-white/[0.08] relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center shadow-glow-purple border border-brand-400/40">
              <QrCode className="w-5 h-5 text-champagne" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                {merchant.name}
              </h1>
              <span className="text-[10px] font-mono text-zinc-400 block">
                Punto de Escaneo POS / Entrada de Turno
              </span>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-white transition-colors bg-white/5 px-2.5 py-1.5 rounded-md border border-white/10"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Inicio
          </Link>
        </header>

        <main className="max-w-md mx-auto w-full my-auto py-8 relative z-10">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-400/30 flex items-center justify-center mx-auto mb-3 shadow-glow-purple">
              <Users className="w-7 h-7 text-champagne" />
            </div>
            <h2 className="text-xl font-bold text-white">¿Quién está en turno?</h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
              Selecciona tu perfil de personal para ingresar con tu PIN y habilitar el escáner de tarjetas.
            </p>
          </div>

          {employees.length === 0 ? (
            <div className="p-6 rounded-xl bg-surface-100 border border-white/10 text-center text-xs text-zinc-400">
              No hay operadores activos configurados para este comercio.
            </div>
          ) : (
            <div className="space-y-3">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => handleSelectStaff(emp)}
                  className="w-full p-4 rounded-xl bg-surface-100 hover:bg-surface-50 border border-white/10 hover:border-brand-500/50 flex items-center justify-between transition-all group text-left shadow-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-champagne group-hover:scale-105 transition-transform">
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-champagne transition-colors">
                        {emp.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase">
                          {emp.role === 'manager' || emp.role === 'admin'
                            ? 'Gerente / Supervisor'
                            : 'Cajero / Operador'}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">· PIN requerido</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={emp.role === 'manager' || emp.role === 'admin' ? 'tactical' : 'default'}>
                      {emp.role === 'manager' || emp.role === 'admin' ? 'Gerente' : 'Staff'}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>

        {selectedEmployee && (
          <PinPadModal
            isOpen={isPinModalOpen}
            title={`Ingresa PIN de ${selectedEmployee.name}`}
            description="Ingresa tu clave personal de 4 dígitos para autorizar el punto de venta."
            onClose={() => setIsPinModalOpen(false)}
            onSubmit={handleValidatePin}
            errorMessage={pinError}
            isSubmitting={isVerifyingPin}
          />
        )}

        <footer className="text-center text-[10px] font-mono text-zinc-600 max-w-xl mx-auto w-full pt-4 border-t border-white/5 relative z-10">
          Fidelizia Wallet POS Security Engine · Autenticación Cifrada
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative flex flex-col justify-between text-left p-4 sm:p-6">
      <header className="max-w-md mx-auto w-full flex items-center justify-between pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center font-bold text-champagne text-sm">
            {authenticatedEmployee.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white">{authenticatedEmployee.name}</span>
              <Badge
                variant={
                  authenticatedEmployee.role === 'manager' || authenticatedEmployee.role === 'admin'
                    ? 'tactical'
                    : 'success'
                }
              >
                {authenticatedEmployee.role === 'manager' || authenticatedEmployee.role === 'admin'
                  ? 'Gerente'
                  : 'Cajero'}
              </Badge>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 block">
              {merchant.name} · Escáner Listo
            </span>
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={handleLogout} className="text-xs font-mono h-8">
          <LogOut className="w-3.5 h-3.5 mr-1 text-zinc-400" />
          Cerrar Turno
        </Button>
      </header>

      <main className="max-w-md mx-auto w-full my-auto py-4">
        <CameraViewfinder onScanSuccess={handleScanSuccess} isProcessing={isProcessing} />
      </main>

      {scannedSerial && (
        <TicketInputDialog
          isOpen={isTicketDialogOpen}
          serialNumber={scannedSerial}
          onClose={() => {
            setIsTicketDialogOpen(false);
            setScannedSerial(null);
            setScannedPassSummary(null);
          }}
          onSubmit={handleProcessTicket}
          onTriggerRedeem={() => {
            setManagerPinError(null);
            setIsManagerPinModalOpen(true);
          }}
          isRewardReady={
            scannedPassSummary
              ? scannedPassSummary.rewardUnlocked ||
                scannedPassSummary.currentStamps >= merchant.stamps_needed
              : false
          }
          rewardDescription={scannedPassSummary?.rewardDescription || merchant.reward_description}
          customerName={scannedPassSummary?.customerName}
          loyaltyTier={scannedPassSummary?.loyaltyTier}
          discountPercentage={scannedPassSummary?.discountPercentage}
          customReward={scannedPassSummary?.customReward}
          currentStamps={scannedPassSummary?.currentStamps}
          stampsNeeded={scannedPassSummary?.stampsNeeded ?? merchant.stamps_needed}
          isProcessing={isProcessing}
        />
      )}

      <PinPadModal
        isOpen={isManagerPinModalOpen}
        title="Autorización de Gerente Requerida"
        description="Ingresa el PIN de un Gerente o Administrador autorizado para entregar el premio."
        onClose={() => setIsManagerPinModalOpen(false)}
        onSubmit={handleAuthorizeRedeem}
        errorMessage={managerPinError}
        isSubmitting={isRedeeming}
      />

      <footer className="text-center text-[10px] font-mono text-zinc-600 max-w-md mx-auto w-full pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="w-3 h-3" />
          5 Capas Antifraude Activas
        </span>
        <Link href="/admin/dashboard" className="text-zinc-500 hover:text-white">
          Ir al Panel Admin
        </Link>
      </footer>
    </div>
  );
}
