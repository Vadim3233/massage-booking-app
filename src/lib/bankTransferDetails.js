export const BANK_TRANSFER_UNAVAILABLE_MESSAGE = "Bank details are temporarily unavailable. I will provide them directly.";

const FRONTEND_ENV_KEYS = {
  accountName: "VITE_BANK_ACCOUNT_NAME",
  bankName: "VITE_BANK_NAME",
  sortCode: "VITE_BANK_SORT_CODE",
  accountNumber: "VITE_BANK_ACCOUNT_NUMBER",
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function labelFor(key, labelStyle) {
  const sentenceLabels = {
    accountName: "Account name",
    bankName: "Bank name",
    sortCode: "Sort code",
    accountNumber: "Account number",
  };
  const titleLabels = {
    accountName: "Account Name",
    bankName: "Bank Name",
    sortCode: "Sort Code",
    accountNumber: "Account Number",
  };
  return (labelStyle === "sentence" ? sentenceLabels : titleLabels)[key];
}

function rowFor(key, value, labelStyle) {
  return {
    key: key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
    label: labelFor(key, labelStyle),
    value,
  };
}

export function normalizeBankTransferDetails(details = {}, { labelStyle = "title" } = {}) {
  const accountName = cleanText(details.accountName);
  const bankName = cleanText(details.bankName);
  const sortCode = cleanText(details.sortCode);
  const accountNumber = cleanText(details.accountNumber);
  const requiredValues = [accountName, sortCode, accountNumber];
  const hasAnyValue = [accountName, bankName, sortCode, accountNumber].some(Boolean);
  const isConfigured = requiredValues.every(Boolean);

  if (!isConfigured) {
    return {
      isConfigured: false,
      isPartial: hasAnyValue,
      message: BANK_TRANSFER_UNAVAILABLE_MESSAGE,
      rows: [],
    };
  }

  return {
    isConfigured: true,
    isPartial: false,
    message: "",
    rows: [
      rowFor("accountName", accountName, labelStyle),
      ...(bankName ? [rowFor("bankName", bankName, labelStyle)] : []),
      rowFor("sortCode", sortCode, labelStyle),
      rowFor("accountNumber", accountNumber, labelStyle),
    ],
  };
}

export function getFrontendBankTransferDetails(
  env = import.meta.env || {},
  options = {},
) {
  return normalizeBankTransferDetails({
    accountName: env[FRONTEND_ENV_KEYS.accountName],
    bankName: env[FRONTEND_ENV_KEYS.bankName],
    sortCode: env[FRONTEND_ENV_KEYS.sortCode],
    accountNumber: env[FRONTEND_ENV_KEYS.accountNumber],
  }, options);
}
