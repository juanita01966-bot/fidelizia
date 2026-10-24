// src/app/api/v1/customers/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, phone, birthdate, passType = 'google' } = body;

    if (!fullName || fullName.trim().length < 3) {
      return NextResponse.json(
        { error: 'El nombre completo es requerido' },
        { status: 400 }
      );
    }

    if (!phone || phone.trim().length < 7) {
      return NextResponse.json(
        { error: 'Un número de teléfono válido es requerido' },
        { status: 400 }
      );
    }

    // Registrar cliente y tarjeta en la base de datos central del servidor
    const result = fideliziaStore.registerCustomer({
      fullName: fullName.trim(),
      phone: phone.trim(),
      birthdate: birthdate || null,
      passType: passType === 'apple' ? 'apple' : 'google',
    });

    console.log(`[Customer Registered Central]: ${result.customer.full_name} · Serial: ${result.pass.pass_serial_number}`);

    return NextResponse.json(
      {
        success: true,
        customer: result.customer,
        pass: result.pass,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al registrar cliente';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
