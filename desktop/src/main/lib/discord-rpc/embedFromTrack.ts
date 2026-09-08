import { DiscordActivityStatusDisplayType, DiscordActivityType, type DiscordActivity } from "./discord-rpc";

export interface TrackLike {
  videoId?: string; title?: string; author?: string; channelId?: string;
  thumbnail?: string; album?: string; viewCount?: string; lengthSeconds?: string | number;
}

function musicUrl(id: string) { return `https://music.youtube.com/watch?v=${id}`; }
function channelUrl(id: string) { return `https://music.youtube.com/channel/${id}`; }
function albumUrl(name: string) { return `https://music.youtube.com/search?q=${encodeURIComponent(name)}`; }

export function discordEmbedFromTrack(track: TrackLike, playing = true, progressSec = 0): DiscordActivity {
  const start = playing ? new Date(Date.now() - progressSec * 1000) : undefined;
  const end = start && track.lengthSeconds ? new Date(start.getTime() + Number(track.lengthSeconds) * 1000) : undefined;
  const detailsUrl = track.videoId ? musicUrl(track.videoId) : undefined;
  const stateUrl = track.channelId ? channelUrl(track.channelId) : undefined;
  const buttons: DiscordActivity["buttons"] = [
    ...(detailsUrl ? [{ label: "Open in Browser", url: detailsUrl }] : []),
    ...(stateUrl ? [{ label: "View Channel", url: stateUrl }] : []),
  ];
  return {
    type: DiscordActivityType.Listening,
    status_display_type: DiscordActivityStatusDisplayType.State,
    details: track.title || "Unknown",
    details_url: detailsUrl,
    state: track.author || undefined,
    state_url: stateUrl,
    ...(playing && start && end ? { timestamps: { start: start.getTime(), end: end.getTime() } } : {}),
    assets: {
      large_image: track.thumbnail || "logo",
      large_text: track.album || track.title || "Harmonic",
      large_url: track.album ? albumUrl(track.album) : undefined,
      small_image: playing ? "playx1024" : "pausex1024",
      small_text: track.viewCount ? `${Number.parseInt(track.viewCount)?.toLocaleString("de") || track.viewCount} views` : (playing ? "Playing" : "Paused"),
    },
    instance: false,
    buttons: buttons.length ? buttons : undefined,
  };
}
