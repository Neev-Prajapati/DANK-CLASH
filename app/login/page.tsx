"use client";

import { ArrowLeft, Crown, KeyRound, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getAuthEmailCooldownSeconds,
  getFriendlyAuthMessage,
  startAuthEmailCooldown
} from "@/lib/auth-rate-limit";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !email.trim() || !password) {
      setMessageTone("error");
      setMessage("Enter your email and password.");
      return;
    }
    const client = supabase;

    setIsSubmitting(true);
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setIsSubmitting(false);

    if (error) {
      setMessageTone("error");
      setMessage(
        error.message.includes("Invalid login credentials")
          ? "Email or password is wrong. If you used the old magic-link login, use Set or reset password below."
          : getFriendlyAuthMessage(error.message)
      );
      return;
    }

    window.location.href = "/";
  }

  async function sendResetLink() {
    if (!supabase || !email.trim()) {
      setMessageTone("error");
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
      setMessageTone("error");
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

    if (error) {
      startAuthEmailCooldown("password-reset", trimmedEmail);
      setMessageTone("error");
      setMessage(getFriendlyAuthMessage(error.message));
      return;
    }

    startAuthEmailCooldown("password-reset", trimmedEmail);
    setMessageTone("success");
    setMessage("Password setup link sent. Open it once, set a password, then login normally.");
  }

  if (!isSupabaseConfigured) {
    return <AuthSetupMessage />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-5 sm:p-6">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-black text-zinc-300 hover:text-white"
          href="/"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to arena
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-300 text-zinc-950">
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-yellow-200">
              Welcome back
            </p>
            <h1 className="text-3xl font-black text-white">Login</h1>
          </div>
        </div>

        {message ? (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm font-bold ${
            messageTone === "success"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border-rose-400/30 bg-rose-500/10 text-rose-100"
          }`}>
            {message}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={login}>
          <AuthInput
            label="Email"
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
            value={email}
          />
          <AuthInput
            label="Password"
            onChange={setPassword}
            placeholder="Your password"
            type="password"
            value={password}
          />
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            Login
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

        <p className="mt-5 text-center text-sm font-semibold text-zinc-400">
          New here?{" "}
          <Link className="font-black text-yellow-200" href="/signup">
            Create an account
          </Link>
        </p>
      </Card>
    </main>
  );
}

function AuthInput({
  label,
  onChange,
  placeholder,
  type,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: "email" | "password" | "text";
  value: string;
}) {
  return (
    <div>
      <label className="text-sm font-black text-zinc-200">{label}</label>
      <input
        className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-300/70"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </div>
  );
}

function AuthSetupMessage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-lg p-6">
        <h1 className="text-3xl font-black text-white">Connect Supabase</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-zinc-400">
          Login needs `.env.local` with your Supabase URL and publishable key.
        </p>
      </Card>
    </main>
  );
}
