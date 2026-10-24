export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EmployeeRole = 'cashier' | 'manager' | 'admin';
export type PassType = 'apple' | 'google';
export type PassStatus = 'active' | 'suspended' | 'revoked';
export type ReservationStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type FraudAlertType =
  | 'cooldown_violation'
  | 'ticket_reused'
  | 'outside_operating_hours'
  | 'geofence_breach'
  | 'employee_collusion'
  | 'abnormal_velocity';
export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RfmSegment = 'champion' | 'loyal' | 'at_risk' | 'hibernating' | 'new';

export interface Database {
  public: {
    Tables: {
      merchants: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          brand_color: string;
          secondary_color: string;
          google_place_id: string | null;
          stamps_needed: number;
          reward_description: string;
          cooldown_hours: number;
          scanner_geofence_meters: number;
          opening_hours: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['merchants']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['merchants']['Insert']>;
      };
      locations: {
        Row: {
          id: string;
          merchant_id: string;
          name: string;
          address: string;
          latitude: number;
          longitude: number;
          radius_meters: number;
          relevant_text: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['locations']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['locations']['Insert']>;
      };
      employees: {
        Row: {
          id: string;
          merchant_id: string;
          location_id: string | null;
          name: string;
          pin_hash: string;
          role: EmployeeRole;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['employees']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['employees']['Insert']>;
      };
      customers: {
        Row: {
          id: string;
          merchant_id: string;
          phone: string;
          full_name: string;
          birthdate: string | null;
          terms_accepted_at: string;
          rfm_segment: RfmSegment;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'terms_accepted_at' | 'rfm_segment' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['customers']['Insert']>;
      };
      wallet_passes: {
        Row: {
          id: string;
          customer_id: string;
          merchant_id: string;
          pass_type: PassType;
          pass_serial_number: string;
          push_token: string | null;
          authentication_token: string;
          current_stamps: number;
          total_visits: number;
          total_rewards_redeemed: number;
          last_visit_at: string | null;
          status: PassStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['wallet_passes']['Row'], 'id' | 'current_stamps' | 'total_visits' | 'total_rewards_redeemed' | 'last_visit_at' | 'status' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['wallet_passes']['Insert']>;
      };
      transactions: {
        Row: {
          id: string;
          merchant_id: string;
          location_id: string | null;
          employee_id: string;
          customer_id: string;
          pass_id: string;
          ticket_number: string;
          amount: number;
          stamps_awarded: number;
          balance_after: number;
          client_latitude: number | null;
          client_longitude: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transactions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>;
      };
      redemptions: {
        Row: {
          id: string;
          merchant_id: string;
          customer_id: string;
          employee_id: string;
          pass_id: string;
          stamps_deducted: number;
          reward_name: string;
          authorized_by_manager_id: string | null;
          redeemed_at: string;
        };
        Insert: Omit<Database['public']['Tables']['redemptions']['Row'], 'id' | 'redeemed_at'>;
        Update: Partial<Database['public']['Tables']['redemptions']['Insert']>;
      };
      reviews_feedback: {
        Row: {
          id: string;
          merchant_id: string;
          customer_id: string;
          transaction_id: string | null;
          rating: number;
          comments: string | null;
          is_public_redirect: boolean;
          manager_contacted: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['reviews_feedback']['Row'], 'id' | 'is_public_redirect' | 'manager_contacted' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['reviews_feedback']['Insert']>;
      };
      reservations: {
        Row: {
          id: string;
          merchant_id: string;
          customer_id: string;
          location_id: string | null;
          date_time: string;
          guests_count: number;
          status: ReservationStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['reservations']['Row'], 'id' | 'status' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['reservations']['Insert']>;
      };
      fraud_alerts: {
        Row: {
          id: string;
          merchant_id: string;
          employee_id: string | null;
          customer_id: string | null;
          alert_type: FraudAlertType;
          severity: FraudSeverity;
          details: Json;
          is_resolved: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['fraud_alerts']['Row'], 'id' | 'is_resolved' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['fraud_alerts']['Insert']>;
      };
    };
    Functions: {
      process_pos_scan: {
        Args: {
          p_merchant_id: string;
          p_employee_id: string;
          p_pass_serial_number: string;
          p_ticket_number: string;
          p_amount: number;
          p_scanner_lat?: number | null;
          p_scanner_lng?: number | null;
        };
        Returns: {
          success: boolean;
          transaction_id: string;
          customer_name: string;
          stamps_current: number;
          stamps_needed: number;
          reward_ready: boolean;
          reward_description: string;
          ticket_number: string;
        };
      };
    };
  };
}
