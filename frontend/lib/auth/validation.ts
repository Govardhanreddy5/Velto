import { CollegeEmailValidation } from "@/types/auth";

export const ALLOWED_CAMPUS_DOMAINS: Record<string, string> = {
  "vishnu.edu.in": "Vishnu Educational Society",
  "svecw.edu.in": "Shri Vishnu Engineering College for Women (SVECW)",
};

export const APPROVED_CAMPUS_NAMES = Object.values(ALLOWED_CAMPUS_DOMAINS);

export function isApprovedCampus(campus: string | null | undefined): boolean {
  if (!campus) return false;
  return APPROVED_CAMPUS_NAMES.includes(campus);
}

/**
 * Returns canonical campus name for an email, or null if domain is unapproved.
 */
export function getCampusForEmail(email: string): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const domain = trimmed.split("@")[1];
  return (domain && ALLOWED_CAMPUS_DOMAINS[domain]) || null;
}

/**
 * Validates whether an email belongs to an authorized college domain.
 * Exactly supported:
 *  - @vishnu.edu.in (Vishnu Educational Society)
 *  - @svecw.edu.in (Shri Vishnu Engineering College for Women (SVECW))
 *
 * Rejects subdomains, personal emails, generic .edu/.ac.in, and all other domains.
 */
export function validateCollegeEmail(email: string): CollegeEmailValidation {
  const trimmed = email.trim().toLowerCase();

  if (!trimmed) {
    return {
      isValid: false,
      error: "College email is required.",
    };
  }

  // Basic email pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return {
      isValid: false,
      error: "Please enter a valid email address.",
    };
  }

  const parts = trimmed.split("@");
  if (parts.length !== 2) {
    return {
      isValid: false,
      error: "Please enter a valid email address.",
    };
  }

  const [username, domain] = parts;

  // Reject generic personal email providers explicitly with helpful guidance
  const forbiddenDomains = [
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "protonmail.com",
  ];

  if (forbiddenDomains.includes(domain)) {
    return {
      isValid: false,
      error:
        "Velto is campus-only. Personal emails like Gmail or Yahoo are not permitted. Please use your official college email (@vishnu.edu.in or @svecw.edu.in).",
    };
  }

  // Check exact canonical college domain (no subdomains, no random .edu.in or .ac.in)
  const canonicalCampus = ALLOWED_CAMPUS_DOMAINS[domain];
  if (!canonicalCampus) {
    return {
      isValid: false,
      error:
        "Only authorized college email IDs (@vishnu.edu.in or @svecw.edu.in) are accepted.",
    };
  }

  // Extract student roll number from username prefix (e.g. 24pa1a1205 -> 24PA1A1205)
  const rollNumber = username.toUpperCase();

  return {
    isValid: true,
    rollNumber,
    campusDomain: canonicalCampus,
  };
}

/**
 * Validates password requirements.
 */
export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (!password) {
    return {
      isValid: false,
      error: "Password is required.",
    };
  }

  if (password.length < 6) {
    return {
      isValid: false,
      error: "Password must be at least 6 characters long.",
    };
  }

  return { isValid: true };
}
