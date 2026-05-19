const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const templateDir = path.join(repoRoot, "templates", "journal");

function main() {
  const stateDir = process.env.CYBERBOSS_STATE_DIR || path.join(os.homedir(), ".cyberboss");
  const outputDir = path.resolve(process.env.CYBERBOSS_JOURNAL_DIR || path.join(stateDir, "journal"));
  const publicOutputDir = path.join(outputDir, "public");
  const buildDir = path.join(outputDir, "build");

  const timelineStateFile = path.resolve(
    process.env.JOURNAL_TIMELINE_STATE_FILE || path.join(stateDir, "timeline", "timeline-state.json")
  );
  const diaryDir = path.resolve(
    process.env.JOURNAL_DIARY_DIR || path.join(stateDir, "diary")
  );
  const todosFile = resolveTodosFile({ stateDir, buildDir });

  ensureReadableFile(timelineStateFile, "timeline state");
  ensureTemplate();
  fs.rmSync(publicOutputDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });
  fs.cpSync(path.join(templateDir, "public"), publicOutputDir, { recursive: true });

  const diaryInputDir = ensureDiaryInputDir({ diaryDir, buildDir });
  const generatedDataModule = path.join(buildDir, "data.generated.js");
  const runtimeOutFile = path.join(publicOutputDir, "runtime.js");
  const result = spawnSync(process.execPath, [path.join(templateDir, "scripts", "build-runtime.mjs")], {
    cwd: templateDir,
    stdio: "inherit",
    env: {
      ...process.env,
      JOURNAL_SAMPLE_MODE: "0",
      JOURNAL_TIMELINE_STATE_FILE: timelineStateFile,
      JOURNAL_DIARY_DIR: diaryInputDir,
      JOURNAL_TODOS_FILE: todosFile,
      JOURNAL_GENERATED_DATA_MODULE: generatedDataModule,
      JOURNAL_RUNTIME_OUT_FILE: runtimeOutFile,
    },
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return;
  }

  fs.copyFileSync(path.join(templateDir, "LICENSE"), path.join(outputDir, "JOURNAL-LICENSE"));
  console.log(`Journal site built: ${path.join(publicOutputDir, "Journal.html")}`);
}

function ensureTemplate() {
  const required = [
    path.join(templateDir, "scripts", "build-runtime.mjs"),
    path.join(templateDir, "src", "app.jsx"),
    path.join(templateDir, "public", "Journal.html"),
  ];
  for (const filePath of required) {
    ensureReadableFile(filePath, "Journal template");
  }
}

function ensureReadableFile(filePath, label) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function resolveTodosFile({ stateDir, buildDir }) {
  const candidates = [
    process.env.JOURNAL_TODOS_FILE,
    path.join(stateDir, "timeline", "todos.json"),
    path.join(stateDir, "todos.json"),
  ].filter(Boolean).map((filePath) => path.resolve(filePath));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const fallback = path.join(buildDir, "todos.empty.json");
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  fs.writeFileSync(fallback, "{}\n", "utf8");
  return fallback;
}

function ensureDiaryInputDir({ diaryDir, buildDir }) {
  if (fs.existsSync(diaryDir)) {
    return diaryDir;
  }
  const fallback = path.join(buildDir, "empty-diary");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

main();
