"use client";

import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Check,
  Crown,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Send,
  Shield,
  Trash2,
  UserPlus,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getAuthEmailCooldownSeconds,
  getFriendlyAuthMessage,
  startAuthEmailCooldown
} from "@/lib/auth-rate-limit";
import { getCurrentUserSafely } from "@/lib/supabase-auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type MemeEntry = {
  id: string;
  user_id: string;
  creator_name: string;
  title: string;
  image_path: string;
  image_url: string;
  like_count: number;
  created_at: string;
};

type AdminRequest = {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [memes, setMemes] = useState<MemeEntry[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [ownRequest, setOwnRequest] = useState<AdminRequest | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MemeEntry | null>(null);
  const [message, setMessage] = useState("");

  const sortedMemes = useMemo(
    () =>
      [...memes].sort(
        (a, b) =>
          Date.parse(b.created_at) - Date.parse(a.created_at) ||
          b.like_count - a.like_count
      ),
    [memes]
  );

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;

    async function boot() {
      try {
        const currentUser = await getCurrentUserSafely(client);
        setUser(currentUser);
        await loadAdminState(currentUser);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Could not load your session."
        );
        await loadAdminState(null);
      }
      setIsLoading(false);
    }

    void boot();

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      void loadAdminState(nextUser);
    });

    return () => subscription.unsubscribe();
    // Auth changes call loadAdminState explicitly, so this effect should mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAdminState(currentUser: User | null) {
    if (!supabase || !currentUser) {
      setIsAdmin(false);
      setMemes([]);
      setRequests([]);
      setOwnRequest(null);
      return;
    }

    const { data: adminRow } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    const allowed = Boolean(adminRow);
    setIsAdmin(allowed);

    if (!allowed) {
      setMemes([]);
      setRequests([]);
      await loadOwnRequest(currentUser.id);
      return;
    }

    setOwnRequest(null);
    await loadMemes();
    await loadRequests();
  }

  async function loadMemes() {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("memes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMemes((data ?? []) as MemeEntry[]);
  }

  async function loadRequests() {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase.rpc("list_admin_requests");

    if (error) {
      setMessage(error.message);
      return;
    }

    setRequests((data ?? []) as AdminRequest[]);
  }

  async function loadOwnRequest(userId: string) {
    if (!supabase) {
      return;
    }

    const { data } = await supabase
      .from("admin_requests")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    setOwnRequest((data as AdminRequest | null) ?? null);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !email.trim() || !password) {
      return;
    }
    const client = supabase;

    setIsSubmitting(true);
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setIsSubmitting(false);

    setMessage(error ? getFriendlyAuthMessage(error.message) : "Signed in.");
  }

  async function sendResetLink() {
    if (!supabase || !email.trim()) {
      setMessage("Enter your email first, then request a password link.");
      return;
    }
    const client = supabase;
    const trimmedEmail = email.trim();
    const cooldownSeconds = getAuthEmailCooldownSeconds(
      "password-reset",
      trimmedEmail
    );

    if (cooldownSeconds > 0) {
      setMessage(
        `Wait ${cooldownSeconds} seconds before requesting another password email.`
      );
      return;
    }

    setIsSubmitting(true);
    const { error } = await client.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    setIsSubmitting(false);

    startAuthEmailCooldown("password-reset", trimmedEmail);
    setMessage(
      error
        ? getFriendlyAuthMessage(error.message)
        : "Password setup link sent. Open it once, set a password, then login normally."
    );
  }

  async function signUp() {
    if (!supabase || !email.trim() || password.length < 6) {
      setMessage("Use an email and a password with at least 6 characters.");
      return;
    }
    const client = supabase;
    const trimmedEmail = email.trim();
    const cooldownSeconds = getAuthEmailCooldownSeconds("signup", trimmedEmail);

    if (cooldownSeconds > 0) {
      setMessage(
        `Wait ${cooldownSeconds} seconds before creating this account again.`
      );
      return;
    }

    setIsSubmitting(true);
    const { error } = await client.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/admin`
      }
    });
    setIsSubmitting(false);

    startAuthEmailCooldown("signup", trimmedEmail);
    setMessage(
      error
        ? getFriendlyAuthMessage(error.message)
        : "Account created. Confirm your email once if Supabase requires it, then use your password."
    );
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setMemes([]);
  }

  async function deleteMeme(memeId: string) {
    if (!supabase || !isAdmin) {
      return;
    }
    const client = supabase;

    setIsSubmitting(true);
    const imagePath = pendingDelete?.image_path ?? null;
    const { error } = await client.from("memes").delete().eq("id", memeId);

    setIsSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (imagePath) {
      // The public post should be gone even if storage cleanup has a hiccup.
      await client.storage.from("memes").remove([imagePath]);
    }

    setPendingDelete(null);
    setMessage("Meme removed from the arena.");
    await loadMemes();
  }

  async function requestAdminAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user) {
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.rpc("request_admin_access", {
      p_reason: requestReason
    });
    setIsSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRequestReason("");
    setMessage("Request sent. An admin can review it now.");
    await loadOwnRequest(user.id);
  }

  async function reviewAdminRequest(
    requestId: string,
    decision: "approved" | "rejected"
  ) {
    if (!supabase || !isAdmin) {
      return;
    }

    const { error } = await supabase.rpc("review_admin_request", {
      p_request_id: requestId,
      p_decision: decision
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      decision === "approved"
        ? "Request approved. They are an admin now."
        : "Request rejected."
    );
    await loadRequests();
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-xl p-6">
          <h1 className="text-3xl font-black text-white">Connect Supabase</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-zinc-400">
            The admin room needs `.env.local` and the SQL schema before it can
            moderate memes.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-lg border border-white/10 bg-zinc-950/75 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-300 text-zinc-950">
              <Shield className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-yellow-200">
                Admin room
              </p>
              <h1 className="text-3xl font-black text-white">
                Keep the arena clean
              </h1>
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                Arena
              </Button>
            </Link>
            {user ? (
              <Button onClick={signOut} variant="secondary">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            ) : null}
          </div>
        </header>

        {message ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-zinc-200">
            {message}
          </div>
        ) : null}

        {isLoading ? (
          <Card className="flex min-h-80 items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-yellow-200" />
          </Card>
        ) : !user ? (
          <Card className="mx-auto max-w-md p-5">
            <div className="mb-4 flex items-center gap-3">
              <Crown className="h-6 w-6 text-yellow-200" />
              <h2 className="text-2xl font-black text-white">Admin sign in</h2>
            </div>
            <form className="space-y-3" onSubmit={signIn}>
              <input
                className="h-12 w-full rounded-lg border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-300/70"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                value={email}
              />
              <input
                className="h-12 w-full rounded-lg border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-300/70"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                value={password}
              />
              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Sign in
              </Button>
              <Button
                className="w-full"
                disabled={isSubmitting}
                onClick={() => void signUp()}
                type="button"
                variant="secondary"
              >
                Create account
              </Button>
              <Button
                className="w-full"
                disabled={isSubmitting}
                onClick={() => void sendResetLink()}
                type="button"
                variant="secondary"
              >
                <KeyRound className="h-4 w-4" />
                Set or reset password
              </Button>
            </form>
          </Card>
        ) : !isAdmin ? (
          <Card className="mx-auto max-w-xl p-6">
            <div className="text-center">
              <UserPlus className="mx-auto h-10 w-10 text-yellow-200" />
              <h2 className="mt-4 text-2xl font-black text-white">
                Apply for admin access
              </h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-zinc-400">
                Tell the current admins why you should help moderate Dank Clash.
                If they approve, this account becomes an admin automatically.
              </p>
            </div>

            {ownRequest ? (
              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-zinc-500">
                  Current request
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {ownRequest.status}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">
                  {ownRequest.reason}
                </p>
              </div>
            ) : null}

            <form className="mt-5 space-y-3" onSubmit={requestAdminAccess}>
              <textarea
                className="min-h-32 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-300/70"
                onChange={(event) => setRequestReason(event.target.value)}
                placeholder="Why should you be trusted with delete powers?"
                value={requestReason}
              />
              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send admin request
              </Button>
            </form>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-3">
                <UserPlus className="h-5 w-5 text-yellow-200" />
                <h2 className="text-2xl font-black text-white">
                  Admin requests
                </h2>
              </div>

              {requests.length > 0 ? (
                <div className="space-y-3">
                  {requests.map((request) => (
                    <div
                      className="rounded-lg border border-white/10 bg-white/[0.04] p-4"
                      key={request.id}
                    >
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="font-black text-white">
                            {request.display_name || request.email}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-zinc-500">
                            {request.email} / {request.status}
                          </p>
                        </div>
                        <p className="text-xs font-bold text-zinc-500">
                          {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="mt-3 text-sm font-semibold leading-6 text-zinc-300">
                        {request.reason}
                      </p>
                      {request.status === "pending" ? (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <Button
                            onClick={() =>
                              void reviewAdminRequest(request.id, "approved")
                            }
                          >
                            <Check className="h-4 w-4" />
                            Accept
                          </Button>
                          <Button
                            onClick={() =>
                              void reviewAdminRequest(request.id, "rejected")
                            }
                            variant="secondary"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-zinc-400">
                  No admin requests yet.
                </p>
              )}
            </Card>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedMemes.map((meme) => (
                <article
                  className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950/85 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-white/20"
                  key={meme.id}
                >
                  <div className="flex aspect-[4/5] items-center justify-center bg-[radial-gradient(circle_at_top,#27272a,transparent_34%),linear-gradient(135deg,#09090b,#18181b)] p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={meme.title}
                    className="max-h-full w-full rounded-md object-contain shadow-2xl shadow-black/40"
                    src={meme.image_url}
                  />
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <h2 className="truncate text-xl font-black text-white">
                        {meme.title}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-zinc-400">
                        by {meme.creator_name}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold text-zinc-400">
                      <span>{meme.like_count} likes</span>
                      <span>
                        {new Date(meme.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <Button
                      className="w-full bg-rose-400 hover:bg-rose-300"
                      onClick={() => setPendingDelete(meme)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete violation
                    </Button>
                  </div>
                </article>
              ))}

              {sortedMemes.length === 0 ? (
                <Card className="col-span-full flex min-h-72 items-center justify-center p-6 text-center">
                  <p className="text-sm font-semibold text-zinc-400">
                    No memes to moderate yet.
                  </p>
                </Card>
              ) : null}
            </section>
          </div>
        )}
      </div>

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={pendingDelete.title}
              className="aspect-[16/9] w-full bg-black object-contain"
              src={pendingDelete.image_url}
            />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-rose-400 text-zinc-950">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-2xl font-black text-white">
                    Delete this meme?
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">
                    This removes the post, all votes on it, and the uploaded
                    image from storage.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <p className="font-black text-white">{pendingDelete.title}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-400">
                  by {pendingDelete.creator_name}
                </p>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Button
                  disabled={isSubmitting}
                  onClick={() => void deleteMeme(pendingDelete.id)}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </Button>
                <Button
                  disabled={isSubmitting}
                  onClick={() => setPendingDelete(null)}
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
