export async function onRequest(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (!code) return Response.redirect("https://harmonic-cc5.pages.dev/?error=no_code", 302);
  return Response.redirect("harmonic://auth?code=" + encodeURIComponent(code) + "&state=" + encodeURIComponent(state), 302);
}
