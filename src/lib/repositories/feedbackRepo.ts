import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { ReviewFeedback } from '@/types/domain';

export interface CreateFeedbackParams {
  merchantId: string;
  customerId: string;
  transactionId?: string | null;
  rating: number;
  comments?: string | null;
  isPublicRedirect: boolean;
}

export const feedbackRepo = {
  async listByMerchant(
    client: SupabaseAdminClient,
    merchantId: string,
    limit = 100
  ): Promise<ReviewFeedback[]> {
    const { data, error } = await client
      .from('reviews_feedback')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`[feedbackRepo.listByMerchant] ${error.message}`);
    }
    return (data ?? []) as ReviewFeedback[];
  },

  async create(
    client: SupabaseAdminClient,
    input: CreateFeedbackParams
  ): Promise<ReviewFeedback> {
    const { data, error } = await client
      .from('reviews_feedback')
      .insert({
        merchant_id: input.merchantId,
        customer_id: input.customerId,
        transaction_id: input.transactionId ?? null,
        rating: input.rating,
        comments: input.comments ?? null,
        is_public_redirect: input.isPublicRedirect,
        manager_contacted: false,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[feedbackRepo.create] ${error?.message ?? 'Insert failed'}`);
    }
    return data as ReviewFeedback;
  },

  async markManagerContacted(
    client: SupabaseAdminClient,
    merchantId: string,
    feedbackId: string
  ): Promise<ReviewFeedback> {
    const { data, error } = await client
      .from('reviews_feedback')
      .update({ manager_contacted: true })
      .eq('id', feedbackId)
      .eq('merchant_id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[feedbackRepo.markManagerContacted] ${error?.message ?? 'Feedback not found'}`);
    }
    return data as ReviewFeedback;
  },
};
