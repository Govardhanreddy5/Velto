export interface AuthResponse {
  success: boolean;
  message: string;
  error?: string;
  data?: {
    email?: string;
    userId?: string;
    rollNumber?: string;
    requiresEmailVerification?: boolean;
    needsEmailConfirmation?: boolean;
    isExistingUser?: boolean;
  };
}

export interface CollegeEmailValidation {
  isValid: boolean;
  error?: string;
  rollNumber?: string;
  campusDomain?: string;
}

export interface SignUpFormData {
  collegeEmail: string;
  password: string;
  confirmPassword: string;
}

export interface SignInFormData {
  collegeEmail: string;
  password: string;
}

export interface StudentProfile {
  id: string;
  email: string;
  rollNumber: string;
  campus: string;
  verified: boolean;
}
