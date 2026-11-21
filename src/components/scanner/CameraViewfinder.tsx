'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Zap, AlertCircle, QrCode, UploadCloud, StopCircle } from 'lucide-react';
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
  const isMountedRef = useRef(true);
  const isProcessingRef = useRef(isProcessing);
  const lastScannedRef = useRef<string | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const [manualSerial, setManualSerial] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'fixing' | 'ready' | 'unavailable' | 'denied'>('fixing');
  const [cameraActive, setCameraActive] = useState(false);
  const [isLocalHttp, setIsLocalHttp] = useState(false);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  const stopCamera = useCallback(() => {
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
    if (isMountedRef.current) {
      setCameraActive(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (typeof window !== 'undefined') {
      setIsLocalHttp(
        window.location.protocol === 'http:' &&
          window.location.hostname !== 'localhost' &&
          window.location.hostname !== '127.0.0.1'
      );

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!isMountedRef.current) return;
            const nextCoords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            coordsRef.current = nextCoords;
            setCoords(nextCoords);
            setGpsStatus('ready');
          },
          (err) => {
            if (!isMountedRef.current) return;
            coordsRef.current = null;
            setCoords(null);
            setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        setGpsStatus('unavailable');
      }
    }

    return () => {
      isMountedRef.current = false;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = async () => {
    stopCamera();
    try {
      if (typeof window === 'undefined') return;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Navegador en HTTP no seguro. En dispositivos móviles la cámara exige conexión HTTPS.'
        );
      }

      setCameraActive(true);

      const codeReader = new BrowserQRCodeReader();
      let targetDeviceId: string | undefined;
      try {
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        const backCam = devices.find(
          (d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('trasera') ||
            d.label.toLowerCase().includes('environment')
        );
        targetDeviceId = backCam ? backCam.deviceId : devices[0]?.deviceId;
      } catch {
        // Use default camera
      }

      if (!videoRef.current) {
        throw new Error('Elemento de video no montado en el DOM');
      }

      const controls = await codeReader.decodeFromVideoDevice(
        targetDeviceId,
        videoRef.current,
        (result) => {
          if (!isMountedRef.current || !result || isProcessingRef.current) return;
          const text = result.getText()?.trim().toUpperCase();
          if (text && text !== lastScannedRef.current) {
            lastScannedRef.current = text;
            soundEngine.playScanSuccess();
            if ('vibrate' in navigator) {
              try {
                navigator.vibrate(200);
              } catch {
                // ignore
              }
            }
            onScanSuccess(text, coordsRef.current);
            if (cooldownTimerRef.current) {
              clearTimeout(cooldownTimerRef.current);
            }
            cooldownTimerRef.current = setTimeout(() => {
              lastScannedRef.current = null;
            }, 2500);
          }
        }
      );
      controlsRef.current = controls;
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setCameraActive(false);
      }
      const msg = err instanceof Error ? err.message : 'No se pudo acceder a la cámara';
      toast.error('Cámara no iniciada', {
        description: msg,
      });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    try {
      const codeReader = new BrowserQRCodeReader();
      const result = await codeReader.decodeFromImageUrl(url);

      if (result) {
        const text = result.getText().trim().toUpperCase();
        soundEngine.playScanSuccess();
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(200);
          } catch {
            // ignore
          }
        }
        onScanSuccess(text, coordsRef.current);
        toast.success(`QR Decodificado: ${text}`);
      } else {
        toast.error('No se pudo decodificar un QR en la imagen seleccionada');
      }
    } catch {
      toast.error('No se detectó un código QR legible en la foto');
    } finally {
      URL.revokeObjectURL(url);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualSerial.trim()) {
      soundEngine.playScanSuccess();
      onScanSuccess(manualSerial.trim().toUpperCase(), coordsRef.current);
      setManualSerial('');
    }
  };

  const gpsLabel =
    gpsStatus === 'ready' && coords
      ? `GPS: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
      : gpsStatus === 'denied'
        ? 'GPS DENEGADO'
        : gpsStatus === 'unavailable'
          ? 'GPS NO DISPONIBLE'
          : 'GPS FIXING...';

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {isLocalHttp && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2.5 text-left">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Conexión HTTP local:</strong> Los navegadores móviles bloquean la cámara en HTTP no seguro. Para escanear con la cámara del celular, usa <strong>&quot;Subir QR&quot;</strong>, ingresa el serial manualmente o usa HTTPS.
          </span>
        </div>
      )}

      <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-doppelrand flex flex-col items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn('w-full h-full object-cover', !cameraActive && 'hidden')}
        />

        {!cameraActive && (
          <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-400">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
              <Camera className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-white">Cámara Web / Móvil POS</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              Apunta la cámara al código QR de la tarjeta Apple Wallet, Google Wallet o tarjeta web del cliente
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="tactical" size="sm" onClick={startCamera}>
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

        {cameraActive && (
          <div className="absolute top-3 right-3 z-20 flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Cargar foto de QR"
              className="bg-black/70 hover:bg-black text-white p-1.5 rounded-lg border border-white/20 text-[11px] flex items-center gap-1 backdrop-blur-md"
              title="Cargar foto de QR"
            >
              <UploadCloud className="w-3.5 h-3.5 text-champagne" />
            </button>
            <button
              type="button"
              onClick={stopCamera}
              aria-label="Detener Cámara"
              className="bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-lg text-[11px] flex items-center gap-1 backdrop-blur-md"
              title="Detener Cámara"
            >
              <StopCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        <div className="absolute inset-8 pointer-events-none flex flex-col justify-between">
          <div className="flex justify-between">
            <div className="w-8 h-8 border-t-2 border-l-2 border-brand-400" />
            <div className="w-8 h-8 border-t-2 border-r-2 border-brand-400" />
          </div>

          <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-laser-scan" />

          <div className="flex justify-between">
            <div className="w-8 h-8 border-b-2 border-l-2 border-brand-400" />
            <div className="w-8 h-8 border-b-2 border-r-2 border-brand-400" />
          </div>
        </div>

        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-zinc-400 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded border border-white/10">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            SISTEMA ACTIVO
          </span>
          <span className={gpsStatus === 'denied' ? 'text-amber-400' : undefined}>{gpsLabel}</span>
        </div>
      </div>

      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <input
          type="text"
          value={manualSerial}
          onChange={(e) => setManualSerial(e.target.value)}
          placeholder="Ingresa serial (Ej: PASS-CAFEC-1A2B)"
          disabled={isProcessing}
          aria-label="Serial del pase"
          className="flex-1 bg-surface-100 border border-white/10 rounded px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
        />
        <Button variant="secondary" size="sm" type="submit" disabled={!manualSerial.trim() || isProcessing}>
          <QrCode className="w-4 h-4 mr-1.5 text-brand-400" />
          Escanear
        </Button>
      </form>
    </div>
  );
}
