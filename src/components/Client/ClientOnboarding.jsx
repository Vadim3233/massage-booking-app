import React, { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/bookingSupabase.js';
import { clearInvitationContext, readInvitationContext, onboardingRedirect, invitationMessages, validateOnboardingProfile } from '../../lib/invitationContext.js';
import '../../styles/clientAccess.css';

export function ClientOnboarding({ client: suppliedClient, onMyBookings, onSwitchAdmin } = {}) {
  const [state, setState] = useState({ kind: 'loading' });
  const [fields, setFields] = useState({ first_name: '', last_name: '', mobile: '' });
  const [email, setEmail] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const getClient = () => suppliedClient ? Promise.resolve(suppliedClient) : getSupabaseClient();

  async function refresh() {
    const version = ++revision.current;
    setState({ kind: 'loading' });
    try {
      const client = await getClient();
      const { data: identity, error: authError } = await client.auth.getUser();
      if (authError && authError.name !== 'AuthSessionMissingError') throw new Error('unavailable');
      const user = identity?.user;
      let access = null;
      if (user) {
        const { data, error } = await client.rpc('get_my_client_access');
        if (error) throw new Error('unavailable');
        access = data;
      }
      if (version !== revision.current) return;
      if (access?.status === 'BLOCKED') { clearInvitationContext(); setState({kind:'blocked',user}); return; }
      if (access?.status === 'ACTIVE' && access.profile_complete) {
        clearInvitationContext(); setState({kind:'active',user}); return;
      }
      let invited = false;
      if (access?.status !== 'ACTIVE') {
        let invalidEntry = false;
        try { invalidEntry = sessionStorage.getItem('vad-invitation-entry') === 'invalid'; } catch { /* Fail closed below. */ }
        const token = readInvitationContext();
        if (token) {
          const { data, error } = await client.rpc('validate_client_invitation', { token });
          if (error) throw new Error('unavailable');
          if (version !== revision.current) return;
          if (!data?.valid || data.status !== 'UNUSED') {
            clearInvitationContext(); setState({kind:'terminal',message:invitationMessages[data?.status] || invitationMessages.INVALID,user}); return;
          }
          invited = true;
        } else if (invalidEntry || window.location.pathname === '/onboarding') {
          setState({kind:'terminal',message:invalidEntry ? invitationMessages.INVALID : invitationMessages.LOST,user}); return;
        }
      }
      if (user && (invited || access?.status === 'ACTIVE')) {
        const {data:profile,error} = await client.from('client_profiles').select('first_name,last_name,phone').eq('user_id',user.id).maybeSingle();
        if (error) throw new Error('unavailable');
        if (version !== revision.current) return;
        setFields({first_name:profile?.first_name || user.user_metadata?.given_name || user.user_metadata?.full_name || user.user_metadata?.name || '',last_name:profile?.last_name || user.user_metadata?.family_name || '',mobile:profile?.phone || ''});
        setState({kind:'profile',user,invited,displayName:user.user_metadata?.full_name || user.user_metadata?.name || ''});
      } else setState({kind: user ? 'no-access' : 'sign-in',user,invited});
    } catch { if (version === revision.current) setState({kind:'error'}); }
  }

  useEffect(() => {
    let disposed = false, subscription, timer;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (params.has('error') || query.has('error')) {
      setMessage((params.get('error') || query.get('error')) === 'access_denied' ? 'Sign-in was cancelled. You can try again.' : 'Sign-in could not be completed. Please try again.');
      window.history.replaceState(null,'',window.location.pathname);
    }
    void refresh();
    getClient().then(client => {
      if (disposed) return;
      subscription = client.auth.onAuthStateChange(() => {
        clearTimeout(timer);
        timer = setTimeout(() => { if (!disposed) void refresh(); },0);
      }).data.subscription;
    }).catch(() => {});
    return () => { disposed=true; revision.current++; clearTimeout(timer); subscription?.unsubscribe(); };
  }, [suppliedClient]);

  async function authenticate(provider, event) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const client = await getClient();
      const redirectTo = onboardingRedirect();
      // Returning sign-in returns to the normal token-free client route.
      const returningRedirect = new URL('/?view=client', new URL(redirectTo).origin).href;
      const destination = state.invited ? redirectTo : returningRedirect;
      const result = provider === 'google'
        ? await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:destination}})
        : await client.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:destination,shouldCreateUser:state.invited === true}});
      if (result.error) throw new Error('auth failed');
      if (provider === 'email') setMessage('Check your email for the sign-in link. Open it in this browser tab. If it opens elsewhere, reopen your original invitation there.');
    } catch { setMessage('Sign-in could not be started. Please try again.'); }
    finally { setBusy(false); }
  }

  async function complete(event) {
    event.preventDefault();
    if (busy) return;
    const error = validateOnboardingProfile(fields);
    if (error) { setMessage(error); return; }
    if (!state.user?.email || !state.user.email_confirmed_at) { setMessage('Please confirm your email through sign-in before continuing.'); return; }
    setBusy(true); setMessage('');
    try {
      const client = await getClient();
      const token = state.invited ? readInvitationContext() : null;
      if (state.invited && !token) { setState({kind:'terminal',message:invitationMessages.LOST}); return; }
      const {error:rpcError} = await client.rpc(state.invited ? 'accept_client_invitation' : 'complete_my_client_profile',
        state.invited ? {token,profile_fields:fields} : {profile_fields:fields});
      if (rpcError) {
        setMessage('Your account could not be completed. The invitation may have changed, or your details need checking. Please review them and try again.');
        await refresh(); return;
      }
      clearInvitationContext(); await refresh();
    } catch { setMessage('Your account could not be completed just now. Please try again.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    try { const {error} = await (await getClient()).auth.signOut(); if (error) throw new Error(); await refresh(); }
    catch { setMessage('Sign-out could not be completed. Please try again.'); }
    finally { setBusy(false); }
  }
  const manage = () => onMyBookings ? onMyBookings() : window.location.assign('/?view=client&clientStep=my-bookings');
  return <section className="client-access-page" aria-label="Client booking account">
    <span className="client-access-brand">Vad Massage</span>
    <h1>{state.invited ? 'Set up your booking account' : state.kind === 'profile' ? 'Complete your booking account' : 'Your booking account'}</h1>
    {state.kind === 'loading' && <p role="status">Checking your booking access...</p>}
    {state.kind === 'error' && <><p role="alert">I couldn't check your account just now.</p><button onClick={refresh}>Try again</button></>}
    {state.kind === 'terminal' && <><p role="alert">{state.message}</p><a href="/?view=client">Already have an account? Sign in</a></>}
    {state.kind === 'blocked' && <p role="status">Online booking is not currently available for this account. Please contact Vad if you need help with an existing appointment.</p>}
    {state.kind === 'no-access' && <p>Online booking is available by invitation. Please contact Vad on WhatsApp for access, or reopen your original invitation.</p>}
    {state.kind === 'active' && <><p>Your account is ready.</p><a className="client-access-primary" href="/?view=client">Continue to booking</a></>}
    {state.kind === 'sign-in' && <>
      <p>{state.invited ? 'Create your account to arrange appointments with Vad.' : 'Sign in to book or manage your existing appointments. New clients need an invitation from Vad.'}</p>
      <button className="google-login-button" disabled={busy} onClick={()=>authenticate('google')}>Continue with Google</button>
      <button disabled={busy} onClick={()=>setEmailOpen(true)}>Continue with email</button>
      {emailOpen && <form onSubmit={event=>authenticate('email',event)}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)} /></label><button disabled={busy}>Email me a sign-in link</button></form>}
      {state.invited && <a href="/?view=client">Already have an account? Sign in</a>}
    </>}
    {state.kind === 'profile' && <form onSubmit={complete}>
      <p>Signed in as <strong>{state.user.email}</strong></p>
      {state.displayName && <p>Your account name is “{state.displayName}”. Please confirm how your first and last name should appear below.</p>}
      <label>First name<input required maxLength={100} autoComplete="given-name" value={fields.first_name} onChange={event=>setFields({...fields,first_name:event.target.value})} /></label>
      <label>Last name<input required maxLength={100} autoComplete="family-name" value={fields.last_name} onChange={event=>setFields({...fields,last_name:event.target.value})} /></label>
      <label>Mobile number<input required type="tel" autoComplete="tel" maxLength={40} value={fields.mobile} onChange={event=>setFields({...fields,mobile:event.target.value})} /></label>
      <p className="client-access-muted">By completing your account, you acknowledge the <a href="/privacy">Privacy Notice</a> and agree to the <a href="/terms">Terms of Service</a>.</p>
      <button disabled={busy}>{busy ? 'Saving...' : 'Complete account'}</button>
    </form>}
    {message && <p role="alert">{message}</p>}
    <div className="client-access-actions"><button onClick={manage}>My Bookings</button>{state.user && <button disabled={busy} onClick={signOut}>Sign out</button>}</div>
    {import.meta.env.DEV && onSwitchAdmin && <button onClick={onSwitchAdmin}>Admin</button>}
  </section>;
}
