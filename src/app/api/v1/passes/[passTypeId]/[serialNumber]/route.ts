import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/store/fidelizia-store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ passTypeId: string; serialNumber: string }> }
) {
  const { passTypeId, serialNumber } = await params;
  const store = getStore();

  const pass = store.passes.find(
    (p) => p.pass_serial_number.toLowerCase() === serialNumber.toLowerCase()
  );

  if (!pass) {
    return new NextResponse('Pass not found', { status: 404 });
  }

  // Validación de cabecera de autenticación de Apple PassKit
  const authHeader = req.headers.get('authorization');
  if (authHeader && !authHeader.includes(pass.authentication_token)) {
    return new NextResponse('Unauthorized ApplePass token', { status: 401 });
  }

  // Retorno de payload descriptivo del pase (Simulador / PassKit Payload)
  const customer = store.customers.find((c) => c.id === pass.customer_id);

  const passPayload = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: pass.pass_serial_number,
    teamIdentifier: 'DYNAMIND89',
    organizationName: store.merchant.name,
    description: `Tarjeta de Lealtad - ${store.merchant.name}`,
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(14, 12, 21)',
    labelColor: 'rgb(212, 163, 115)',
    logoText: store.merchant.name,
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: pass.pass_serial_number,
        messageEncoding: 'iso-8859-1',
      },
    ],
    storeCard: {
      primaryFields: [
        {
          key: 'balance',
          label: 'SELLOS ACUMULADOS',
          value: `${pass.current_stamps} / ${store.merchant.stamps_needed}`,
        },
      ],
      secondaryFields: [
        {
          key: 'member',
          label: 'MIEMBRO',
          value: customer?.full_name || 'Titular',
        },
      ],
      auxiliaryFields: [
        {
          key: 'reward',
          label: 'RECOMPENSA',
          value: store.merchant.reward_description,
        },
      ],
      backFields: [
        {
          key: 'rules',
          label: 'REGLAS DEL PROGRAMA',
          value:
            '1. Acumula 1 sello por visita. 2. Cooldown mínimo de 3 horas entre visitas. 3. Canjea con tu pase al completar los sellos.',
        },
        {
          key: 'geofence',
          label: 'UBICACIÓN AUTORIZADA',
          value: store.locations[0]?.address || 'Sede Principal',
        },
      ],
    },
    locations: store.locations.map((loc) => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      relevantText: loc.relevant_text,
    })),
  };

  return NextResponse.json(passPayload, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Last-Modified': new Date(pass.updated_at).toUTCString(),
    },
  });
}
