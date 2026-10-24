// src/app/api/v1/notifications/push/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { supabaseAdmin } from '@/lib/supabase/server';
import { 
  broadcastGoogleWalletNotification, 
  updateGooglePassStamps,
  getGoogleWalletDiagnostics 
} from '@/lib/wallet/google-wallet-service';
import { sendApplePushNotification } from '@/lib/wallet/apple-wallet-service';

export async function GET() {
  const diag = getGoogleWalletDiagnostics();
  return NextResponse.json({
    status: 'ok',
    googleWallet: diag,
    serverTime: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      segment = 'all', 
      title, 
      body: messageBody, 
      customerId, 
      serialNumber,
      targetCustomerName 
    } = body;

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: 'Título y mensaje son obligatorios' },
        { status: 400 }
      );
    }

    const cleanTitle = title.trim();
    const cleanMessage = messageBody.trim();

    // 1. Obtener pases actualizados desde Supabase y la memoria local
    let targetPasses: any[] = [];
    let recipientNames: string[] = [];

    // CASO A: Envío individual a un cliente específico
    if (serialNumber) {
      targetPasses.push({
        pass_serial_number: serialNumber,
        pass_type: 'google',
        current_stamps: 1,
        full_name: targetCustomerName || 'Cliente Seleccionado',
      });
      recipientNames.push(targetCustomerName || 'Cliente Seleccionado');
    } else if (customerId) {
      // Buscar el pase de ese cliente en Supabase o memoria
      try {
        const { data: dbPasses } = await supabaseAdmin
          .from('wallet_passes')
          .select('*, customers(full_name)')
          .eq('customer_id', customerId);

        if (dbPasses && dbPasses.length > 0) {
          for (const p of dbPasses) {
            targetPasses.push({
              ...p,
              full_name: (p.customers as any)?.full_name || targetCustomerName || 'Cliente',
            });
            recipientNames.push((p.customers as any)?.full_name || targetCustomerName || 'Cliente');
          }
        }
      } catch (e) {
        console.warn('[Push API] Error Supabase pass lookup:', e);
      }

      if (targetPasses.length === 0) {
        const localPass = fideliziaStore.passes.find((p) => p.customer_id === customerId);
        const localCust = fideliziaStore.customers.find((c) => c.id === customerId);
        if (localPass) {
          targetPasses.push({
            ...localPass,
            full_name: localCust?.full_name || 'Cliente',
          });
          recipientNames.push(localCust?.full_name || 'Cliente');
        }
      }
    } else {
      // CASO B: Envío segmentado o masivo
      try {
        const { data: dbPasses } = await supabaseAdmin
          .from('wallet_passes')
          .select(`
            id,
            pass_serial_number,
            pass_type,
            push_token,
            current_stamps,
            status,
            customers (
              id,
              full_name,
              rfm_segment
            )
          `)
          .eq('status', 'active');

        if (dbPasses && dbPasses.length > 0) {
          for (const dp of dbPasses) {
            const cust = dp.customers as any;
            if (segment === 'all' || cust?.rfm_segment === segment) {
              targetPasses.push({
                pass_serial_number: dp.pass_serial_number,
                pass_type: dp.pass_type,
                push_token: dp.push_token,
                current_stamps: dp.current_stamps,
                full_name: cust?.full_name || 'Comensal',
              });
              recipientNames.push(cust?.full_name || 'Comensal');
            }
          }
        }
      } catch (e) {
        console.warn('[Push API] Error fetching passes from Supabase:', e);
      }

      // Fallback a pases en memoria si Supabase no trajo ninguno
      if (targetPasses.length === 0) {
        const customers = fideliziaStore.customers;
        const passes = fideliziaStore.passes;
        const targetCustomers = segment === 'all'
          ? customers
          : customers.filter((c) => c.rfm_segment === segment);

        const targetCustomerIds = new Set(targetCustomers.map((c) => c.id));
        targetPasses = passes.filter(
          (p) => targetCustomerIds.has(p.customer_id) && p.status === 'active'
        );
        recipientNames = targetCustomers.map((c) => c.full_name);
      }
    }

    if (targetPasses.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No se encontraron pases activos para el destinatario o segmento seleccionado',
        recipientsCount: 0,
      }, { status: 404 });
    }

    // 2. Separar Google Wallet y Apple Wallet
    const googlePasses = targetPasses.filter((p) => p.pass_type === 'google');
    const applePasses = targetPasses.filter((p) => p.pass_type === 'apple' && p.push_token);

    // 3. Emitir a Google Wallet REST API
    let googleSuccessCount = 0;
    const googleErrors: string[] = [];

    for (const gp of googlePasses) {
      try {
        const result = await updateGooglePassStamps(
          gp.pass_serial_number,
          gp.current_stamps || 1,
          `${cleanTitle}: ${cleanMessage}`
        );
        if (result.success) {
          googleSuccessCount++;
        } else {
          googleErrors.push(result.error || `Error al actualizar pase ${gp.pass_serial_number}`);
        }
      } catch (gErr: any) {
        googleErrors.push(gErr?.message || `Excepción en pase ${gp.pass_serial_number}`);
      }
    }

    // 4. Emitir a Apple Wallet APNs
    let appleSuccessCount = 0;
    for (const ap of applePasses) {
      try {
        await sendApplePushNotification(ap.push_token);
        appleSuccessCount++;
      } catch (aErr) {
        console.warn(`[Apple Push Error] Falló token ${ap.push_token}:`, aErr);
      }
    }

    // 5. Registrar campaña en memoria y notificar
    fideliziaStore.sendPushCampaign({
      segment: customerId ? 'individual' : segment,
      title: cleanTitle,
      body: cleanMessage,
    });

    // Si fallaron todas las entregas de Google Wallet para un destinatario de Google
    if (googlePasses.length > 0 && googleSuccessCount === 0) {
      return NextResponse.json({
        success: false,
        error: googleErrors[0] || 'No se pudo comunicar con Google Wallet API.',
        googleWalletDelivered: 0,
        appleWalletDelivered: appleSuccessCount,
        details: googleErrors,
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      recipientsCount: targetPasses.length,
      googleWalletDelivered: googleSuccessCount,
      appleWalletDelivered: appleSuccessCount,
      recipientNames: recipientNames.slice(0, 5),
      message: customerId 
        ? `Notificación "${cleanTitle}" enviada exitosamente a la tarjeta de ${recipientNames[0] || 'Cliente'}.`
        : `Campaña emitida exitosamente a ${targetPasses.length} pases digitales de clientes.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar notificación push';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
