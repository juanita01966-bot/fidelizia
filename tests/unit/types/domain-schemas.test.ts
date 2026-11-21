import { describe, it, expect } from 'vitest';
import {
  BookingSchema,
  CustomerRegisterSchema,
  FeedbackSchema,
  LoginSchema,
  MerchantSettingsSchema,
  PushNotificationSchema,
  RedeemRewardSchema,
  ScanVisitSchema,
  createRedeemRewardSchema,
} from '@/types/domain';

describe('types/domain Zod schemas', () => {
  it('RedeemRewardSchema does NOT hardcode stampsToDeduct=10 when omitted', () => {
    const parsed = RedeemRewardSchema.parse({
      merchantId: '00000000-0000-0000-0000-000000000001',
      passSerialNumber: 'PASS-CANELO-001',
      managerPin: '9999',
    });
    expect(parsed.stampsToDeduct).toBeUndefined();

    const merchantSpecific = createRedeemRewardSchema(8);
    expect(
      merchantSpecific.parse({
        merchantId: '00000000-0000-0000-0000-000000000001',
        passSerialNumber: 'PASS-CANELO-001',
        managerPin: '9999',
      }).stampsToDeduct
    ).toBe(8);

    expect(
      merchantSpecific.safeParse({
        merchantId: '00000000-0000-0000-0000-000000000001',
        passSerialNumber: 'PASS-CANELO-001',
        managerPin: '9999',
        stampsToDeduct: 9,
      }).success
    ).toBe(false);
  });

  it('CustomerRegisterSchema enforces E.164 phone and termsAccepted === true', () => {
    expect(
      CustomerRegisterSchema.safeParse({
        fullName: 'Ana María',
        phone: '+573001234567',
        termsAccepted: true,
      }).success
    ).toBe(true);

    expect(
      CustomerRegisterSchema.safeParse({
        fullName: 'Ana María',
        phone: '3001234567',
        termsAccepted: true,
      }).success
    ).toBe(false);

    expect(
      CustomerRegisterSchema.safeParse({
        fullName: 'Ana María',
        phone: '+573001234567',
        termsAccepted: false,
      }).success
    ).toBe(false);

    // Calendar date validation on birthdate
    expect(
      CustomerRegisterSchema.safeParse({
        fullName: 'Ana María',
        phone: '+573001234567',
        birthdate: '2024-02-29',
        termsAccepted: true,
      }).success
    ).toBe(true);

    for (const invalidDate of ['2026-99-99', '2026-02-30', '2025-02-29', '2026-04-31']) {
      expect(
        CustomerRegisterSchema.safeParse({
          fullName: 'Ana María',
          phone: '+573001234567',
          birthdate: invalidDate,
          termsAccepted: true,
        }).success
      ).toBe(false);
    }
  });

  it('MerchantSettingsSchema validates ascending tier thresholds, hex colors, and http/https logo_url', () => {
    expect(
      MerchantSettingsSchema.safeParse({
        stamps_needed: 8,
        brand_color: '#8b5cf6',
        logo_url: 'https://cdn.example.com/logo.png',
        tier_config: { bronzeMin: 0, silverMin: 2, goldMin: 5, championMin: 10 },
      }).success
    ).toBe(true);

    expect(
      MerchantSettingsSchema.safeParse({
        logo_url: 'javascript:alert(1)',
      }).success
    ).toBe(false);

    expect(
      MerchantSettingsSchema.safeParse({
        logo_url: 'ftp://example.com/logo.png',
      }).success
    ).toBe(false);

    expect(
      MerchantSettingsSchema.safeParse({
        tier_config: { bronzeMin: 0, silverMin: 6, goldMin: 4, championMin: 10 },
      }).success
    ).toBe(false);
  });

  it('validates ScanVisitSchema, PushNotificationSchema, BookingSchema, FeedbackSchema, and LoginSchema', () => {
    expect(
      ScanVisitSchema.safeParse({
        merchantId: '00000000-0000-0000-0000-000000000001',
        employeePin: '1234',
        passSerialNumber: 'PASS-001',
        ticketNumber: 'FAC-2026',
        amount: 15000,
      }).success
    ).toBe(true);

    expect(
      PushNotificationSchema.safeParse({
        segment: 'champion',
        title: 'Promo VIP',
        body: '2x1 en espresso doble hoy.',
      }).success
    ).toBe(true);

    expect(
      BookingSchema.safeParse({
        merchantSlug: 'cafe-canelo',
        customerPhone: '+573001234567',
        customerName: 'Carlos Mendoza',
        dateTime: '2026-11-25T19:00:00Z',
        guestsCount: 4,
      }).success
    ).toBe(true);

    expect(
      FeedbackSchema.safeParse({
        merchantId: '00000000-0000-0000-0000-000000000001',
        rating: 5,
        comments: 'Excelente servicio',
      }).success
    ).toBe(true);

    expect(
      LoginSchema.safeParse({
        identifier: 'laura',
        secret: '   ',
      }).success
    ).toBe(false);
  });
});
