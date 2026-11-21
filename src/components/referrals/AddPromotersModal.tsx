'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  UserPlus,
  Users,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import {
  isValidReferralCode,
  normalizeReferralCode,
} from '@/types/referrals';

export interface AddPromotersModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'single' | 'batch';
  onCreated: () => void;
}

interface ParsedBatchLine {
  lineNumber: number;
  name: string;
  phone: string | null;
  code?: string;
  warning?: string;
}

function parseBatchLines(raw: string): ParsedBatchLine[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const delimiter = line.includes('\t')
      ? '\t'
      : line.includes(';')
        ? ';'
        : ',';
    const parts = line.split(delimiter).map((p) => p.trim());
    const name = parts[0] || '';
    const phone = parts[1] ? parts[1] : null;
    const rawCode = parts[2] ? parts[2] : '';
    const normalizedCode = rawCode ? normalizeReferralCode(rawCode) : undefined;

    let warning: string | undefined;
    if (name.length < 2) {
      warning = 'Nombre muy corto (mín. 2 caracteres)';
    } else if (normalizedCode !== undefined && !isValidReferralCode(normalizedCode)) {
      warning = 'Código inválido (3-24 A-Z, 0-9, -)';
    }

    return {
      lineNumber: index + 1,
      name,
      phone,
      code: normalizedCode || undefined,
      warning,
    };
  });
}

const SAMPLE_BATCH_TEXT = [
  'María Gómez, +573001112233, MARIA01',
  'Carlos Ruiz, +573004445566, CARLOS02',
  'Valentina Pérez, +573107778899',
  'Andrés Silva, +573152223344',
].join('\n');

