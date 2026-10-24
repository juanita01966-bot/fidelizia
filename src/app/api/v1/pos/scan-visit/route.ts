// src/app/api/v1/pos/scan-visit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ScanVisitSchema } from '@/types/domain';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { updateGooglePassStamps } from '@/lib/wallet/google-wallet-service';
import { sendApplePushNotification } from '@/lib/wallet/apple-wallet-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Soporte tanto para ScanVisitSchema (POS completo) como para payload { pass_serial_number, stamps_to_add }
    let serial = body.pass_serial_number || body.passSerialNumber;
    let result: {
      pass: { id: string; pass_type: string; pass_serial_number: string; current_stamps: number; push_token?: string | null };
      rewardUnlocked: boolean;
      customer?: { full_name: string };
      transaction?: unknown;
    };

    if (body.merchantId && body.employeePin) {
      const validated = ScanVisitSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          {
            error: 'BAD_REQUEST',
            details: validated.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }
      serial = validated.data.passSerialNumber;
      const processResult = fideliziaStore.processScanVisit({
        merchantId: validated.data.merchantId,
        employeePin: validated.data.employeePin,
        passSerialNumber: validated.data.passSerialNumber,
        ticketNumber: validated.data.ticketNumber,
        amount: validated.data.amount,
        scannerLat: validated.data.scannerCoordinates?.latitude,
        scannerLng: validated.data.scannerCoordinates?.longitude,
      });

      const passRecord = await fideliziaStore.getPassWithCustomerBySerial(serial);
      result = {
        pass: passRecord?.pass || {
          id: 'pass-001',
          pass_type: 'google',
          pass_serial_number: serial,
          current_stamps: processResult.stampsCurrent,
        },
        rewardUnlocked: processResult.rewardReady,
        customer: { full_name: processResult.customerName },
        transaction: processResult,
      };
    } else {
      if (!serial) {
        return NextResponse.json(
          { error: 'El serial del pase es obligatorio' },
          { status: 400 }
        );
      }
      const record = await fideliziaStore.getPassWithCustomerBySerial(serial);
      if (!record || record.pass.status !== 'active') {
        return NextResponse.json(
          { error: 'Pase no encontrado o suspendido' },
          { status: 404 }
        );
      }
      const merchant = fideliziaStore.merchant;
      const stampsNeeded = merchant.stamps_needed || 8;
      const updatedStamps = Math.min(stampsNeeded, record.pass.current_stamps + (body.stamps_to_add || 1));
      const updatedPass = await fideliziaStore.updatePassStamps(record.pass.id, updatedStamps);
      result = {
        pass: updatedPass,
        rewardUnlocked: updatedStamps >= stampsNeeded,
        customer: record.customer,
      };
    }

    // Disparar sincronización con Google Wallet y Apple Wallet en paralelo
    const pass = result.pass;
    const record = await fideliziaStore.getPassWithCustomerBySerial(serial);
    const customer = record?.customer;
    const merchant = fideliziaStore.merchant;
    const stampsNeeded = merchant.stamps_needed || 8;
    const customerName = customer?.full_name || 'Miembro';
    const rewardDescription = customer?.custom_reward || merchant.reward_description || 'Premio de Autor';

    const notificationMessage = result.rewardUnlocked
      ? `🎉 ¡FELICIDADES ${customerName.toUpperCase()}! Has completado tus ${stampsNeeded} sellos en ${merchant.name}. Tu premio "${rewardDescription}" está LISTO para reclamar en caja.`
      : `☕ ¡Sumaste un sello en ${merchant.name}! Llevas ${pass.current_stamps}/${stampsNeeded} sellos.`;

    const walletSyncTasks: Promise<unknown>[] = [];

    if (pass.pass_type === 'google') {
      walletSyncTasks.push(
        updateGooglePassStamps(
          pass.pass_serial_number,
          pass.current_stamps,
          notificationMessage
        )
      );
    }

    if (pass.pass_type === 'apple' && pass.push_token) {
      walletSyncTasks.push(sendApplePushNotification(pass.push_token));
    }

    // Ejecutar tareas sin bloquear respuesta en caja
    Promise.allSettled(walletSyncTasks).catch((err) =>
      console.error('[Wallet Push Notification Error]:', err)
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno al procesar escaneo';
    return NextResponse.json(
      {
        error: 'FRAUD_OR_SECURITY_BLOCK',
        message,
      },
      { status: 422 }
    );
  }
}
