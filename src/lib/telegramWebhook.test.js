import assert from "node:assert/strict";
import { buildTelegramStartUrl, telegramStartPayloadFromMessageText } from "./telegramLinks.js";
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
    bookingReference: "VDM-20260731-1200",
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

console.log("Telegram webhook tests passed.");
