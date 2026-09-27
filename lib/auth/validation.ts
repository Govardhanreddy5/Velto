import { CollegeEmailValidation } from "@/types/auth";

/**
 * Validates whether an email belongs to an authorized college domain.
 * Example supported: rollnumber@vishnu.edu.in
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

  const [username, domain] = trimmed.split("@");

  // Reject generic personal email providers explicitly
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
        "Velto is campus-only. Personal emails like Gmail or Yahoo are not permitted. Please use your official college email (e.g. example@vishnu.edu.in).",
    };
  }

  // Check educational domain: vishnu.edu.in, .edu.in, .ac.in, or .edu
  const isVishnuCampus = domain === "vishnu.edu.in" || domain.endsWith(".vishnu.edu.in");
  const isEducationalDomain =
    domain.endsWith(".edu.in") || domain.endsWith(".ac.in") || domain.endsWith(".edu");

  if (!isVishnuCampus && !isEducationalDomain) {
    return {
      isValid: false,
      error:
        "Only college-issued email IDs are accepted (e.g. example@vishnu.edu.in).",
    };
  }

  // Extract student roll number from username prefix (e.g. rollnumber -> ROLLNUMBER)
  const rollNumber = username.toUpperCase();

  return {
    isValid: true,
    rollNumber,
    campusDomain: isVishnuCampus ? "Vishnu Educational Society" : domain,
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
