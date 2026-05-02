export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export type PasswordRequirements = {
  lower: boolean;
  upper: boolean;
  lengthAndNumber: boolean;
};

export function passwordRequirements(password: string): PasswordRequirements {
  return {
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    lengthAndNumber: password.length >= 8 && /\d/.test(password),
  };
}

export function passwordMeetsAll(password: string): boolean {
  const r = passwordRequirements(password);
  return r.lower && r.upper && r.lengthAndNumber;
}
