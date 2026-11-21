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
export type LoyaltyTierDb = 'bronze' | 'silver' | 'gold' | 'champion';

export interface Database {
  public: {
    Tables: {
      merchants: {
        Row: {
          id: string;
          user_id: string | null;
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
          tier_config: Json;
          preconfigured_rewards: Json;
          card_pattern: string;
          show_emv_chip: boolean;
          show_hologram: boolean;
          loyalty_program_mode: string;
          card_morphology: string;
          card_gradient: Json;
          reward_milestones: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          slug: string;
          logo_url?: string | null;
          brand_color?: string;
          secondary_color?: string;
          google_place_id?: string | null;
          stamps_needed?: number;
          reward_description?: string;
          cooldown_hours?: number;
          scanner_geofence_meters?: number;
          opening_hours?: Json;
          tier_config?: Json;
          preconfigured_rewards?: Json;
          card_pattern?: string;
          show_emv_chip?: boolean;
          show_hologram?: boolean;
          loyalty_program_mode?: string;
          card_morphology?: string;
          card_gradient?: Json;
          reward_milestones?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['merchants']['Insert']>;
        Relationships: [];
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
        Insert: {
          id?: string;
          merchant_id: string;
          name: string;
          address: string;
          latitude: number;
          longitude: number;
          radius_meters?: number;
          relevant_text?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['locations']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'locations_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      employees: {
        Row: {
          id: string;
          merchant_id: string;
          location_id: string | null;
          name: string;
          username: string | null;
          email: string | null;
          pin_hash: string;
          password_hash: string | null;
          dsb_password_hash: string | null;
          role: EmployeeRole;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          location_id?: string | null;
          name: string;
          username?: string | null;
          email?: string | null;
          pin_hash: string;
          password_hash?: string | null;
          dsb_password_hash?: string | null;
          role?: EmployeeRole;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['employees']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'employees_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employees_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
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
          custom_reward: string | null;
          discount_percentage: number | null;
          loyalty_tier: LoyaltyTierDb;
          total_rewards_redeemed: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          phone: string;
          full_name: string;
          birthdate?: string | null;
          terms_accepted_at?: string;
          rfm_segment?: RfmSegment;
          custom_reward?: string | null;
          discount_percentage?: number | null;
          loyalty_tier?: LoyaltyTierDb;
          total_rewards_redeemed?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['customers']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'customers_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
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
          last_push_title: string | null;
          last_push_message: string | null;
          last_push_at: string | null;
          push_count_24h: number;
          push_window_reset_at: string | null;
          status: PassStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          merchant_id: string;
          pass_type: PassType;
          pass_serial_number: string;
          push_token?: string | null;
          authentication_token: string;
          current_stamps?: number;
          total_visits?: number;
          total_rewards_redeemed?: number;
          last_visit_at?: string | null;
          last_push_title?: string | null;
          last_push_message?: string | null;
          last_push_at?: string | null;
          push_count_24h?: number;
          push_window_reset_at?: string | null;
          status?: PassStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['wallet_passes']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'wallet_passes_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_passes_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      apple_device_registrations: {
        Row: {
          id: string;
          device_library_identifier: string;
          push_token: string;
          pass_type_identifier: string;
          serial_number: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          device_library_identifier: string;
          push_token: string;
          pass_type_identifier: string;
          serial_number: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['apple_device_registrations']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'apple_device_registrations_serial_number_fkey';
            columns: ['serial_number'];
            isOneToOne: false;
            referencedRelation: 'wallet_passes';
            referencedColumns: ['pass_serial_number'];
          },
        ];
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
          original_amount: number | null;
          discount_applied_percent: number | null;
          stamps_awarded: number;
          balance_after: number;
          client_latitude: number | null;
          client_longitude: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          location_id?: string | null;
          employee_id: string;
          customer_id: string;
          pass_id: string;
          ticket_number: string;
          amount?: number;
          original_amount?: number | null;
          discount_applied_percent?: number | null;
          stamps_awarded?: number;
          balance_after: number;
          client_latitude?: number | null;
          client_longitude?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'transactions_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_pass_id_fkey';
            columns: ['pass_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_passes';
            referencedColumns: ['id'];
          },
        ];
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
        Insert: {
          id?: string;
          merchant_id: string;
          customer_id: string;
          employee_id: string;
          pass_id: string;
          stamps_deducted: number;
          reward_name: string;
          authorized_by_manager_id?: string | null;
          redeemed_at?: string;
        };
        Update: Partial<Database['public']['Tables']['redemptions']['Insert']>;
        Relationships: [];
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
        Insert: {
          id?: string;
          merchant_id: string;
          customer_id: string;
          transaction_id?: string | null;
          rating: number;
          comments?: string | null;
          is_public_redirect?: boolean;
          manager_contacted?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reviews_feedback']['Insert']>;
        Relationships: [];
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
        Insert: {
          id?: string;
          merchant_id: string;
          customer_id: string;
          location_id?: string | null;
          date_time: string;
          guests_count?: number;
          status?: ReservationStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reservations']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'reservations_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
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
        Insert: {
          id?: string;
          merchant_id: string;
          employee_id?: string | null;
          customer_id?: string | null;
          alert_type: FraudAlertType;
          severity?: FraudSeverity;
          details?: Json;
          is_resolved?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['fraud_alerts']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
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
          p_location_id?: string | null;
          p_stamps_to_add?: number;
        };
        Returns: {
          success: boolean;
          transaction_id: string;
          customer_id: string;
          customer_name: string;
          pass_id: string;
          pass_serial_number: string;
          pass_type: PassType;
          location_id: string | null;
          stamps_current: number;
          stamps_needed: number;
          reward_ready: boolean;
          reward_description: string;
          custom_reward: string | null;
          loyalty_tier: LoyaltyTierDb;
          ticket_number: string;
          original_amount: number;
          discount_applied_percent: number;
          final_amount: number;
        };
      };
      redeem_reward: {
        Args: {
          p_merchant_id: string;
          p_pass_serial_number: string;
          p_manager_id: string;
          p_stamps_to_deduct?: number | null;
          p_reward_name?: string | null;
        };
        Returns: {
          success: boolean;
          redemption_id: string;
          customer_id: string;
          customer_name: string;
          pass_id: string;
          pass_serial_number: string;
          pass_type: PassType;
          reward_name: string;
          stamps_deducted: number;
          stamps_remaining: number;
          total_rewards_redeemed: number;
          loyalty_tier: LoyaltyTierDb;
        };
      };
    };
    Enums: {
      employee_role: EmployeeRole;
      pass_type: PassType;
      pass_status: PassStatus;
      reservation_status: ReservationStatus;
      fraud_alert_type: FraudAlertType;
      fraud_severity: FraudSeverity;
      rfm_segment: RfmSegment;
    };
    CompositeTypes: Record<string, never>;
  };
}
