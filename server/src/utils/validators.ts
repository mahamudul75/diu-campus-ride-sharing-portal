/**
 * DIU Validation utilities
 */

export function isValidStudentId(studentId: string): boolean {
  if (!studentId) return false;
  // DIU Student ID format: 000-00-000 (e.g. 211-15-401)
  const regex = /^\d{3}-\d{2}-\d{3}$/;
  return regex.test(studentId.trim());
}

export function isValidDiuEmail(email: string): boolean {
  if (!email) return false;
  const configuredDomain = process.env.DIU_EMAIL_DOMAIN || 'diu.edu.bd';
  const cleanEmail = email.trim().toLowerCase();
  
  // Standard email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) return false;

  // Must end with configured university domain or subdomains (e.g. @diu.edu.bd, @s.diu.edu.bd)
  return cleanEmail.endsWith(`@${configuredDomain}`) || cleanEmail.endsWith(`.${configuredDomain}`);
}

export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  // Bangladesh phone number: 013-019 followed by 8 digits, with optional +88
  const phoneRegex = /^(?:\+?88)?01[3-9]\d{8}$/;
  return phoneRegex.test(phone.trim().replace(/[\s-]/g, ''));
}

export function sanitizePhone(phone: string): string {
  const digits = phone.trim().replace(/[^\d+]/g, '');
  if (digits.startsWith('+8801')) return digits.replace('+88', '');
  if (digits.startsWith('8801')) return digits.slice(2);
  return digits;
}
