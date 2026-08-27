export function isSelfSignupEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_SELF_SIGNUP_ENABLED === "true";
}