export function AddPromotersModal({
  isOpen,
  onClose,
  defaultMode = 'single',
  onCreated,
}: AddPromotersModalProps) {
  const [mode, setMode] = useState<'single' | 'batch'>(defaultMode);

  // Single mode state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [alias, setAlias] = useState('');
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');

  // Batch mode state
  const [batchText, setBatchText] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode(defaultMode);
  }, [isOpen, defaultMode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const normalizedSingleCode = useMemo(
    () => (code.trim() ? normalizeReferralCode(code) : ''),
    [code]
  );

  const parsedBatch = useMemo(() => parseBatchLines(batchText), [batchText]);
  const validBatchRows = useMemo(
    () => parsedBatch.filter((row) => !row.warning),
    [parsedBatch]
  );
  const invalidBatchRows = useMemo(
    () => parsedBatch.filter((row) => Boolean(row.warning)),
    [parsedBatch]
  );

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setPhone('');
    setAlias('');
    setCode('');
    setNotes('');
    setBatchText('');
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error('Ingresa el nombre completo del embajador');
      return;
    }
    if (normalizedSingleCode && !isValidReferralCode(normalizedSingleCode)) {
      toast.error('El código debe tener entre 3 y 24 caracteres (A-Z, 0-9, guiones)');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          alias: alias.trim() || null,
          code: normalizedSingleCode || undefined,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo crear el embajador');
      }

      const createdCode = data.promoter?.code || normalizedSingleCode;
      toast.success(`Embajador ${name.trim()} creado`, {
        description: createdCode ? `Código QR asignado: ${createdCode}` : 'QR listo para compartir.',
      });
      resetForm();
      onCreated();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar embajador');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validBatchRows.length === 0) {
      toast.error('Pega al menos un embajador válido (Nombre, Teléfono, CódigoOpcional)');
      return;
    }
    if (validBatchRows.length > 50) {
      toast.error('Máximo 50 embajadores por lote');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          promoters: validBatchRows.map((row) => ({
            name: row.name,
            phone: row.phone,
            code: row.code,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo importar el lote');
      }

      const createdCount = Array.isArray(data.created) ? data.created.length : validBatchRows.length;
      const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : 0;

      if (skippedCount > 0) {
        toast.warning(`${createdCount} embajadores creados · ${skippedCount} omitidos`, {
          description: 'Algunos códigos ya existían en la plataforma.',
        });
      } else {
        toast.success(`¡${createdCount} embajadores QR creados en lote!`, {
          description: 'Ya puedes descargar sus tarjetas QR individuales y enviarlas por WhatsApp.',
        });
      }

      resetForm();
      onCreated();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear lote de embajadores');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-promoters-title"
      onClick={onClose}
    >
      <div
        className="bg-surface-200 border border-white/10 rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto custom-scrollbar shadow-2xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-surface-100/70 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 id="add-promoters-title" className="text-sm font-bold text-white">
                Agregar Embajadores QR
              </h3>
              <p className="text-[11px] text-zinc-400">
                Crea 1 embajador o pega tus ~20 promotores en bloque en segundos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 border-b border-white/[0.08] bg-surface-100/30 text-xs font-mono">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mode === 'single'
                ? 'border-brand-500 text-brand-300 font-bold bg-brand-500/10'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Embajador Individual</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('batch')}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mode === 'batch'
                ? 'border-champagne text-champagne-light font-bold bg-champagne/10'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Carga en Lote (hasta 50)</span>
          </button>
        </div>

        {mode === 'single' ? (
          <form onSubmit={(e) => void handleSingleSubmit(e)} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="prom-name" className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  Nombre completo *
                </label>
                <input
                  id="prom-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: María Fernanda Gómez"
                  className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="prom-phone" className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  WhatsApp / Teléfono
                </label>
                <input
                  id="prom-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+57 300 123 4567"
                  className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="prom-alias" className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  Alias / Instagram (opcional)
                </label>
                <input
                  id="prom-alias"
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="Ej: @mafe.coffee"
                  className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="prom-code" className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                    Código QR (opcional)
                  </label>
                  {normalizedSingleCode && (
                    <span className="text-[10px] font-mono text-brand-300">
                      /r/{normalizedSingleCode}
                    </span>
                  )}
                </div>
                <input
                  id="prom-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Auto (ej: MARIA01)"
                  className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-sm font-mono uppercase text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prom-notes" className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Notas internas (opcional)
              </label>
              <textarea
                id="prom-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Influenciadora universitaria, turno tarde, grupo VIP..."
                className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
              <Button type="button" variant="ghost" size="md" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
                <UserPlus className="w-4 h-4" />
                Crear Embajador QR
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleBatchSubmit(e)} className="p-5 space-y-4">
            <div className="p-3 rounded-lg bg-champagne/10 border border-champagne/25 flex items-start justify-between gap-3">
              <div className="text-xs text-zinc-200 leading-relaxed">
                <strong className="text-champagne-light block mb-0.5">
                  Pega una persona por línea:
                </strong>
                <code className="text-[11px] font-mono text-zinc-300">
                  Nombre, Teléfono, CódigoOpcional
                </code>{' '}
                (si omites el código, generamos uno limpio automáticamente como{' '}
                <code className="text-[11px] font-mono text-brand-300">MARIA01</code>).
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBatchText(SAMPLE_BATCH_TEXT)}
                className="shrink-0 text-[11px]"
              >
                <Wand2 className="w-3.5 h-3.5 text-champagne" />
                Ejemplo
              </Button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="batch-textarea" className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Lista de Embajadores (Excel / CSV / Texto)
              </label>
              <textarea
                id="batch-textarea"
                rows={7}
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={'Ana López, +573001112233, ANA01\nJuan Pérez, +573114445566\nSofía Díaz'}
                className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2.5 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-champagne custom-scrollbar"
              />
            </div>

            {parsedBatch.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Badge variant="success">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {validBatchRows.length} válidos
                    </Badge>
                    {invalidBatchRows.length > 0 && (
                      <Badge variant="warning">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {invalidBatchRows.length} con error
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-500">Máximo 50 por lote</span>
                </div>

                <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-lg border border-white/[0.08] bg-surface-100/60 divide-y divide-white/[0.05]">
                  {parsedBatch.map((row) => (
                    <div
                      key={`${row.lineNumber}-${row.name}`}
                      className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-zinc-600 w-5 shrink-0">#{row.lineNumber}</span>
                        <span className="text-white font-sans font-medium truncate">
                          {row.name || '(vacío)'}
                        </span>
                        {row.phone && (
                          <span className="text-zinc-400 text-[11px] truncate hidden sm:inline">
                            {row.phone}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0">
                        {row.warning ? (
                          <span className="text-[10px] text-amber-400">{row.warning}</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/30">
                            {row.code || 'AUTO'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
              <Button type="button" variant="ghost" size="md" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="champagne"
                size="md"
                disabled={validBatchRows.length === 0 || validBatchRows.length > 50}
                isLoading={isSubmitting}
              >
                <Sparkles className="w-4 h-4" />
                Crear {validBatchRows.length > 0 ? `${validBatchRows.length} Embajadores` : 'Lote'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
