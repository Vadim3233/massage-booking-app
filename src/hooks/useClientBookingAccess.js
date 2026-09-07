import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/bookingSupabase.js";
import { accessError, clientAccessErrorMessage, requireClientBookingAccess } from "../lib/clientAccess.js";

export function useClientBookingAccess(userId, authLoading) {
  const [state, setState] = useState({ userId: null, allowed: false, loading: true, error: "" });
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setState({ userId, allowed: false, loading: true, error: "" });
    try {
      if (!userId) throw accessError("CLIENT_AUTH_REQUIRED");
      await requireClientBookingAccess(await getSupabaseClient());
      if (generation.current === version) setState({ userId, allowed: true, loading: false, error: "" });
      return generation.current === version;
    } catch (error) {
      if (generation.current === version) setState({ userId, allowed: false, loading: false,
        error: clientAccessErrorMessage(error) || accessError("CLIENT_ACCESS_UNAVAILABLE").message });
      return false;
    }
  }, [userId]);

  useEffect(() => {
    if (!authLoading) void refresh();
    const onFocus = () => { if (!authLoading) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { generation.current++; window.removeEventListener("focus", onFocus); };
  }, [refresh, authLoading]);

  const current = state.userId === userId && !authLoading;
  return { allowed: current && state.allowed, loading: !current || state.loading,
    error: current ? state.error : "", refresh };
}
