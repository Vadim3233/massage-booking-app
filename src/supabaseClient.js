import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}


export async function signInClientWithGoogle(redirectTo) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
  return data;
}

export async function isCurrentUserBookingAdmin() {
  const { data, error } = await supabase.rpc("current_user_is_booking_admin");
  if (error) throw error;
  return Boolean(data);
}

export async function signOutCurrentUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signInAdmin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOutAdmin() {
  return signOutCurrentUser();
}

export async function requestAdminPasswordRecovery(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

export async function updateAdminPassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data.user;
}
