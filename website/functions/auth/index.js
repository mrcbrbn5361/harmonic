export async function onRequest(context) {
  const clientId = context.env.GOOGLE_CLIENT_ID;
  const redirectUri = "https://harmonic-cc5.pages.dev/auth/callback";
  const scope = encodeURIComponent("openid email profile https://www.googleapis.com/auth/youtube.readonly");
  const state = Math.random().toString(36).slice(2);
  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + encodeURIComponent(clientId) + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&response_type=code&scope=" + scope + "&access_type=offline&prompt=consent&state=" + state;
  return Response.redirect(authUrl, 302);
}
