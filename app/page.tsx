"use client";

import type { User } from "@supabase/supabase-js";
import {
  Crown,
  Flame,
  Heart,
  ImagePlus,
  Loader2,
  LogIn,
  LogOut,
  Medal,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Shield,
  Trophy,
  Upload,
  Vote,
  X
} from "lucide-react";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUserSafely } from "@/lib/supabase-auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type MemeEntry = {
  id: string;
  user_id: string;
  creator_name: string;
  title: string;
  image_url: string;
  like_count: number;
  post_day: string;
  created_at: string;
};

type CreatorScore = {
  user_id: string;
  creator_name: string;
  total_likes: number;
  meme_count: number;
};

type Notice = {
  type: "error" | "success" | "info";
  text: string;
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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [memes, setMemes] = useState<MemeEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ownAdminRequest, setOwnAdminRequest] = useState<AdminRequest | null>(
    null
  );
  const [adminReason, setAdminReason] = useState("");
  const [votedMemeId, setVotedMemeId] = useState<string | null>(null);
  const [hasPostedToday, setHasPostedToday] = useState(false);
  const [myTotalLikes, setMyTotalLikes] = useState(0);
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isComposerOpen, setIsComposerOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const todayKey = new Date().toISOString().slice(0, 10);

  const todaysMemes = useMemo(
    () =>
      memes.filter(
        (meme) => (meme.post_day ?? meme.created_at.slice(0, 10)) === todayKey
      ),
    [memes, todayKey]
  );

  const sortedMemes = useMemo(
    () =>
      [...todaysMemes].sort(
        (a, b) =>
          b.like_count - a.like_count ||
          Date.parse(b.created_at) - Date.parse(a.created_at)
      ),
    [todaysMemes]
  );

  const totalVotes = useMemo(
    () => memes.reduce((total, meme) => total + meme.like_count, 0),
    [memes]
  );

  const creatorLeaderboard = useMemo(() => {
    const scores = new Map<string, CreatorScore>();

    for (const meme of memes) {
      const existing = scores.get(meme.user_id);

      if (existing) {
        existing.total_likes += meme.like_count;
        existing.meme_count += 1;
        continue;
      }

      scores.set(meme.user_id, {
        user_id: meme.user_id,
        creator_name: meme.creator_name,
        total_likes: meme.like_count,
        meme_count: 1
      });
    }

    return [...scores.values()]
      .sort(
        (a, b) =>
          b.total_likes - a.total_likes ||
          b.meme_count - a.meme_count ||
          a.creator_name.localeCompare(b.creator_name)
      )
      .slice(0, 5);
  }, [memes]);

  const champion = sortedMemes[0];

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
        await loadArena(currentUser?.id);
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not load your session."
        });
        await loadArena();
      }
      setIsLoading(false);
    }

    void boot();

    const {
      data: { subscription: authSubscription }
    } = client.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      void loadArena(nextUser?.id);
    });

    const arenaChannel = client
      .channel("dank-clash-arena")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "memes" },
        () => void loadArena(user?.id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        () => void loadArena(user?.id)
      )
      .subscribe();

    return () => {
      authSubscription.unsubscribe();
      void client.removeChannel(arenaChannel);
    };
    // Realtime should be registered once; auth changes are handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function loadArena(currentUserId = user?.id) {
    if (!supabase) {
      return;
    }

    const { data: memeRows, error: memeError } = await supabase
      .from("memes")
      .select("*")
      .order("like_count", { ascending: false })
      .order("created_at", { ascending: false });

    if (memeError) {
      setNotice({ type: "error", text: memeError.message });
      return;
    }

    setMemes((memeRows ?? []) as MemeEntry[]);

    if (!currentUserId) {
      setVotedMemeId(null);
      setHasPostedToday(false);
      setMyTotalLikes(0);
      setIsAdmin(false);
      setOwnAdminRequest(null);
      return;
    }

    const { data: voteRow } = await supabase
      .from("votes")
      .select("meme_id")
      .eq("user_id", currentUserId)
      .eq("vote_day", todayKey)
      .maybeSingle();

    setVotedMemeId(voteRow?.meme_id ?? null);

    const userMemes = ((memeRows ?? []) as MemeEntry[]).filter(
      (meme) => meme.user_id === currentUserId
    );

    setHasPostedToday(
      userMemes.some(
        (meme) => (meme.post_day ?? meme.created_at.slice(0, 10)) === todayKey
      )
    );
    setMyTotalLikes(
      userMemes.reduce((total, meme) => total + meme.like_count, 0)
    );

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", currentUserId)
      .maybeSingle();

    setDisplayName(profileRow?.display_name ?? "");

    const { data: adminRow } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", currentUserId)
      .maybeSingle();

    setIsAdmin(Boolean(adminRow));

    const { data: requestRow } = await supabase
      .from("admin_requests")
      .select("*")
      .eq("user_id", currentUserId)
      .maybeSingle();

    setOwnAdminRequest((requestRow as AdminRequest | null) ?? null);
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setVotedMemeId(null);
  }

  async function saveProfile() {
    if (!supabase || !user || !displayName.trim()) {
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName.trim()
    });

    setNotice(
      error
        ? { type: "error", text: error.message }
        : { type: "success", text: "Name saved." }
    );
  }

  async function requestAdminAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user) {
      setNotice({ type: "error", text: "Sign in before applying." });
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.rpc("request_admin_access", {
      p_reason: adminReason
    });
    setIsSubmitting(false);

    if (error) {
      setNotice({ type: "error", text: error.message });
      return;
    }

    setAdminReason("");
    setNotice({
      type: "success",
      text: "Admin request sent. Existing admins can review it."
    });
    await loadArena(user.id);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  async function createMeme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user) {
      setNotice({ type: "error", text: "Sign in before posting a meme." });
      return;
    }

    if (!displayName.trim()) {
      setNotice({ type: "error", text: "Save your display name first." });
      return;
    }

    if (!title.trim() || !selectedFile) {
      setNotice({ type: "error", text: "Add a title and upload an image." });
      return;
    }

    if (hasPostedToday) {
      setNotice({
        type: "error",
        text: "You already posted today's meme. Come back tomorrow with fresh chaos."
      });
      return;
    }

    setIsSubmitting(true);

    const extension = selectedFile.name.split(".").pop() || "png";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("memes")
      .upload(path, selectedFile, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) {
      setNotice({ type: "error", text: uploadError.message });
      setIsSubmitting(false);
      return;
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from("memes").getPublicUrl(path);

    const { error: insertError } = await supabase.from("memes").insert({
      user_id: user.id,
      creator_name: displayName.trim(),
      title: title.trim(),
      image_path: path,
      image_url: publicUrl
    });

    setIsSubmitting(false);

    if (insertError) {
      setNotice({
        type: "error",
        text: insertError.message.includes("memes_one_post_per_user_per_day")
          ? "You can post only one meme per day."
          : insertError.message
      });
      return;
    }

    setTitle("");
    setSelectedFile(null);
    setPreviewUrl("");
    setIsComposerOpen(false);
    setNotice({ type: "success", text: "Meme posted to the arena." });
    await loadArena(user.id);
  }

  async function voteForMeme(memeId: string) {
    if (!supabase || !user) {
      setNotice({ type: "error", text: "Sign in to use your one like." });
      return;
    }

    const targetMeme = memes.find((meme) => meme.id === memeId);

    if (targetMeme?.user_id === user.id) {
      setNotice({
        type: "error",
        text: "Nice try, but the crown has to come from someone else."
      });
      return;
    }

    const { error } = await supabase.rpc("cast_meme_vote", {
      p_meme_id: memeId
    });

    if (error) {
      setNotice({ type: "error", text: error.message });
      return;
    }

    await loadArena(user.id);
  }

  if (!isSupabaseConfigured) {
    return <SetupNeeded />;
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-300 text-zinc-950 shadow-[0_0_32px_rgba(250,204,21,0.3)]">
              <Crown className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-black tracking-wide text-white">
                Dank Clash
              </p>
              <p className="text-xs font-semibold text-zinc-400">
                One like. One winner.
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <a className="rounded-lg px-3 py-2 text-sm font-bold text-zinc-300 hover:bg-white/10" href="#arena">
              Arena
            </a>
            <a className="rounded-lg px-3 py-2 text-sm font-bold text-zinc-300 hover:bg-white/10" href="#leaderboard">
              Leaderboard
            </a>
            {user ? (
              <Button onClick={signOut} variant="secondary">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-lg border border-white/10 bg-zinc-950/75 p-5 shadow-2xl shadow-black/30 sm:p-8">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-300 via-rose-400 to-emerald-300" />
            <div className="grid gap-8 lg:grid-cols-[1fr_260px] lg:items-end">
              <div>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-bold text-yellow-100">
                  <Sparkles className="h-4 w-4" />
                  A one-like roast market for brave meme makers
                </div>
                <h1 className="max-w-3xl text-4xl font-black leading-none text-white sm:text-6xl">
                  Drop your meme into the pit. Let the crowd crown the menace.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">
                  Every player gets one precious like. Spend it on someone
                  else, move it when a better meme appears, and watch the
                  daily leaderboard expose who actually cooked.
                </p>
              </div>

              <Card className="p-4">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
                  Current champion
                </p>
                {champion ? (
                  <div className="mt-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-300 text-zinc-950">
                        <Trophy className="h-6 w-6" />
                      </span>
                      <div>
                        <p className="font-black text-white">
                          {champion.creator_name}
                        </p>
                        <p className="text-sm font-semibold text-zinc-400">
                          {champion.like_count} likes today
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-zinc-300">
                      {champion.title}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm font-semibold leading-6 text-zinc-400">
                    No daily champion yet. The throne is empty and slightly judging you.
                  </p>
                )}
              </Card>
            </div>
          </section>

          {notice ? (
            <div
              className={cn(
                "rounded-lg border px-4 py-3 text-sm font-bold",
                notice.type === "error"
                  ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                  : notice.type === "success"
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                    : "border-white/10 bg-white/[0.06] text-zinc-200"
              )}
            >
              {notice.text}
            </div>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard label="today's memes" value={String(todaysMemes.length)} />
            <StatCard label="all arena likes" value={String(totalVotes)} />
            <StatCard label="your total likes" value={String(myTotalLikes)} />
          </section>

          {isComposerOpen ? (
            <Card className="p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-yellow-200">
                    New entry
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    Upload your meme
                  </h2>
                </div>
                <Button
                  aria-label="Close composer"
                  onClick={() => setIsComposerOpen(false)}
                  size="icon"
                  variant="secondary"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <form className="grid gap-4 lg:grid-cols-[1fr_300px]" onSubmit={createMeme}>
                <div className="space-y-4">
                  <TextField
                    label="Meme title"
                    onChange={setTitle}
                    placeholder="Give it a punchy title"
                    value={title}
                  />

                  <div>
                    <label className="text-sm font-black text-zinc-200">
                      Meme image
                    </label>
                    <label className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/30 px-4 py-6 text-center transition hover:border-yellow-300/50 hover:bg-yellow-300/5">
                      <Upload className="h-7 w-7 text-yellow-200" />
                      <span className="mt-3 text-sm font-black text-white">
                        Click to upload an image
                      </span>
                      <span className="mt-1 text-xs font-semibold text-zinc-500">
                        PNG, JPG, GIF, or WEBP
                      </span>
                      <input
                        accept="image/*"
                        className="sr-only"
                        onChange={handleUpload}
                        type="file"
                      />
                    </label>
                  </div>

                  <Button
                    className="w-full sm:w-auto"
                    disabled={isSubmitting || !user || hasPostedToday}
                    type="submit"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-5 w-5" />
                    )}
                    {hasPostedToday ? "Posted for today" : "Add to arena"}
                  </Button>
                </div>

                <div className="overflow-hidden rounded-lg border border-white/10 bg-black/35">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="Meme preview"
                      className="aspect-square h-full w-full object-cover"
                      src={previewUrl}
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center p-6 text-center text-sm font-bold text-zinc-500">
                      Image preview appears here
                    </div>
                  )}
                </div>
              </form>
            </Card>
          ) : null}

          <section className="space-y-4" id="arena">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-yellow-200">
                  Arena
                </p>
                <h2 className="text-3xl font-black text-white">
                  Today&apos;s entries
                </h2>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void loadArena()} variant="secondary">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button onClick={() => setIsComposerOpen(true)} variant="secondary">
                  <Plus className="h-4 w-4" />
                  Post
                </Button>
              </div>
            </div>

            {isLoading ? (
              <Card className="flex min-h-80 items-center justify-center p-6">
                <Loader2 className="h-8 w-8 animate-spin text-yellow-200" />
              </Card>
            ) : sortedMemes.length > 0 ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {sortedMemes.map((meme, index) => (
                  <MemeCard
                    isSelected={votedMemeId === meme.id}
                    isOwnMeme={user?.id === meme.user_id}
                    key={meme.id}
                    meme={meme}
                    rank={index + 1}
                    voteForMeme={voteForMeme}
                  />
                ))}
              </div>
            ) : (
              <Card className="flex min-h-80 flex-col items-center justify-center p-6 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/[0.06] text-yellow-200">
                  <Flame className="h-8 w-8" />
                </span>
                <h3 className="mt-5 text-2xl font-black text-white">
                  The arena is empty
                </h3>
                <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-zinc-400">
                  Sign in, throw today&apos;s first meme into the pit, and make everyone
                  choose sides.
                </p>
              </Card>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit" id="leaderboard">
          <AuthCard
            displayName={displayName}
            isSubmitting={isSubmitting}
            saveProfile={saveProfile}
            requestAdminAccess={requestAdminAccess}
            adminReason={adminReason}
            isAdmin={isAdmin}
            setDisplayName={setDisplayName}
            setAdminReason={setAdminReason}
            signOut={signOut}
            ownAdminRequest={ownAdminRequest}
            user={user}
            hasPostedToday={hasPostedToday}
            myTotalLikes={myTotalLikes}
            votedMemeId={votedMemeId}
          />

          <Card className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <Trophy className="h-5 w-5 text-yellow-200" />
              <h2 className="text-xl font-black text-white">
                Today&apos;s top memes
              </h2>
            </div>

            {sortedMemes.length > 0 ? (
              <div className="space-y-3">
                {sortedMemes.slice(0, 5).map((meme, index) => (
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border p-3",
                      index === 0
                        ? "border-yellow-300/40 bg-yellow-300/10"
                        : "border-white/10 bg-white/[0.04]"
                    )}
                    key={meme.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-black text-white">
                        {index === 0 ? (
                          <Medal className="h-5 w-5 text-yellow-200" />
                        ) : (
                          `#${index + 1}`
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">
                          {meme.creator_name}
                        </p>
                        <p className="truncate text-xs font-semibold text-zinc-400">
                          {meme.title}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-sm font-black text-yellow-200">
                      <Heart className="h-4 w-4 fill-yellow-200" />
                      {meme.like_count}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-6 text-zinc-400">
                Today&apos;s leaderboard appears as soon as memes are posted.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <Crown className="h-5 w-5 text-emerald-200" />
              <h2 className="text-xl font-black text-white">Top creators</h2>
            </div>

            {creatorLeaderboard.length > 0 ? (
              <div className="space-y-3">
                {creatorLeaderboard.map((creator, index) => (
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border p-3",
                      index === 0
                        ? "border-emerald-300/40 bg-emerald-300/10"
                        : "border-white/10 bg-white/[0.04]"
                    )}
                    key={creator.user_id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-black text-white">
                        {index === 0 ? (
                          <Crown className="h-5 w-5 text-emerald-200" />
                        ) : (
                          `#${index + 1}`
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">
                          {creator.creator_name}
                        </p>
                        <p className="truncate text-xs font-semibold text-zinc-400">
                          {creator.meme_count} memes posted
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-sm font-black text-emerald-200">
                      <Heart className="h-4 w-4 fill-emerald-200" />
                      {creator.total_likes}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-6 text-zinc-400">
                Creator rankings appear after memes start collecting likes.
              </p>
            )}
          </Card>
        </aside>
      </section>
    </main>
  );
}

function SetupNeeded() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-2xl p-6">
        <div className="flex items-center gap-3">
          <Crown className="h-8 w-8 text-yellow-200" />
          <h1 className="text-3xl font-black text-white">
            Connect Supabase first
          </h1>
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-zinc-300">
          Add your keys to `.env.local`, then run the SQL in
          `supabase/schema.sql` inside your Supabase SQL Editor.
        </p>
      </Card>
    </main>
  );
}

function AuthCard({
  adminReason,
  displayName,
  hasPostedToday,
  isAdmin,
  isSubmitting,
  myTotalLikes,
  ownAdminRequest,
  requestAdminAccess,
  saveProfile,
  setAdminReason,
  setDisplayName,
  signOut,
  user,
  votedMemeId
}: {
  adminReason: string;
  displayName: string;
  hasPostedToday: boolean;
  isAdmin: boolean;
  isSubmitting: boolean;
  myTotalLikes: number;
  ownAdminRequest: AdminRequest | null;
  requestAdminAccess: (event: FormEvent<HTMLFormElement>) => void;
  saveProfile: () => void;
  setAdminReason: (value: string) => void;
  setDisplayName: (value: string) => void;
  signOut: () => void;
  user: User | null;
  votedMemeId: string | null;
}) {
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-300 text-zinc-950">
          <LogIn className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
            Sign in
          </p>
          <h2 className="text-xl font-black text-white">Your voter pass</h2>
        </div>
      </div>

      {user ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm font-semibold text-zinc-300">
            Signed in as {user.email}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="likes" value={String(myTotalLikes)} />
            <MiniStat label="vote" value={votedMemeId ? "PLACED" : "FREE"} />
            <MiniStat label="post" value={hasPostedToday ? "DONE" : "OPEN"} />
          </div>
          <TextField
            label="Display name"
            onChange={setDisplayName}
            placeholder="Name shown on your memes"
            value={displayName}
          />
          <Button className="w-full" onClick={saveProfile}>
            <Vote className="h-4 w-4" />
            Save name
          </Button>
          <Button className="w-full" onClick={signOut} variant="secondary">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
          {isAdmin ? (
            <Link
              className="block rounded-lg border border-yellow-300/30 bg-yellow-300/10 px-4 py-3 text-center text-sm font-black text-yellow-100 transition hover:bg-yellow-300/15"
              href="/admin"
            >
              Open moderation dashboard
            </Link>
          ) : (
            <form
              className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
              onSubmit={requestAdminAccess}
            >
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-yellow-200" />
                <p className="text-sm font-black text-white">
                  Apply to become an admin
                </p>
              </div>
              {ownAdminRequest ? (
                <div className="mb-3 rounded-lg bg-black/30 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                    Request status
                  </p>
                  <p className="mt-1 text-sm font-black text-yellow-100">
                    {ownAdminRequest.status}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-zinc-400">
                    {ownAdminRequest.reason}
                  </p>
                </div>
              ) : null}
              <textarea
                className="min-h-28 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-300/70"
                onChange={(event) => setAdminReason(event.target.value)}
                placeholder="Why should you help moderate the arena?"
                value={adminReason}
              />
              <Button
                className="mt-3 w-full"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send request
              </Button>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Link
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-yellow-300 px-4 text-sm font-bold text-zinc-950 shadow-[0_0_24px_rgba(250,204,21,0.24)] transition hover:bg-yellow-200 active:scale-[0.98]"
            href="/login"
          >
              <LogIn className="h-4 w-4" />
              Login
          </Link>
          <Link
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 px-4 text-sm font-bold text-white transition hover:bg-white/12 active:scale-[0.98]"
            href="/signup"
          >
            Create account
          </Link>
        </div>
      )}
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-400">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-center">
      <p className="text-sm font-black text-white">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase text-zinc-500">
        {label}
      </p>
    </div>
  );
}

function TextField({
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
        value={value}
      />
    </div>
  );
}

function MemeCard({
  isOwnMeme,
  isSelected,
  meme,
  rank,
  voteForMeme
}: {
  isOwnMeme: boolean;
  isSelected: boolean;
  meme: MemeEntry;
  rank: number;
  voteForMeme: (memeId: string) => void;
}) {
  return (
    <article
      className={cn(
        "group overflow-hidden rounded-lg border bg-zinc-950/90 shadow-2xl shadow-black/30 transition hover:-translate-y-1",
        isSelected
          ? "border-yellow-300/70 ring-2 ring-yellow-300/30"
          : "border-white/10 hover:border-white/20"
      )}
    >
      <div className="relative flex aspect-[4/5] items-center justify-center bg-[radial-gradient(circle_at_top,#27272a,transparent_34%),linear-gradient(135deg,#09090b,#18181b)] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={meme.title}
          className="max-h-full w-full rounded-md object-contain shadow-2xl shadow-black/40"
          src={meme.image_url}
        />
        <span className="absolute left-4 top-4 rounded-full bg-black/75 px-3 py-1 text-xs font-black text-white backdrop-blur">
          Rank #{rank}
        </span>
        <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-zinc-950 shadow-lg shadow-yellow-300/20">
          <Heart className={cn("h-3.5 w-3.5", isSelected ? "fill-zinc-950" : "")} />
          {meme.like_count}
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-2xl font-black leading-tight text-white">
              {meme.title}
            </h3>
            <p className="mt-1 text-sm font-semibold text-zinc-400">
              by {meme.creator_name}
            </p>
          </div>
        </div>

        <Button
          className={cn(
            "mt-4 w-full",
            isSelected && "bg-emerald-300 hover:bg-emerald-200"
          )}
          disabled={isOwnMeme || isSelected}
          onClick={() => void voteForMeme(meme.id)}
          variant={isSelected ? "default" : "secondary"}
        >
          <Heart className={cn("h-5 w-5", isSelected ? "fill-zinc-950" : "")} />
          {isOwnMeme
            ? "You cannot like your own meme"
            : isSelected
              ? "PLACED"
              : "PLACE VOTE"}
        </Button>
      </div>
    </article>
  );
}
