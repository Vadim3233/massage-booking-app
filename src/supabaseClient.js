import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const publicSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
    storageKey: "vadmassage-public-supabase",
  },
});

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

export async function signInClientWithEmailPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function registerClientWithEmailPassword(email, password, redirectTo, profile = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        first_name: String(profile.first_name || "").trim(),
        last_name: String(profile.last_name || "").trim(),
        mobile: String(profile.mobile || "").trim(),
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function resendClientSignupVerification(email, redirectTo) {
  const { data, error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
  return data;
}

export async function requestClientPasswordRecovery(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updateClientPassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data.user;
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
