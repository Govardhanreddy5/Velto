/**
 * Validation utilities for student profile onboarding
 */

export interface ProfileValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateFullName(name: string): { isValid: boolean; error?: string } {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) {
    return { isValid: false, error: "Full name is required." };
  }
  if (trimmed.length < 2) {
    return { isValid: false, error: "Full name must be at least 2 characters." };
  }
  if (trimmed.length > 70) {
    return { isValid: false, error: "Full name cannot exceed 70 characters." };
  }
  return { isValid: true };
}

export function validateDepartment(dept: string): { isValid: boolean; error?: string } {
  const trimmed = dept?.trim() ?? "";
  if (!trimmed) {
    return { isValid: false, error: "Department is required." };
  }
  if (trimmed.length < 2) {
    return { isValid: false, error: "Please specify a valid department (e.g. CSE, IT, ECE)." };
  }
  return { isValid: true };
}

export function validateYearOfStudy(year: number | string): { isValid: boolean; error?: string } {
  const parsed = typeof year === "string" ? parseInt(year, 10) : year;
  if (isNaN(parsed) || parsed < 1 || parsed > 5) {
    return { isValid: false, error: "Year of study must be between 1 and 5." };
  }
  return { isValid: true };
}

/**
 * Validates UPI ID format (e.g., student@okaxis, student@ybl, 9876543210@paytm)
 */
export function validateUpiId(upiId: string): { isValid: boolean; error?: string } {
  const trimmed = upiId?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    return { isValid: false, error: "UPI ID is required for digital payments." };
  }

  // Standard UPI ID pattern: [alphanumeric._-]@[alphanumeric._-]
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;
  if (!upiRegex.test(trimmed)) {
    return {
      isValid: false,
      error: "Please enter a valid UPI ID (e.g. yourname@okhdfcbank or student@ybl).",
    };
  }

  return { isValid: true };
}

export function validateOnboardingData(data: {
  fullName: string;
  department: string;
  yearOfStudy: number | string;
  upiId: string;
}): ProfileValidationResult {
  const errors: Record<string, string> = {};

  const nameCheck = validateFullName(data.fullName);
  if (!nameCheck.isValid && nameCheck.error) errors.fullName = nameCheck.error;

  const deptCheck = validateDepartment(data.department);
  if (!deptCheck.isValid && deptCheck.error) errors.department = deptCheck.error;

  const yearCheck = validateYearOfStudy(data.yearOfStudy);
  if (!yearCheck.isValid && yearCheck.error) errors.yearOfStudy = yearCheck.error;

  const upiCheck = validateUpiId(data.upiId);
  if (!upiCheck.isValid && upiCheck.error) errors.upiId = upiCheck.error;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
