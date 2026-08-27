export function isSelfSignupEnabled() {
  return process.env.AUTH_SELF_SIGNUP_ENABLED === "true";
}
