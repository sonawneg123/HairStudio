/**
 * Database type definitions for Raj Faded Studio.
 *
 * ⚠  MANUALLY MAINTAINED — NOT auto-generated.
 *
 * These types were authored by hand to match the SQL migrations in
 * supabase/migrations/. They are intentionally conservative (no `any`,
 * no shortcuts) and must be kept in sync with the schema.
 *
 * Once a local Supabase stack is available (Docker running), replace
 * this file with the generated output by running:
 *
 *   npx supabase gen types typescript --local > types/database.ts
 *
 * Or for a connected remote project:
 *
 *   npx supabase gen types typescript --project-id <your-project-id> \
 *     > types/database.ts
 *
 * The generated file will include additional helper types (Enums, etc.)
 * that this manual version approximates. Delete this header comment
 * block and the ⚠ notice after generation.
 */

// ──────────────────────────────────────────────
// Shared primitives
// ──────────────────────────────────────────────

export type AppRole = "admin" | "barber" | "customer";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

// ──────────────────────────────────────────────
// Row types (shape returned by SELECT *)
// ──────────────────────────────────────────────

export interface ProfileRow {
  id: string;
  full_name: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  price: string; // numeric → string in JS (use parseFloat for arithmetic)
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface BarberProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BarberServiceRow {
  barber_id: string;
  service_id: string;
  created_at: string;
}

export interface SalonSettingsRow {
  id: string;
  salon_name: string;
  timezone: string;
  contact_phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface BarberWorkingHoursRow {
  id: string;
  barber_id: string;
  /** 0 = Sunday … 6 = Saturday */
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;   // "HH:MM:SS"
  is_working: boolean;
  created_at: string;
  updated_at: string;
}

export interface BarberTimeOffRow {
  id: string;
  barber_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentRow {
  id: string;
  customer_id: string;
  barber_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  customer_notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentServiceRow {
  id: string;
  appointment_id: string;
  service_id: string;
  service_name: string;
  unit_price: string; // numeric → string
  duration_minutes: number;
  created_at: string;
}

// ──────────────────────────────────────────────
// Insert types (omit server-generated fields)
// ──────────────────────────────────────────────

export type ProfileInsert = Omit<ProfileRow, "created_at" | "updated_at">;
export type ServiceInsert = Omit<ServiceRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};
export type BarberProfileInsert = Omit<BarberProfileRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};
export type AppointmentInsert = Omit<AppointmentRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

// ──────────────────────────────────────────────
// Update types (all fields optional except id)
// ──────────────────────────────────────────────

export type ProfileUpdate = Partial<Pick<ProfileRow, "full_name" | "phone">>;
export type ServiceUpdate = Partial<
  Omit<ServiceRow, "id" | "created_at" | "updated_at">
>;
export type BarberProfileUpdate = Partial<
  Omit<BarberProfileRow, "id" | "user_id" | "created_at" | "updated_at">
>;
export type AppointmentUpdate = Partial<
  Pick<
    AppointmentRow,
    | "status"
    | "customer_notes"
    | "cancellation_reason"
    | "cancelled_at"
  >
>;

// ──────────────────────────────────────────────
// Database schema type (consumed by Supabase clients)
// ──────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      user_roles: {
        Row: UserRoleRow;
        Insert: never; // managed by trigger only
        Update: never; // managed by SQL Editor only
      };
      services: {
        Row: ServiceRow;
        Insert: ServiceInsert;
        Update: ServiceUpdate;
      };
      barber_profiles: {
        Row: BarberProfileRow;
        Insert: BarberProfileInsert;
        Update: BarberProfileUpdate;
      };
      barber_services: {
        Row: BarberServiceRow;
        Insert: Omit<BarberServiceRow, "created_at">;
        Update: never;
      };
      salon_settings: {
        Row: SalonSettingsRow;
        Insert: Omit<SalonSettingsRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<
          Omit<SalonSettingsRow, "id" | "created_at" | "updated_at">
        >;
      };
      barber_working_hours: {
        Row: BarberWorkingHoursRow;
        Insert: Omit<BarberWorkingHoursRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<
          Omit<BarberWorkingHoursRow, "id" | "barber_id" | "created_at" | "updated_at">
        >;
      };
      barber_time_off: {
        Row: BarberTimeOffRow;
        Insert: Omit<BarberTimeOffRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<
          Omit<BarberTimeOffRow, "id" | "barber_id" | "created_at" | "updated_at">
        >;
      };
      appointments: {
        Row: AppointmentRow;
        Insert: AppointmentInsert;
        Update: AppointmentUpdate;
      };
      appointment_services: {
        Row: AppointmentServiceRow;
        Insert: Omit<AppointmentServiceRow, "id" | "created_at"> & { id?: string };
        Update: never; // snapshots are immutable
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_appointment: {
        Args: {
          p_barber_id: string;
          p_service_ids: string[];
          p_starts_at: string;
          p_notes?: string | null;
        };
        Returns: string; // appointment UUID
      };
      get_user_role: {
        Args: { p_user_id: string };
        Returns: AppRole;
      };
    };
    Enums: {
      app_role: AppRole;
      appointment_status: AppointmentStatus;
    };
  };
};
