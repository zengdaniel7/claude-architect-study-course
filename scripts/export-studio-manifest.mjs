import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "course-data.js");
const mediaSourcePath = path.join(root, "video-data.js");
const outputPath = path.join(root, "studio", "src", "content", "course-manifest.json");
const source = fs.readFileSync(sourcePath, "utf8");
const mediaSource = fs.readFileSync(mediaSourcePath, "utf8");
const sandbox = { window: {} };

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: sourcePath, timeout: 1_000 });
vm.runInContext(mediaSource, sandbox, { filename: mediaSourcePath, timeout: 1_000 });

const course = sandbox.window.CCAF_COURSE;
if (!course || !Array.isArray(course.units) || course.units.length !== 23) {
  throw new Error("course-data.js did not expose the expected 23-unit manifest");
}

const media = sandbox.window.CCAF_MEDIA;
if (!media || !media.episodes || !media.clips || !media.playlistUrl) {
  throw new Error("video-data.js did not expose the expected reviewed media library");
}

const clipsByEpisode = new Map(
  Object.values(media.clips).map((clip) => [clip.episode, clip])
);
const videos = Object.entries(media.episodes)
  .filter(([, episode]) => ["used", "reference"].includes(episode.status) && episode.id)
  .map(([episodeKey, episode]) => {
    const clip = clipsByEpisode.get(episodeKey) ?? null;
    return {
      id: episode.id,
      episodeKey,
      number: episode.number,
      title: episode.title,
      channel: episode.channel,
      uploaded: episode.uploaded,
      durationSec: episode.durationSec,
      kind: episode.status === "used" ? "lesson" : "extra",
      lessonIds: episode.lessons,
      focus: clip?.focus ?? episode.note,
      note: episode.note,
      reviewedAt: episode.reviewedAt,
      url: media.youtubeUrl(episode.id, clip?.startSec ?? 0),
      fullUrl: media.youtubeUrl(episode.id, 0),
      thumbnailId: episode.id,
      clip: clip ? {
        id: clip.id,
        startSec: clip.startSec,
        endSec: clip.endSec,
        captionSource: clip.captionSource
      } : null
    };
  });

const manifest = {
  sourceVersion: course.version,
  generatedFrom: "course-data.js",
  units: course.units,
  lessons: course.lessons,
  banks: course.banks,
  cards: course.cards,
  media: {
    generatedFrom: "video-data.js",
    playlistUrl: media.playlistUrl,
    reviewedAt: media.reviewedAt,
    communityNotice: media.communityNotice,
    videos
  }
};

const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== rendered) throw new Error("Studio manifest is stale. Run pnpm run studio:manifest.");
  console.log(`Studio manifest check: ${course.units.length} canonical units match.`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rendered);
  console.log(`Studio manifest: ${course.units.length} units -> ${path.relative(root, outputPath)}`);
}
