export const CLIENT_ACCESS_MESSAGES = {
  CLIENT_AUTH_REQUIRED: "Please sign in to your approved client account to book.",
  CLIENT_ACCESS_REQUIRED: "Online booking is available to approved clients. Please contact Vad on WhatsApp to arrange access.",
  CLIENT_ACCESS_BLOCKED: "New online bookings are unavailable for your account. You can still manage your existing bookings in My Bookings.",
  CLIENT_PROFILE_INCOMPLETE: "Please contact Vad to complete your client account details before booking.",
  CLIENT_ACCESS_UNAVAILABLE: "I couldn't check your booking access. Please try again before continuing.",
};

export function clientAccessErrorMessage(error) {
  const text = String(error?.message || error || "");
  return Object.entries(CLIENT_ACCESS_MESSAGES).find(([code, message]) => text.includes(code) || text.includes(message))?.[1] || "";
}

export function accessError(code) {
  return Object.assign(new Error(CLIENT_ACCESS_MESSAGES[code]), { code });
}

export async function requireClientBookingAccess(client) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user?.id) throw accessError("CLIENT_AUTH_REQUIRED");
  const { data: isAdmin, error: adminError } = await client.rpc("current_user_is_booking_admin");
  if (adminError) throw accessError("CLIENT_ACCESS_UNAVAILABLE");
  if (isAdmin === true) return { status: "ACTIVE", profile_complete: true, admin: true };
  const { data, error } = await client.rpc("get_my_client_access");
  if (error || !data) throw accessError("CLIENT_ACCESS_UNAVAILABLE");
  if (data.status === "BLOCKED") throw accessError("CLIENT_ACCESS_BLOCKED");
  if (data.status !== "ACTIVE") throw accessError("CLIENT_ACCESS_REQUIRED");
  if (data.profile_complete !== true) throw accessError("CLIENT_PROFILE_INCOMPLETE");
  return data;
}
