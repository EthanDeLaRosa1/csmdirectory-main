import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldAlert, LogIn, Lock } from "lucide-react";

export const CopadoAuthGate = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      validateSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      validateSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const validateSession = (currentSession: any) => {
    if (!currentSession) {
      setSession(null);
      setLoading(false);
      return;
    }

    const email = currentSession.user?.email || "";
    if (email.endsWith("@copado.com")) {
      setSession(currentSession);
      setErrorMsg(null);
    } else {
      supabase.auth.signOut();
      setSession(null);
      setErrorMsg(`Access denied: ${email} is not a valid @copado.com account.`);
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        queryParams: {
          hd: "copado.com", // Restricts Google account picker to @copado.com domains
        },
        redirectTo: window.location.origin,
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-card border border-border p-8 rounded-2xl shadow-xl space-y-6 text-center">
          <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto text-primary">
            <Lock className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Copado Internal Directory</h2>
            <p className="text-xs text-muted-foreground">
              This system contains confidential account intelligence. Sign in with your Copado Google account to continue.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center gap-2 text-left">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground font-semibold py-3 px-4 rounded-xl hover:bg-primary/90 transition shadow-md"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign in with @copado.com</span>
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
