const DEFAULT_COOLDOWN_SECONDS = 90;

function getCooldownKey(action: string, email: string) {
  return `dank-clash:${action}:${email.trim().toLowerCase()}`;
}

export function getFriendlyAuthMessage(message: string) {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("email rate limit") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many")
  ) {
    return "Email limit reached. Wait a few minutes before trying again. For testing, you can turn off Confirm email in Supabase Auth settings.";
  }

  return message;
}

export function getAuthEmailCooldownSeconds(action: string, email: string) {
  if (typeof window === "undefined" || !email.trim()) {
    return 0;
  }

  const cooldownUntil = Number(
    window.localStorage.getItem(getCooldownKey(action, email))
  );

  if (!cooldownUntil || Number.isNaN(cooldownUntil)) {
    return 0;
  }

  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

export function startAuthEmailCooldown(
  action: string,
  email: string,
  seconds = DEFAULT_COOLDOWN_SECONDS
) {
  if (typeof window === "undefined" || !email.trim()) {
    return;
  }

  window.localStorage.setItem(
    getCooldownKey(action, email),
    String(Date.now() + seconds * 1000)
  );
}
