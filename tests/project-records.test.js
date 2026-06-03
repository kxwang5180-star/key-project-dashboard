import test from "node:test";
import assert from "node:assert/strict";
import {
  applyProjectBriefSnapshot,
  buildProjectBriefUpdatePayload,
  toPublicProjectBrief,
} from "../src/services/project-records.js";

test("toPublicProjectBrief maps persisted project brief to frontend shape", () => {
  assert.deepEqual(
    toPublicProjectBrief({
      id: "project_1",
      ownerName: "王康旭",
      description: "项目目标和范围",
      stage: "IN_PROGRESS",
      changeSummary: "负责人调整",
    }),
    {
      id: "project_1",
      owner: "王康旭",
      overview: "项目目标和范围",
      stage: "IN_PROGRESS",
      changeSummary: "负责人调整",
    }
  );
});

test("buildProjectBriefUpdatePayload maps frontend brief draft to persisted field names", () => {
  assert.deepEqual(
    buildProjectBriefUpdatePayload({
      owner: "  王康旭  ",
      overview: "  项目目标和范围  ",
    }),
    {
      ownerName: "王康旭",
      description: "项目目标和范围",
    }
  );
});

test("applyProjectBriefSnapshot updates project fields from server brief", () => {
  const project = {
    id: "project_1",
    owner: "旧负责人",
    overallText: "旧概览",
    stage: "PLANNED",
  };

  assert.equal(
    applyProjectBriefSnapshot(project, {
      owner: "王康旭",
      overview: "项目目标和范围",
      stage: "IN_PROGRESS",
    }),
    project
  );

  assert.deepEqual(project, {
    id: "project_1",
    owner: "王康旭",
    overallText: "项目目标和范围",
    stage: "IN_PROGRESS",
  });
});
