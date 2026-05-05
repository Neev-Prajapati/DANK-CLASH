"use client";

import { ArrowLeft, Crown, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }
    const client = supabase;

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await client.auth.updateUser({ password });
    setIsSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password updated. You can login normally now.");
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-lg p-6">
          <h1 className="text-3xl font-black text-white">Connect Supabase</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-zinc-400">
            Password reset needs Supabase environment variables.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-5 sm:p-6">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-black text-zinc-300 hover:text-white"
          href="/login"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-300 text-zinc-950">
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-yellow-200">
              Password setup
            </p>
            <h1 className="text-3xl font-black text-white">Set password</h1>
          </div>
        </div>

        {message ? (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-zinc-200">
            {message}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={updatePassword}>
          <PasswordInput
            label="New password"
            onChange={setPassword}
            placeholder="Minimum 6 characters"
            value={password}
          />
          <PasswordInput
            label="Confirm password"
            onChange={setConfirmPassword}
            placeholder="Repeat password"
            value={confirmPassword}
          />
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Save password
          </Button>
        </form>
      </Card>
    </main>
  );
}

function PasswordInput({
  label,
  onChange,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div>
      <label className="text-sm font-black text-zinc-200">{label}</label>
      <input
        className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-300/70"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="password"
        value={value}
      />
    </div>
  );
}
