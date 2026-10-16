// Shared field rules for Add Personnel and Bulk Personnel Import.
// Each validator returns an error message, or '' when the value is valid.

export const NAME_PATTERN = /^\p{L}+(?:[ '’-]\p{L}+)*$/u;
// Same rule as a string for the HTML `pattern` attribute.
export const NAME_PATTERN_ATTR = "\\p{L}+(?:[ '’\\-]\\p{L}+)*";
export const CONTACT_LENGTH = 11;
const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GMAIL_PATTERN = /^[^\s@]+@gmail\.com$/i;

// Typing filter: letters, spaces, hyphens and apostrophes only.
export const sanitizeNameInput = (value) =>
  String(value || '').replace(/[^\p{L} '’-]/gu, '');

// Typing filter: digits only, never more than 11.
export const sanitizeContactInput = (value) =>
  String(value || '').replace(/\D/g, '').slice(0, CONTACT_LENGTH);

export const validateName = (value, label) => {
  const text = String(value || '').trim();
  if (!text) return `${label} is required.`;
  if (!NAME_PATTERN.test(text)) return "Letters, spaces, - and ' only.";
  return '';
};

export const validateContactNumber = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'Contact number is required.';
  if (/\D/.test(text)) return 'Numbers only.';
  if (!text.startsWith('09')) return 'Must start with 09.';
  if (text.length !== CONTACT_LENGTH) return 'Must be 11 digits.';
  return '';
};

// Gmail is the accepted provider; the format check gives a clearer first message.
export const validateEmailFormat = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'Email is required.';
  if (!EMAIL_FORMAT_PATTERN.test(text)) return 'Enter a valid email address.';
  if (!GMAIL_PATTERN.test(text)) return 'Use a @gmail.com address.';
  return '';
};
