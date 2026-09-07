export const BANK_TRANSFER_UNAVAILABLE_MESSAGE = "Bank details are temporarily unavailable. I will provide them directly.";

function cleanText(value) {
  return String(value ?? "").trim();
}

export function getServerBankTransferDetails(env = process.env) {
  const accountName = cleanText(env.BANK_ACCOUNT_NAME);
  const bankName = cleanText(env.BANK_NAME);
  const sortCode = cleanText(env.BANK_SORT_CODE);
  const accountNumber = cleanText(env.BANK_ACCOUNT_NUMBER);
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
      { label: "Account name", value: accountName },
      ...(bankName ? [{ label: "Bank name", value: bankName }] : []),
      { label: "Sort code", value: sortCode },
      { label: "Account number", value: accountNumber },
    ],
  };
}
