import assert from "node:assert/strict";
import {
  BANK_TRANSFER_UNAVAILABLE_MESSAGE,
  getFrontendBankTransferDetails,
} from "./bankTransferDetails.js";

{
  const details = getFrontendBankTransferDetails({
    VITE_BANK_ACCOUNT_NAME: "Configured Massage",
    VITE_BANK_NAME: "Configured Bank",
    VITE_BANK_SORT_CODE: "11-22-33",
    VITE_BANK_ACCOUNT_NUMBER: "87654321",
  }, { labelStyle: "sentence" });

  assert.equal(details.isConfigured, true);
  assert.deepEqual(
    details.rows.map((row) => [row.label, row.value]),
    [
      ["Account name", "Configured Massage"],
      ["Bank name", "Configured Bank"],
      ["Sort code", "11-22-33"],
      ["Account number", "87654321"],
    ],
  );
}

{
  const details = getFrontendBankTransferDetails({
    VITE_BANK_ACCOUNT_NAME: "Configured Massage",
    VITE_BANK_SORT_CODE: "11-22-33",
    VITE_BANK_ACCOUNT_NUMBER: "87654321",
  });

  assert.equal(details.isConfigured, true);
  assert.deepEqual(
    details.rows.map((row) => row.label),
    ["Account Name", "Sort Code", "Account Number"],
  );
}

{
  const details = getFrontendBankTransferDetails({});

  assert.equal(details.isConfigured, false);
  assert.equal(details.isPartial, false);
  assert.equal(details.message, BANK_TRANSFER_UNAVAILABLE_MESSAGE);
  assert.deepEqual(details.rows, []);
}

{
  const details = getFrontendBankTransferDetails({
    VITE_BANK_ACCOUNT_NAME: "Configured Massage",
    VITE_BANK_SORT_CODE: "11-22-33",
  });

  assert.equal(details.isConfigured, false);
  assert.equal(details.isPartial, true);
  assert.equal(details.message, BANK_TRANSFER_UNAVAILABLE_MESSAGE);
  assert.deepEqual(details.rows, []);
}
