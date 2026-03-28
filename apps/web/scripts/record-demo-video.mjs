#!/usr/bin/env node

import { access, copyFile, mkdir, rename } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000";
const SESSION_ID = process.env.DEMO_SESSION_ID ?? "";
const OUTPUT_DIR = resolve(
  process.cwd(),
  process.env.DEMO_OUTPUT_DIR ?? "demo-output",
);
const OUTPUT_BASENAME = process.env.DEMO_OUTPUT_NAME ?? "halkantir-demo";
const OUTPUT_FORMAT = (process.env.DEMO_OUTPUT_FORMAT ?? "webm").toLowerCase();
const VIEWPORT = {
  width: Number(process.env.DEMO_VIEWPORT_WIDTH ?? 1600),
  height: Number(process.env.DEMO_VIEWPORT_HEIGHT ?? 900),
};
const STEP_PAUSE_MS = Number(process.env.DEMO_STEP_PAUSE_MS ?? 1800);
const SCROLL_PAUSE_MS = Number(process.env.DEMO_SCROLL_PAUSE_MS ?? 900);

const scenes = [
  {
    key: "landing",
    path: "/",
    waitFor: '[data-demo="landing"], main, body',
    action: showcaseLanding,
  },
  ...(SESSION_ID
    ? [
        {
          key: "network",
          path: `/network/${SESSION_ID}`,
          waitFor: "svg, main, body",
          action: showcaseNetwork,
        },
        {
          key: "simulate",
          path: `/simulate/${SESSION_ID}`,
          waitFor: "main, body",
          action: showcaseSimulation,
        },
        {
          key: "report",
          path: `/report/${SESSION_ID}`,
          waitFor: "main, body",
          action: showcaseReport,
        },
      ]
    : []),
];

async function fileExists(pathname) {
  try {
    await access(pathname, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function pause(page, ms) {
  await page.waitForTimeout(ms);
}

async function gotoScene(page, scene) {
  const url = new URL(scene.path, BASE_URL).toString();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(scene.waitFor, { timeout: 15_000 }).catch(() => {});
  await pause(page, STEP_PAUSE_MS);
}

async function smoothScroll(page, amount) {
  await page.mouse.wheel(0, amount);
  await pause(page, SCROLL_PAUSE_MS);
}

async function moveMouseAcross(page, points) {
  for (const [x, y] of points) {
    await page.mouse.move(x, y, { steps: 20 });
    await pause(page, 350);
  }
}

async function showcaseLanding(page) {
  await smoothScroll(page, 420);
  await smoothScroll(page, -420);
  await moveMouseAcross(page, [
    [280, 240],
    [540, 310],
    [920, 240],
  ]);
}

async function showcaseNetwork(page) {
  await moveMouseAcross(page, [
    [340, 250],
    [760, 220],
    [620, 510],
    [980, 360],
  ]);
  await smoothScroll(page, 240);
  await smoothScroll(page, -240);
}

async function showcaseSimulation(page) {
  await moveMouseAcross(page, [
    [300, 220],
    [700, 260],
    [1110, 260],
  ]);
  await smoothScroll(page, 480);
  await smoothScroll(page, -240);
}

async function showcaseReport(page) {
  await smoothScroll(page, 520);
  await smoothScroll(page, -220);
}

async function convertToMp4(sourcePath, targetPath) {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status !== 0) {
    throw new Error("ffmpeg is not installed, so mp4 conversion is unavailable.");
  }

  const result = spawnSync(
    "ffmpeg",
    ["-y", "-i", sourcePath, "-pix_fmt", "yuv420p", targetPath],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    throw new Error(`ffmpeg conversion failed with code ${result.status ?? "?"}.`);
  }
}

async function persistVideo(videoPath) {
  const webmTarget = resolve(OUTPUT_DIR, `${OUTPUT_BASENAME}.webm`);
  const targetExtension = OUTPUT_FORMAT === "mp4" ? "mp4" : "webm";
  const finalTarget = resolve(OUTPUT_DIR, `${OUTPUT_BASENAME}.${targetExtension}`);

  if (OUTPUT_FORMAT === "mp4") {
    await copyFile(videoPath, webmTarget);
    await convertToMp4(webmTarget, finalTarget);
    return finalTarget;
  }

  await rename(videoPath, finalTarget);
  return finalTarget;
}

async function main() {
  if (!SESSION_ID) {
    console.warn(
      "[demo] DEMO_SESSION_ID is not set. Recording landing page only.",
    );
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: OUTPUT_DIR,
      size: VIEWPORT,
    },
  });

  const page = await context.newPage();
  const video = page.video();

  try {
    for (const scene of scenes) {
      console.log(`[demo] capturing ${scene.key}`);
      await gotoScene(page, scene);
      await scene.action(page);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (!video) {
    throw new Error("Playwright did not expose a video handle.");
  }

  const rawVideoPath = await video.path();
  if (!(await fileExists(rawVideoPath))) {
    throw new Error(`Recorded video was not found at ${rawVideoPath}`);
  }

  const finalPath = await persistVideo(rawVideoPath);
  console.log(`[demo] video saved to ${finalPath}`);
}

main().catch((error) => {
  console.error(`[demo] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
