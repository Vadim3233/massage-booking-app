import assert from "node:assert/strict";
import transactionalEmailsHandler from "../../api/transactional-emails.js";
import internalTransactionalEmailsHandler from "../../api/internal-transactional-emails.js";
import telegramNotificationsHandler from "../../api/telegram-notifications.js";

function createMockResponse() {
  const res = { _status: 200, _headers: {}, _body: null };
  res.status = function (code) {
    this._status = code;
    return this;
  };
  res.setHeader = function (name, value) {
    this._headers[name] = value;
  };
  res.json = async function (payload) {
    this._body = payload;
    return this;
  };
  res.end = async function () {
    return this;
  };
  return res;
}

function createMockRequest({ method = "POST", headers = {}, body = {} } = {}) {
  return { method, headers, body };
}

async function run() {
  process.env.INTERNAL_API_SECRET = "test-secret";
  process.env.FRONTEND_ORIGIN = "http://127.0.0.1:5173";
  process.env.NODE_ENV = "production";
  process.env.EMAIL_PROVIDER = "resend";

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ sent: false, skipped: true, reason: "missing_resend_api_key" }),
  });

  try {
    // Missing secret should be rejected.
    {
      const request = createMockRequest({ headers: {}, body: { type: "booking_confirmation", to: "test@example.com" } });
      const response = createMockResponse();

      await transactionalEmailsHandler(request, response);
      assert.equal(response._status, 403);
      assert.equal(response._body.sent, false);
      assert.equal(response._body.error, "Forbidden");
    }

    // Wrong secret should be rejected.
    {
      const request = createMockRequest({ headers: { "x-internal-api-secret": "wrong" }, body: { type: "booking_confirmation", to: "test@example.com" } });
      const response = createMockResponse();

      await transactionalEmailsHandler(request, response);
      assert.equal(response._status, 403);
      assert.equal(response._body.sent, false);
      assert.equal(response._body.error, "Forbidden");
    }

    // Correct secret should be accepted.
    {
      const request = createMockRequest({ headers: { "x-internal-api-secret": "test-secret" }, body: { type: "bookingConfirmation", payload: { date: "2026-06-09", time: "10:00", location: "Test", total: 100 }, to: "test@example.com" } });
      const response = createMockResponse();

      await transactionalEmailsHandler(request, response);
      assert.equal(response._status, 200);
      assert.equal(response._body.sent, false);
      assert.equal(response._body.skipped, true);
    }

    // Internal email route should enforce origin checks.
    {
      const request = createMockRequest({
        headers: {
          origin: "http://127.0.0.1:5173",
          host: "127.0.0.1:5173",
        },
        body: { type: "booking_confirmation", to: "test@example.com" },
      });
      const response = createMockResponse();

      await internalTransactionalEmailsHandler(request, response);
      assert.equal(response._status, 200);
    }

    {
      const request = createMockRequest({
        headers: {
          origin: "https://evil.example.com",
          host: "127.0.0.1:5173",
        },
        body: { type: "booking_confirmation", to: "test@example.com" },
      });
      const response = createMockResponse();

      await internalTransactionalEmailsHandler(request, response);
      assert.equal(response._status, 403);
      assert.equal(response._body.error, "Forbidden");
    }

    // Telegram rate limiting still works on the protected endpoint.
    {
      const requestBase = {
        method: "POST",
        headers: {
          "x-internal-api-secret": "test-secret",
          "x-forwarded-for": "1.1.1.1",
        },
        body: { type: "notification", payload: {} },
      };

      for (let i = 1; i <= 20; i += 1) {
        const response = createMockResponse();
        await telegramNotificationsHandler({ ...requestBase }, response);
        assert.notEqual(response._status, 429, `Request ${i} should not be rate limited`);
      }

      const overLimitResponse = createMockResponse();
      await telegramNotificationsHandler({ ...requestBase }, overLimitResponse);
      assert.equal(overLimitResponse._status, 429);
      assert.equal(overLimitResponse._body.error, "Too many Telegram notification requests");
    }

    console.log("API secret protection tests passed.");
  } finally {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
