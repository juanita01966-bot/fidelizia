// src/app/api/v1/notifications/push/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { broadcastGoogleWalletNotification } from '@/lib/wallet/google-wallet-service';
import { sendApplePushNotification } from '@/lib/wallet/apple-wallet-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { segment = 'all', title, body: messageBody } = body;

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: 'Título y mensaje son obligatorios' },
        { status: 400 }
      );
    }

    const customers = fideliziaStore.customers;
    const passes = fideliziaStore.passes;

    // Filtrar clientes por segmento
    const targetCustomers = segment === 'all'
      ? customers
      : customers.filter((c) => c.rfm_segment === segment);

    const targetCustomerIds = new Set(targetCustomers.map((c) => c.id));
    const targetPasses = passes.filter(
      (p) => targetCustomerIds.has(p.customer_id) && p.status === 'active'
    );

    // Separar Google Wallet y Apple Wallet
    const googleSerials = targetPasses
      .filter((p) => p.pass_type === 'google')
      .map((p) => p.pass_serial_number);

    const applePushTokens = targetPasses
      .filter((p) => p.pass_type === 'apple' && p.push_token)
      .map((p) => p.push_token as string);

    // 1. Emitir a Google Wallet REST API
    const googleResult = await broadcastGoogleWalletNotification(
      googleSerials,
      title,
      messageBody
    );

    // 2. Emitir a Apple Wallet APNs
    let appleSuccessCount = 0;
    for (const token of applePushTokens) {
      try {
        await sendApplePushNotification(token);
        appleSuccessCount++;
      } catch (err) {
        console.warn(`[Apple Push Error] Falló token ${token}:`, err);
      }
    }

    // Registrar campaña en el store
    fideliziaStore.sendPushCampaign({
      segment,
      title,
      body: messageBody,
    });

    return NextResponse.json({
      success: true,
      recipientsCount: targetPasses.length,
      googleWalletDelivered: googleResult.successCount,
      appleWalletDelivered: appleSuccessCount,
      message: `Campaña emitida exitosamente a ${targetPasses.length} dispositivos.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar campaña push';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
