import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { count } from "drizzle-orm";
import { db } from "./client";
import { loadRootEnv } from "./load-env";
import { education, experience, profile, projects, siteState, siteSettings, skills } from "./schema";
import {
  CV_SOURCE_URL, PREVIEW_FILES, seedEducation, seedExperience, seedProfile, seedProjects, seedSkills,
} from "./seed-data";
import {
  CV_MAX_BYTES, EducationInput, ExperienceInput, ProfileInput, ProjectInput, SkillInput, type UploadResult,
} from "../shared/index";
import {
  educationToRow, experienceToRow, profileToRow, projectToRow, skillToRow,
} from "../server/mappers";
import { saveFile } from "../server/blobs";
import { detectFileType } from "../server/uploads";

type UploadFile = (bytes: Uint8Array, ext: string, contentType: string) => Promise<UploadResult>;
const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Blobs need a site ID and token locally; inside Netlify the runtime supplies them.
const blobsUnavailable = () => !(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) && !process.env.NETLIFY;
const BLOBS_MESSAGE = "Blobs are not configured: set BLOBS_SITE_ID and BLOBS_TOKEN to upload files.";

export const defaultUploadFile: UploadFile = async (bytes, ext, contentType) => {
  if (blobsUnavailable()) throw new Error(BLOBS_MESSAGE);
  return saveFile(bytes, ext, contentType);
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0];

async function storeImage(slug: string, upload: UploadFile): Promise<string | null> {
  try {
    const bytes = new Uint8Array(await readFile(`${ROOT}${PREVIEW_FILES[slug]}`));
    const type = detectFileType(bytes);
    if (!type || !type.contentType.startsWith("image/")) throw new Error("not an image");
    return (await upload(bytes, type.ext, type.contentType)).key;
  } catch (error) {
    console.warn(`Warning: no image stored for ${slug}: ${message(error)}`);
    return null;
  }
}

async function storeCv(fetchCv: typeof fetch, upload: UploadFile): Promise<string | null> {
  try {
    const response = await fetchCv(CV_SOURCE_URL, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`download failed with status ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > CV_MAX_BYTES) throw new Error("file is larger than 4 MB");
    const type = detectFileType(bytes);
    if (type?.contentType !== "application/pdf") throw new Error("the response is not a PDF");
    return (await upload(bytes, type.ext, type.contentType)).key;
  } catch (error) {
    console.warn(`Warning: CV not stored: ${message(error)}`);
    return null;
  }
}

export async function runSeed(opts: {
  force: boolean; fetchCv?: typeof fetch; uploadFile?: UploadFile;
}): Promise<{ skipped: boolean }> {
  if (!opts.force) {
    // Any content row (not only the profile) means the site has data a plain run must not touch.
    for (const table of [profile, projects, experience, education, skills, siteState, siteSettings]) {
      if ((await db.select({ n: count() }).from(table))[0].n > 0) {
        console.log("Seed skipped: content already exists. Run with --force to replace the content.");
        return { skipped: true };
      }
    }
  }
  const upload = opts.uploadFile ?? defaultUploadFile;
  // With the default uploader and no Blobs config nothing can be stored: say so once and skip the downloads.
  const noBlobs = !opts.uploadFile && blobsUnavailable();
  if (noBlobs) console.warn(`Warning: CV and images not stored. ${BLOBS_MESSAGE}`);
  const cvKey = noBlobs ? null : await storeCv(opts.fetchCv ?? fetch, upload);
  const projectRows = [];
  for (const project of seedProjects) {
    const imageKey = noBlobs ? null : await storeImage(project.slug, upload);
    projectRows.push(projectToRow(ProjectInput.parse({
      ...project, imageKey, imageAlt: imageKey ? `Screenshot of ${project.title}` : null,
    })));
  }
  const profileRow = profileToRow(ProfileInput.parse({ ...seedProfile, cvKey }));

  // One batch (one transaction): content rows only. Messages, sessions and login attempts stay.
  await db.batch([
    db.delete(profile), db.delete(projects), db.delete(experience), db.delete(education),
    db.delete(skills), db.delete(siteState), db.delete(siteSettings),
    db.insert(profile).values({ id: 1, ...profileRow }),
    db.insert(projects).values(projectRows),
    db.insert(experience).values(seedExperience.map((row) => experienceToRow(ExperienceInput.parse(row)))),
    db.insert(education).values(seedEducation.map((row) => educationToRow(EducationInput.parse(row)))),
    db.insert(skills).values(seedSkills.map((row) => skillToRow(SkillInput.parse(row)))),
  ]);
  console.log(`Seeded: 1 profile, ${projectRows.length} projects, ${seedExperience.length} experience, `
    + `${seedEducation.length} education, ${seedSkills.length} skills. `
    + `CV ${cvKey ? "stored" : "not stored"}, images ${projectRows.filter((row) => row.imageKey).length}/${projectRows.length} stored.`);
  return { skipped: false };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  loadRootEnv();
  runSeed({ force: process.argv.includes("--force") }).catch((error: unknown) => {
    console.error(`Seed failed: ${message(error)}`);
    process.exitCode = 1;
  });
}
