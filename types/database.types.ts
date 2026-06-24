export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      flights: {
        Row: {
          id: string;
          created_at: string;
          origem: string;
          destino: string;
          data_ida: string;
          data_volta: string | null;
          preco_atual: number | null;
          preco_alvo: number;
          conexoes_ida: number | null;
          conexoes_volta: number | null;
          companhia_aerea: string | null;
          link_compra: string | null;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          origem: string;
          destino: string;
          data_ida: string;
          data_volta?: string | null;
          preco_atual?: number | null;
          preco_alvo: number;
          conexoes_ida?: number | null;
          conexoes_volta?: number | null;
          companhia_aerea?: string | null;
          link_compra?: string | null;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          origem?: string;
          destino?: string;
          data_ida?: string;
          data_volta?: string | null;
          preco_atual?: number | null;
          preco_alvo?: number;
          conexoes_ida?: number | null;
          conexoes_volta?: number | null;
          companhia_aerea?: string | null;
          link_compra?: string | null;
          user_id?: string | null;
        };
      };
    };
  };
}
