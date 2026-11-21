import { NextRequest, NextResponse } from 'next/server';
import { passRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getAppleTeamId, verifyAppleAuthHeader } from '@/lib/wallet/apple-wallet-service';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ passTypeId: string; serialNumber: string }> }
) {
  const { passTypeId, serialNumber } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const bundle = await passRepo.getWithCustomerAndMerchantBySerial(supabase, serialNumber);
    if (!bundle) {
      return new NextResponse('Pass not found', { status: 404 });
    }

    if (
      !verifyAppleAuthHeader(
        req.headers.get('authorization'),
        bundle.pass.authentication_token
      )
    ) {
      return new NextResponse('Unauthorized ApplePass token', { status: 401 });
    }

    const { pass, customer, merchant, locations } = bundle;
    const primaryLoc = locations.find((l) => l.is_active) || locations[0];

    const passPayload = {
      formatVersion: 1,
      passTypeIdentifier: passTypeId,
      serialNumber: pass.pass_serial_number,
      teamIdentifier: getAppleTeamId(),
      organizationName: merchant.name,
      description: `Tarjeta de Lealtad - ${merchant.name}`,
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(14, 12, 21)',
      labelColor: 'rgb(212, 163, 115)',
      logoText: merchant.name,
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
            value: `${pass.current_stamps} / ${merchant.stamps_needed}`,
          },
        ],
        secondaryFields: [
          {
            key: 'member',
            label: 'MIEMBRO',
            value: customer.full_name,
          },
        ],
        auxiliaryFields: [
          {
            key: 'reward',
            label: 'RECOMPENSA',
            value: customer.custom_reward || merchant.reward_description,
          },
        ],
        backFields: [
          {
            key: 'latest_update',
            label: pass.last_push_title || 'ÚLTIMA NOVEDAD',
            value: pass.last_push_message || 'Sin avisos recientes',
          },
          {
            key: 'geofence',
            label: 'UBICACIÓN AUTORIZADA',
            value: primaryLoc?.address || 'Sede Principal',
          },
        ],
      },
      locations: locations.map((loc) => ({
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
  } catch (err) {
    console.error('[Pass JSON Error]:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
