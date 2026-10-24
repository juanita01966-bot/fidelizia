'use client';

import React, { useState } from 'react';
import { 
  UserCheck, 
  Lock, 
  KeyRound, 
  Camera, 
  QrCode, 
  Sparkles, 
  LogOut, 
  ShieldCheck, 
  ChevronRight,
  ArrowLeft,
  Users
} from 'lucide-react';
import { CameraViewfinder } from '@/components/scanner/CameraViewfinder';
import { PinPadModal } from '@/components/scanner/PinPadModal';
import { TicketInputDialog } from '@/components/scanner/TicketInputDialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Employee } from '@/types/domain';
import { getStore } from '@/lib/store/fidelizia-store';
import { soundEngine } from '@/lib/audio/sound-effects';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

export function PosScanWorkspace() {
  const store = getStore();

  // Empleados disponibles en el store
  const [employees, setEmployees] = useState(store.employees);
  
  // Paso 1: Selección de Staff
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Paso 2: PIN Pad de validación
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Paso 3: Operador autenticado en turno
  const [authenticatedEmployee, setAuthenticatedEmployee] = useState<Employee | null>(null);

  // Estados del Escaneo
  const [scannedSerial, setScannedSerial] = useState<string | null>(null);
  const [scannerCoords, setScannerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Estado para Canje de Recompensa (Requiere PIN Gerente)
  const [isManagerPinModalOpen, setIsManagerPinModalOpen] = useState(false);
  const [managerPinError, setManagerPinError] = useState<string | null>(null);

  // 1. Al hacer click en un empleado de la lista
  const handleSelectStaff = (emp: Employee) => {
    setSelectedEmployee(emp);
    setPinError(null);
    setIsPinModalOpen(true);
    soundEngine.playScanSuccess();
  };

  // 2. Al validar el PIN del empleado seleccionado
  const handleValidatePin = (pin: string) => {
    if (!selectedEmployee) return;

    if (pin === selectedEmployee.pin_hash) {
      setAuthenticatedEmployee(selectedEmployee);
      setIsPinModalOpen(false);
      setPinError(null);
      soundEngine.playRedeemCelebration();
      toast.success(`Turno iniciado: ${selectedEmployee.name}`, {
        description: `Rol: ${selectedEmployee.role === 'manager' || selectedEmployee.role === 'admin' ? 'Gerente / Admin' : 'Cajero / Staff'}`,
      });
    } else {
      soundEngine.playFraudAlert();
      setPinError(`PIN incorrecto para ${selectedEmployee.name}. (Pista demo: ${selectedEmployee.pin_hash})`);
    }
  };

  // 3. Callback al detectar un QR en la cámara o archivo
  const handleScanSuccess = (serial: string, coords?: { latitude: number; longitude: number } | null) => {
    setScannedSerial(serial);
    setScannerCoords(coords || null);
    setIsTicketDialogOpen(true);
  };

  // 4. Procesar suma de sello con candados antifraude
  const handleProcessTicket = async (data: { ticketNumber: string; amount: number }) => {
    if (!scannedSerial || !authenticatedEmployee) return;

    setIsProcessing(true);
    try {
      // 1. Invocar al backend central (que procesa antifraude y actualiza Google Wallet)
      const res = await fetch('/api/v1/pos/scan-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: store.merchant.id,
          employeePin: authenticatedEmployee.pin_hash,
          passSerialNumber: scannedSerial,
          ticketNumber: data.ticketNumber,
          amount: data.amount,
          scannerCoordinates: scannerCoords ? {
            latitude: scannerCoords.latitude,
            longitude: scannerCoords.longitude,
          } : undefined,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.message || resData.error || 'Error al procesar escaneo en caja');
      }

      // Sincronizar en el store local para reactividad inmediata de la UI
      try {
        store.processScanVisit({
          merchantId: store.merchant.id,
          employeePin: authenticatedEmployee.pin_hash,
          passSerialNumber: scannedSerial,
          ticketNumber: data.ticketNumber,
          amount: data.amount,
          scannerLat: scannerCoords?.latitude,
          scannerLng: scannerCoords?.longitude,
        });
      } catch {
        // Ignorar si el store local ya registró el ticket
      }

      soundEngine.playScanSuccess();
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.5 },
        colors: ['#8b5cf6', '#d4a373', '#10b981'],
      });

      const customerName = resData.customer?.full_name || 'Cliente';
      const currentStamps = resData.pass?.current_stamps || 1;
      const stampsNeeded = store.merchant.stamps_needed || 8;

      toast.success(`¡Sello sumado a ${customerName}!`, {
        description: `Balance: ${currentStamps}/${stampsNeeded} sellos. Notificación despachada a Google Wallet.`,
      });

      setIsTicketDialogOpen(false);
      setScannedSerial(null);
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

  // 5. Autorizar canje con PIN de Gerente
  const handleAuthorizeRedeem = (managerPin: string) => {
    if (!scannedSerial) return;

    try {
      const result = store.redeemReward({
        merchantId: store.merchant.id,
        passSerialNumber: scannedSerial,
        managerPin,
        stampsToDeduct: store.merchant.stamps_needed,
      });

      soundEngine.playRedeemCelebration();
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#d4a373', '#8b5cf6', '#10b981'],
      });

      toast.success('¡Recompensa Canjeada con Éxito!', {
        description: `${result.customerName} ha reclamado: ${result.rewardName}. Sellos restantes: ${result.stampsRemaining}`,
      });

      setIsManagerPinModalOpen(false);
      setIsTicketDialogOpen(false);
      setScannedSerial(null);
      setManagerPinError(null);
    } catch (err: unknown) {
      soundEngine.playFraudAlert();
      setManagerPinError(err instanceof Error ? err.message : 'PIN de Gerente inválido');
    }
  };

  const handleLogout = () => {
    setAuthenticatedEmployee(null);
    setSelectedEmployee(null);
    soundEngine.playFraudAlert();
    toast.info('Turno cerrado. Selecciona el nuevo operador en caja.');
  };

  // =========================================================================
  // VISTA 1 & 2: SELECCIÓN DE PERSONAL Y SOLICITUD DE PIN
  // =========================================================================
  if (!authenticatedEmployee) {
    return (
      <div className="min-h-screen bg-background relative flex flex-col justify-between text-left p-4 sm:p-6 overflow-hidden">
        {/* Luces de Fondo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-brand-600/15 blur-[140px] pointer-events-none rounded-full" />

        {/* Header Superior */}
        <header className="max-w-xl mx-auto w-full flex items-center justify-between pb-6 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center shadow-glow-purple border border-brand-400/40">
              <QrCode className="w-5 h-5 text-champagne" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                {store.merchant.name}
              </h1>
              <span className="text-[10px] font-mono text-zinc-400 block">Punto de Escaneo POS / Entrada de Turno</span>
            </div>
          </div>

          <a
            href="/"
            className="flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-white transition-colors bg-white/5 px-2.5 py-1.5 rounded-md border border-white/10"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Inicio
          </a>
        </header>

        {/* Contenido Central: Selección de Staff */}
        <main className="max-w-md mx-auto w-full my-auto py-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-400/30 flex items-center justify-center mx-auto mb-3 shadow-glow-purple">
              <Users className="w-7 h-7 text-champagne" />
            </div>
            <h2 className="text-xl font-bold text-white">¿Quién está en turno?</h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
              Selecciona tu perfil de personal para ingresar con tu PIN y habilitar el escáner de tarjetas.
            </p>
          </div>

          {/* Lista de Empleados */}
          <div className="space-y-3">
            {employees.map((emp) => (
              <button
                key={emp.id}
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
                        {emp.role === 'manager' || emp.role === 'admin' ? '👑 Gerente / Supervisor' : '👤 Cajero / Mesero'}
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

          <div className="mt-6 text-center">
            <span className="text-[11px] font-mono text-zinc-500">
              💡 Pista para pruebas rápidas: PIN Mateo = <code className="text-zinc-300">1234</code> · PIN Laura = <code className="text-zinc-300">9999</code>
            </span>
          </div>
        </main>

        {/* Modal de PIN para el Empleado Seleccionado */}
        {selectedEmployee && (
          <PinPadModal
            isOpen={isPinModalOpen}
            title={`Ingresa PIN de ${selectedEmployee.name}`}
            description="Ingresa tu clave personal de 4 dígitos para autorizar el punto de venta."
            onClose={() => setIsPinModalOpen(false)}
            onSubmit={handleValidatePin}
            errorMessage={pinError}
          />
        )}

        <footer className="text-center text-[10px] font-mono text-zinc-600 max-w-xl mx-auto w-full pt-4 border-t border-white/5">
          Dynamind Wallet POS Security Engine · Cifrado SHA-256
        </footer>
      </div>
    );
  }

  // =========================================================================
  // VISTA 3: ESCÁNER ACTIVO CON OPERADOR AUTENTICADO
  // =========================================================================
  return (
    <div className="min-h-screen bg-background relative flex flex-col justify-between text-left p-4 sm:p-6">
      {/* Header Superior del Escáner */}
      <header className="max-w-md mx-auto w-full flex items-center justify-between pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center font-bold text-champagne text-sm">
            {authenticatedEmployee.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white">{authenticatedEmployee.name}</span>
              <Badge variant={authenticatedEmployee.role === 'manager' || authenticatedEmployee.role === 'admin' ? 'tactical' : 'success'}>
                {authenticatedEmployee.role === 'manager' || authenticatedEmployee.role === 'admin' ? 'Gerente' : 'Cajero'}
              </Badge>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 block">{store.merchant.name} · Escáner Listo</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            className="text-xs font-mono h-8"
          >
            <LogOut className="w-3.5 h-3.5 mr-1 text-zinc-400" />
            Cerrar Turno
          </Button>
        </div>
      </header>

      {/* Cuerpo Central: Visor de Cámara y Decodificador */}
      <main className="max-w-md mx-auto w-full my-auto py-4">
        <CameraViewfinder onScanSuccess={handleScanSuccess} isProcessing={isProcessing} />
      </main>

      {/* Modal de Registro de Ticket y Factura */}
      {scannedSerial && (
        <TicketInputDialog
          isOpen={isTicketDialogOpen}
          serialNumber={scannedSerial}
          onClose={() => {
            setIsTicketDialogOpen(false);
            setScannedSerial(null);
          }}
          onSubmit={handleProcessTicket}
          onTriggerRedeem={() => setIsManagerPinModalOpen(true)}
          isRewardReady={(() => {
            const pass = store.passes.find((p) => p.pass_serial_number === scannedSerial);
            return (pass?.current_stamps || 0) >= store.merchant.stamps_needed;
          })()}
          rewardDescription={store.merchant.reward_description}
          isProcessing={isProcessing}
        />
      )}

      {/* Modal de PIN de Gerente para Canje */}
      <PinPadModal
        isOpen={isManagerPinModalOpen}
        title="Autorización de Gerente Requerida"
        description="Ingresa el PIN de Gerente (9999) para autorizar la deducción de sellos y entrega del premio."
        onClose={() => setIsManagerPinModalOpen(false)}
        onSubmit={handleAuthorizeRedeem}
        errorMessage={managerPinError}
      />

      <footer className="text-center text-[10px] font-mono text-zinc-600 max-w-md mx-auto w-full pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="w-3 h-3" />
          5 Capas Antifraude Activas
        </span>
        <a href="/#/dsb" className="text-zinc-500 hover:text-white">
          Ir al Panel DSB
        </a>
      </footer>
    </div>
  );
}
