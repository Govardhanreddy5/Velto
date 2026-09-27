export type RequestType = "NEED_CASH" | "HAVE_CASH_WANT_UPI";
export type RequestStatus = "OPEN" | "ACCEPTED" | "COMPLETED" | "EXPIRED" | "CANCELLED";
export type TradeStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DISPUTED";
export type ReportReason =
  | "NO_SHOW"
  | "WRONG_AMOUNT"
  | "DID_NOT_RECEIVE_CASH"
  | "DID_NOT_RECEIVE_UPI"
  | "FRAUD_SUSPICION"
  | "OTHER";
export type ModerationStatus = "PENDING" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";

export interface Profile {
  id: string;
  email: string;
  roll_number: string;
  full_name: string | null;
  department: string | null;
  year_of_study: number | null;
  upi_id: string | null;
  avatar_url: string | null;
  campus: string;
  is_onboarded: boolean;
  is_verified: boolean;
  is_admin: boolean;
  is_suspended: boolean;
  is_banned: boolean;
  rating_avg: number;
  total_ratings: number;
  total_trades: number;
  created_at: string;
  updated_at: string;
}

export interface ExchangeRequest {
  id: string;
  requester_id: string;
  request_type: RequestType;
  amount: number;
  location_hint: string;
  note: string | null;
  status: RequestStatus;
  campus: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  requester?: Partial<Profile>;
}

export interface Trade {
  id: string;
  request_id: string;
  requester_id: string;
  fulfiller_id: string;
  amount: number;
  request_type: RequestType;
  status: TradeStatus;
  meetup_location: string;
  requester_confirmed: boolean;
  fulfiller_confirmed: boolean;
  upi_reference: string | null;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  requester?: Partial<Profile>;
  fulfiller?: Partial<Profile>;
}

export interface TradeMessage {
  id: string;
  trade_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender?: Partial<Profile>;
}

export interface TradeRating {
  id: string;
  trade_id: string;
  reviewer_id: string;
  reviewed_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface SafetyReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  trade_id: string | null;
  reason: ReportReason;
  details: string | null;
  status: ModerationStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}
