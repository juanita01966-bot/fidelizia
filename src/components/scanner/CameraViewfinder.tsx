'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Zap, AlertCircle, RefreshCw, KeyRound, QrCode, UploadCloud, StopCircle } from 'lucide-react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { Button } from '@/components/ui/Button';
import { soundEngine } from '@/lib/audio/sound-effects';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CameraViewfinderProps {
  onScanSuccess: (serial: string, coords?: { latitude: number; longitude: number } | null) => void;
  isProcessing?: boolean;
}

export function CameraViewfinder({ onScanSuccess, isProcessing = false }: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [manualSerial, setManualSerial] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  // Obtener geolocalización del escáner
  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          // Fallback a coordenadas por defecto de la sede
          setCoords({ latitude: 4.6682, longitude: -74.0538 });
        }
      );
    }

    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // ignore
      }
      controlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Iniciar decodificación continua con ZXing Browser
  const startCamera = async () => {
    stopCamera();
    try {
      if (typeof window === 'undefined') return;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Navegador en HTTP no seguro. En dispositivos móviles la cámara exige conexión HTTPS.');
      }

      setCameraActive(true);
      setHasCameraPermission(true);

      const codeReader = new BrowserQRCodeReader();

      // Listar dispositivos para priorizar la cámara trasera en smartphones
      let targetDeviceId: string | undefined = undefined;
      try {
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        const backCam = devices.find((d) =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('trasera') ||
          d.label.toLowerCase().includes('environment')
        );
        targetDeviceId = backCam ? backCam.deviceId : devices[0]?.deviceId;
      } catch (listErr) {
        console.debug('No se pudieron listar cámaras previamente:', listErr);
      }

      if (!videoRef.current) {
        throw new Error('Elemento de video no montado en el DOM');
      }

      const controls = await codeReader.decodeFromVideoDevice(
        targetDeviceId,
        videoRef.current,
        (result) => {
          if (result && !isProcessing) {
            const text = result.getText();
            if (text && text !== lastScanned) {
              setLastScanned(text);
              soundEngine.playScanSuccess();
              if (typeof window !== 'undefined' && 'vibrate' in navigator) {
                try {
                  navigator.vibrate(200);
                } catch {
                  // ignore
                }
              }
              onScanSuccess(text.trim().toUpperCase(), coords);
              // Cooldown de 2.5s para no repetir el mismo scan inmediatamente
              setTimeout(() => setLastScanned(null), 2500);
            }
          }
        }
      );
      controlsRef.current = controls;
    } catch (err: unknown) {
      console.error('Error starting ZXing camera:', err);
      setHasCameraPermission(false);
      setCameraActive(false);
      const msg = err instanceof Error ? err.message : 'No se pudo acceder a la cámara';
      toast.error('Cámara no iniciada', {
        description: msg,
      });
    }
  };

  // Escaneo alternativo mediante foto o archivo de imagen QR
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = URL.createObjectURL(file);
      const codeReader = new BrowserQRCodeReader();
      const result = await codeReader.decodeFromImageUrl(url);
      URL.revokeObjectURL(url);

      if (result) {
        soundEngine.playScanSuccess();
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(200);
          } catch {
            // ignore
          }
        }
        onScanSuccess(result.getText().trim().toUpperCase(), coords);
        toast.success(`QR Decodificado: ${result.getText()}`);
      } else {
        toast.error('No se pudo decodificar un QR en la imagen seleccionada');
      }
    } catch {
      toast.error('No se detectó un código QR legible en la foto');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualSerial.trim()) {
      soundEngine.playScanSuccess();
      onScanSuccess(manualSerial.trim().toUpperCase(), coords);
      setManualSerial('');
    }
  };

  const handleQuickDemoScan = (serial: string) => {
    soundEngine.playScanSuccess();
    onScanSuccess(serial, coords);
  };

  const isLocalHttp = typeof window !== 'undefined' && 
    window.location.protocol === 'http:' && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1';

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Alerta contextual sobre HTTP en celulares */}
      {isLocalHttp && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2.5 text-left">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Conexión HTTP local:</strong> Los navegadores móviles bloquean el acceso a la cámara en HTTP no seguro por políticas de seguridad W3C. Para escanear con la cámara del celular, usa <strong>"Subir QR"</strong>, ingresa el serial o despliega con HTTPS en Vercel.
          </span>
        </div>
      )}

      {/* Visor de Cámara HUD */}
      <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-doppelrand flex flex-col items-center justify-center">
        {/* Elemento de video SIEMPRE presente en el DOM para evitar que videoRef.current sea null */}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={cn("w-full h-full object-cover", !cameraActive && "hidden")} 
        />

        {!cameraActive && (
          <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-400">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
              <Camera className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-white">Cámara Web / Móvil POS</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              Apunta la cámara al código QR de la tarjeta Apple o Google Wallet del cliente
            </p>
            <div className="flex gap-2 mt-4">
              <Button
                variant="tactical"
                size="sm"
                onClick={startCamera}
              >
                <Zap className="w-4 h-4 text-purple-400 mr-1.5" />
                Activar Cámara
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="w-4 h-4 text-champagne mr-1.5" />
                Subir QR
              </Button>
            </div>
          </div>
        )}

        {/* Botón flotante para pausar/detener cámara si está activa */}
        {cameraActive && (
          <div className="absolute top-3 right-3 z-20 flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-black/70 hover:bg-black text-white p-1.5 rounded-lg border border-white/20 text-[11px] flex items-center gap-1 backdrop-blur-md"
              title="Cargar foto de QR"
            >
              <UploadCloud className="w-3.5 h-3.5 text-champagne" />
            </button>
            <button
              onClick={stopCamera}
              className="bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-lg text-[11px] flex items-center gap-1 backdrop-blur-md"
              title="Detener Cámara"
            >
              <StopCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Input oculto para archivo de imagen QR */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* Retícula HUD Táctica */}
        <div className="absolute inset-8 pointer-events-none flex flex-col justify-between">
          <div className="flex justify-between">
            <div className="w-8 h-8 border-t-2 border-l-2 border-brand-400" />
            <div className="w-8 h-8 border-t-2 border-r-2 border-brand-400" />
          </div>

          {/* Línea Láser animada a 60 FPS */}
          <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-laser-scan" />

          <div className="flex justify-between">
            <div className="w-8 h-8 border-b-2 border-l-2 border-brand-400" />
            <div className="w-8 h-8 border-b-2 border-r-2 border-brand-400" />
          </div>
        </div>

        {/* Telemetría inferior del HUD */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-zinc-400 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded border border-white/10">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            SISTEMA ACTIVO
          </span>
          <span>{coords ? `GPS: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'GPS FIXING...'}</span>
        </div>
      </div>

      {/* Entrada Manual de Respaldo */}
      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <input
          type="text"
          value={manualSerial}
          onChange={(e) => setManualSerial(e.target.value)}
          placeholder="O ingresa serial (Ej: PASS-CANELO-001)"
          disabled={isProcessing}
          className="flex-1 bg-surface-100 border border-white/10 rounded px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
        />
        <Button variant="secondary" size="sm" type="submit" disabled={!manualSerial.trim() || isProcessing}>
          <QrCode className="w-4 h-4 mr-1.5 text-brand-400" />
          Escanear
        </Button>
      </form>

      {/* Atajos Rápidos para Pruebas Demo */}
      <div className="p-3 bg-surface-100/60 border border-white/5 rounded-lg">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-2">
          Atajos Rápidos de Prueba (Demo Canelo):
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleQuickDemoScan('PASS-CANELO-001')}
            className="text-left p-2 bg-black/40 hover:bg-white/5 border border-white/5 rounded text-xs transition-colors"
          >
            <span className="font-semibold text-white block">Carlos Mendoza</span>
            <span className="text-[10px] font-mono text-purple-400">PASS-CANELO-001 (8 sellos)</span>
          </button>
          <button
            onClick={() => handleQuickDemoScan('PASS-CANELO-002')}
            className="text-left p-2 bg-black/40 hover:bg-white/5 border border-white/5 rounded text-xs transition-colors"
          >
            <span className="font-semibold text-white block">Valentina Duque</span>
            <span className="text-[10px] font-mono text-emerald-400">PASS-CANELO-002 (9 sellos)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
