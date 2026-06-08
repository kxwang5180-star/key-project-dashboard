#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DEFAULT_API_PATHS,
  checkDependencyLockfile,
  checkFeishuAccessPolicy,
  checkFeishuCallbackConfig,
  checkFeishuRedirectUri,
  checkFeishuReminderScopes,
  checkFeishuScopes,
  checkRuntimeDependencies,
  checkRequiredEnv,
  checkUrl,
  buildJsonApiCheck,
  summarizeChecks,
} from "../src/lib/preflight-checks.js";

const require = createRequire(import.meta.url);

function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.PREFLIGHT_BASE_URL || process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`,
    skipHttp: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--base-url") args.baseUrl = argv[index + 1] || args.baseUrl;
    if (item === "--skip-http") args.skipHttp = true;
  }
  return args;
}

async function checkApi(baseUrl, path) {
  const url = new URL(path, baseUrl);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    const text = await response.text();
    return buildJsonApiCheck(path, {
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      bodyPreview: text.slice(0, 160),
    });
  } catch (error) {
    return {
      name: `api-json:${path}`,
      ok: false,
      path,
      status: 0,
      contentType: "",
      message: `${path} 请求失败：${error.message}`,
    };
  }
}

function printCheck(check) {
  const mark = check.ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${check.name}: ${check.message}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const checks = [
    checkDependencyLockfile({ exists: existsSync }),
    checkRuntimeDependencies(packageJson.dependencies || {}, {
      resolvePackage: (name) => require.resolve(`${name}/package.json`),
    }),
    checkRequiredEnv(process.env),
    checkUrl("PREFLIGHT_BASE_URL", args.baseUrl),
    checkFeishuRedirectUri(process.env.FEISHU_REDIRECT_URI),
    checkFeishuScopes(process.env.FEISHU_SCOPES),
    checkFeishuReminderScopes(process.env),
    checkFeishuCallbackConfig(process.env),
    checkFeishuAccessPolicy(process.env),
  ];

  if (!args.skipHttp && checks.find((check) => check.name === "PREFLIGHT_BASE_URL")?.ok) {
    for (const path of DEFAULT_API_PATHS) {
      checks.push(await checkApi(args.baseUrl, path));
    }
  }

  for (const check of checks) printCheck(check);
  const summary = summarizeChecks(checks);
  console.log(`Preflight summary: ${summary.passed} passed, ${summary.failed} failed`);
  if (!summary.ok) process.exitCode = 1;
}

await main();
