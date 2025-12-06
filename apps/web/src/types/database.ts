export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  capsule: {
    Tables: {
      album_invites: {
        Row: {
          album_id: string
          created_at: string | null
          created_by: string
          default_role: string
          expires_at: string | null
          id: string
          invite_token: string
          requires_approval: boolean | null
        }
        Insert: {
          album_id: string
          created_at?: string | null
          created_by: string
          default_role?: string
          expires_at?: string | null
          id?: string
          invite_token: string
          requires_approval?: boolean | null
        }
        Update: {
          album_id?: string
          created_at?: string | null
          created_by?: string
          default_role?: string
          expires_at?: string | null
          id?: string
          invite_token?: string
          requires_approval?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "album_invites_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      album_members: {
        Row: {
          album_id: string
          joined_at: string | null
          notification_preference: string | null
          role: string
          user_id: string
        }
        Insert: {
          album_id: string
          joined_at?: string | null
          notification_preference?: string | null
          role?: string
          user_id: string
        }
        Update: {
          album_id?: string
          joined_at?: string | null
          notification_preference?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_members_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          cover_photo_id: string | null
          created_at: string | null
          description: string | null
          id: string
          owner_id: string
          privacy_mode: string
          title: string
          updated_at: string | null
        }
        Insert: {
          cover_photo_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          owner_id: string
          privacy_mode?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          cover_photo_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          owner_id?: string
          privacy_mode?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "albums_cover_photo_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          id: string
          photo_id: string
          user_id: string
          content: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          photo_id: string
          user_id: string
          content: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          photo_id?: string
          user_id?: string
          content?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          user_id: string
          photo_id: string
          created_at: string | null
        }
        Insert: {
          user_id: string
          photo_id: string
          created_at?: string | null
        }
        Update: {
          user_id?: string
          photo_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          user_id: string
          photo_id: string
          created_at: string | null
        }
        Insert: {
          user_id: string
          photo_id: string
          created_at?: string | null
        }
        Update: {
          user_id?: string
          photo_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "likes_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          album_id: string
          created_at: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          album_id: string
          created_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          album_id?: string
          created_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          album_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          notification_type: string
          payload: Json | null
          user_id: string
        }
        Insert: {
          album_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          notification_type: string
          payload?: Json | null
          user_id: string
        }
        Update: {
          album_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          notification_type?: string
          payload?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_metadata: {
        Row: {
          album_id: string
          metadata: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          album_id: string
          metadata?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          album_id?: string
          metadata?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_metadata_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_metadata_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          album_id: string
          created_at: string | null
          exif_data: Json | null
          file_size_bytes: number | null
          height: number | null
          id: string
          is_hidden_by_owner: boolean | null
          is_missing: boolean | null
          media_type: string
          original_storage_type: string
          original_uri: string
          thumbnail_path: string
          uploader_id: string
          width: number | null
        }
        Insert: {
          album_id: string
          created_at?: string | null
          exif_data?: Json | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_hidden_by_owner?: boolean | null
          is_missing?: boolean | null
          media_type?: string
          original_storage_type: string
          original_uri: string
          thumbnail_path: string
          uploader_id: string
          width?: number | null
        }
        Update: {
          album_id?: string
          created_at?: string | null
          exif_data?: Json | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_hidden_by_owner?: boolean | null
          is_missing?: boolean | null
          media_type?: string
          original_storage_type?: string
          original_uri?: string
          thumbnail_path?: string
          uploader_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      subsets: {
        Row: {
          album_id: string
          created_at: string | null
          id: string
          name: string
          owner_id: string | null
          photo_ids: string[]
          share_token: string | null
          subset_type: string
        }
        Insert: {
          album_id: string
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string | null
          photo_ids?: string[]
          share_token?: string | null
          subset_type: string
        }
        Update: {
          album_id?: string
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          photo_ids?: string[]
          share_token?: string | null
          subset_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "subsets_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_album_role: {
        Args: { p_album_id: string; p_user_id: string }
        Returns: string
      }
      is_album_member: {
        Args: { p_album_id: string; p_roles?: string[]; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  capsule: {
    Enums: {},
  },
} as const
