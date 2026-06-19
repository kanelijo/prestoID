// QR code helpers
// Generate a unique QR string for a student
export function generateQRCode(orgId: string, studentId: string): string {
  // Format: KF-{orgShort}-{studentShort}-{checkDigit}
  const orgShort = orgId.slice(0, 8);
  const studentShort = studentId.slice(0, 8);
  const raw = `${orgShort}${studentShort}`;
  const checkDigit = calculateCheckDigit(raw);
  return `KF-${orgShort}-${studentShort}-${checkDigit}`;
}

function calculateCheckDigit(input: string): string {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += input.charCodeAt(i) * (i + 1);
  }
  return (sum % 100).toString().padStart(2, '0');
}

// Validate a scanned QR code format
export function isValidKFQR(code: string): boolean {
  return /^KF-[a-f0-9]{8}-[a-f0-9]{8}-\d{2}$/.test(code);
}

// Extract parts from a QR code
export function parseQRCode(code: string): { orgPart: string; studentPart: string } | null {
  const match = code.match(/^KF-([a-f0-9]{8})-([a-f0-9]{8})-\d{2}$/);
  if (!match) return null;
  return { orgPart: match[1], studentPart: match[2] };
}
