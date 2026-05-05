import type { SupabaseClient, User } from "@supabase/supabase-js";

function isInvalidRefreshTokenError(message: string) {
  const lowerMessage = message.toLowerCase();

  return (
    lowerMessage.includes("invalid refresh token") ||
    lowerMessage.includes("refresh token not found")
  );
}

export async function getCurrentUserSafely(
  client: SupabaseClient
): Promise<User | null> {
  const { data, error } = await client.auth.getUser();

  if (!error) {
    return data.user;
  }

  if (isInvalidRefreshTokenError(error.message)) {
    await client.auth.signOut({ scope: "local" });
    return null;
  }

  throw error;
}
