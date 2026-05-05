"use client";

import { ArrowLeft, Crown, Loader2, UserPlus } from "lucide-react";
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

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !email.trim()) {
      setMessage("Enter your email.");
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

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await client.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`
      }
    });
    setIsSubmitting(false);

    if (error) {
      startAuthEmailCooldown("signup", trimmedEmail);
      setMessage(getFriendlyAuthMessage(error.message));
      return;
    }

    startAuthEmailCooldown("signup", trimmedEmail);

    if (data.session) {
      window.location.href = "/";
      return;
    }

    setMessage(
      "Account created. If email confirmation is enabled in Supabase, verify once, then login with your password."
    );
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
              Join the clash
            </p>
            <h1 className="text-3xl font-black text-white">Create account</h1>
          </div>
        </div>

        {message ? (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-zinc-200">
            {message}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={signup}>
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
            placeholder="Minimum 6 characters"
            type="password"
            value={password}
          />
          <AuthInput
            label="Confirm password"
            onChange={setConfirmPassword}
            placeholder="Repeat password"
            type="password"
            value={confirmPassword}
          />
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Create account
          </Button>
        </form>

        <p className="mt-5 text-center text-sm font-semibold text-zinc-400">
          Already registered?{" "}
          <Link className="font-black text-yellow-200" href="/login">
            Login
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
          Signup needs `.env.local` with your Supabase URL and publishable key.
        </p>
      </Card>
    </main>
  );
}
