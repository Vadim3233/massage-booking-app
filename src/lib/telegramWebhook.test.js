import assert from "node:assert/strict";
import { buildTelegramActivationUrl, buildTelegramStartUrl, telegramStartPayloadFromMessageText } from "./telegramLinks.js";
import { linkTelegramStartUpdate, parseTelegramStartUpdate } from "../../server/telegramWebhook.js";

{
  assert.equal(
    buildTelegramStartUrl("https://t.me/@vadmassagebookingbot", "VDM-20260731-1200"),
    "https://t.me/vadmassagebookingbot?start=VDM-20260731-1200"
  );
  assert.equal(telegramStartPayloadFromMessageText("/start VDM-20260731-1200"), "VDM-20260731-1200");
  assert.equal(telegramStartPayloadFromMessageText("/start@vadmassagebookingbot VDM-20260731-1200"), "VDM-20260731-1200");
}

{
  const parsed = parseTelegramStartUpdate({
    message: {
      text: "/start VDM-20260731-1200",
      chat: { id: 123456789, type: "private" },
      from: { id: 987654321, first_name: "Client", username: "clientname" },
    },
  });

  assert.deepEqual(parsed, {
    startPayload: "VDM-20260731-1200",
    kind: "booking_reference",
    chatId: "123456789",
    chatType: "private",
    firstName: "Client",
    lastName: "",
    telegramUserId: "987654321",
    username: "clientname",
  });
  assert.equal(parseTelegramStartUpdate({ message: { text: "hello", chat: { id: 123 } } }), null);
}

{
  const rpcCalls = [];
  const sentMessages = [];
  const result = await linkTelegramStartUpdate(
    {
      message: {
        text: "/start VDM-20260731-1200",
        chat: { id: 123456789, type: "private" },
        from: { id: 987654321, first_name: "Client", username: "clientname" },
      },
    },
    {
      supabase: {
        rpc: async (name, args) => {
          rpcCalls.push({ name, args });
          return { data: { booking_id: "booking-1" }, error: null };
        },
      },
      sendMessage: async (message) => {
        sentMessages.push(message);
        return { sent: true };
      },
    }
  );

  assert.equal(result.linked, true);
  assert.equal(result.bookingId, "booking-1");
  assert.equal(result.chatId, "123456789");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "link_telegram_chat_to_booking");
  assert.equal(rpcCalls[0].args.link_payload.booking_reference, "VDM-20260731-1200");
  assert.equal(rpcCalls[0].args.link_payload.chat_id, "123456789");
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].chatId, "123456789");
  assert.match(sentMessages[0].text, /Telegram updates are connected/);
}

{
  const result = await linkTelegramStartUpdate(
    { message: { text: "hello", chat: { id: 123456789 } } },
    { supabase: { rpc: async () => assert.fail("RPC should not be called") } }
  );
  assert.equal(result.ignored, true);
  assert.equal(result.linked, false);
}

{
  const token = "acct_" + "A".repeat(43);
  assert.equal(buildTelegramActivationUrl("https://t.me/vadmassagebookingbot", token), "https://t.me/vadmassagebookingbot?start=" + token);
  assert.equal(buildTelegramActivationUrl("", token), "");
  assert.equal(buildTelegramActivationUrl("https://example.com/bot", token), "");
  const calls = [], replies = [];
  const result = await linkTelegramStartUpdate(
    { message: { text: "/start " + token, chat: { id: 22, type: "private" }, from: { id: 33, username: "client" } } },
    {
      supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { linked: true, status: "CONNECTED" } }; } },
      sendMessage: async (message) => { replies.push(message); return { sent: true }; },
    }
  );
  assert.equal(result.linked, true);
  assert.equal(calls[0].name, "consume_client_telegram_activation");
  assert.equal(calls[0].args.activation_payload.token, token);
  assert.match(replies[0].text, /connected to your client account/);

  const invalidReplies = [];
  const invalid = await linkTelegramStartUpdate(
    { message: { text: "/start " + token, chat: { id: 44, type: "private" } } },
    {
      supabase: { rpc: async () => ({ data: { linked: false, status: "INVALID" } }) },
      sendMessage: async (message) => { invalidReplies.push(message); return { sent: true }; },
    }
  );
  assert.equal(invalid.linked, false);
  assert.match(invalidReplies[0].text, /could not be loaded|stop working|no longer|new link/i);
  assert.doesNotMatch(invalidReplies[0].text, /uuid|sql|client id/i);
}

console.log("Telegram webhook tests passed.");
