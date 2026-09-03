const MOBILE_USER_AGENT_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function isMobileUserAgent(userAgent: string | null | undefined) {
  return MOBILE_USER_AGENT_PATTERN.test(userAgent ?? "");
}
