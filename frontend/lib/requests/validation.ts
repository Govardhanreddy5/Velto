import { RequestType } from "@/types/database";

export interface RequestValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateRequestAmount(amount: number | string): {
  isValid: boolean;
  error?: string;
  parsedAmount?: number;
} {
  const parsed = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(parsed)) {
    return { isValid: false, error: "Please enter a valid monetary amount." };
  }

  if (parsed < 20.0) {
    return {
      isValid: false,
      error: "Minimum exchange amount is ₹20.00.",
    };
  }

  if (parsed > 500.0) {
    return {
      isValid: false,
      error: "Maximum exchange amount is ₹500.00 for campus safety.",
    };
  }

  // Check up to 2 decimal places
  const rounded = Math.round(parsed * 100) / 100;
  return { isValid: true, parsedAmount: rounded };
}

export function validateRequestType(type: string): {
  isValid: boolean;
  error?: string;
  parsedType?: RequestType;
} {
  if (type !== "NEED_CASH" && type !== "HAVE_CASH_WANT_UPI") {
    return {
      isValid: false,
      error: "Request type must be either 'NEED_CASH' or 'HAVE_CASH_WANT_UPI'.",
    };
  }
  return { isValid: true, parsedType: type as RequestType };
}

export function validateLocation(location: string): {
  isValid: boolean;
  error?: string;
} {
  const trimmed = location?.trim() ?? "";
  if (!trimmed) {
    return {
      isValid: false,
      error: "Campus meetup location is required (e.g. Near Canteen, Library).",
    };
  }
  if (trimmed.length < 2) {
    return {
      isValid: false,
      error: "Location must be at least 2 characters.",
    };
  }
  if (trimmed.length > 100) {
    return {
      isValid: false,
      error: "Location cannot exceed 100 characters.",
    };
  }
  return { isValid: true };
}

export function validateExpiryMinutes(minutes: number | string): {
  isValid: boolean;
  error?: string;
  parsedMinutes?: number;
} {
  const parsed = typeof minutes === "string" ? parseInt(minutes, 10) : minutes;
  const allowed = [15, 30, 60, 120];

  if (isNaN(parsed) || !allowed.includes(parsed)) {
    return {
      isValid: false,
      error: "Expiry duration must be 15 min, 30 min, 1 hour, or 2 hours.",
    };
  }
  return { isValid: true, parsedMinutes: parsed };
}

export function validateNote(note?: string): {
  isValid: boolean;
  error?: string;
} {
  if (!note) return { isValid: true };
  const trimmed = note.trim();
  if (trimmed.length > 300) {
    return {
      isValid: false,
      error: "Note cannot exceed 300 characters.",
    };
  }
  return { isValid: true };
}

export function validateCreateRequestData(data: {
  requestType: string;
  amount: number | string;
  location: string;
  expiryMinutes: number | string;
  note?: string;
}): RequestValidationResult {
  const errors: Record<string, string> = {};

  const typeCheck = validateRequestType(data.requestType);
  if (!typeCheck.isValid && typeCheck.error) errors.requestType = typeCheck.error;

  const amountCheck = validateRequestAmount(data.amount);
  if (!amountCheck.isValid && amountCheck.error) errors.amount = amountCheck.error;

  const locationCheck = validateLocation(data.location);
  if (!locationCheck.isValid && locationCheck.error) errors.location = locationCheck.error;

  const expiryCheck = validateExpiryMinutes(data.expiryMinutes);
  if (!expiryCheck.isValid && expiryCheck.error) errors.expiryMinutes = expiryCheck.error;

  const noteCheck = validateNote(data.note);
  if (!noteCheck.isValid && noteCheck.error) errors.note = noteCheck.error;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
