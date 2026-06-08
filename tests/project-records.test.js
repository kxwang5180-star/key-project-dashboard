import test from "node:test";
import assert from "node:assert/strict";
import {
  applyProjectBriefSnapshot,
  buildProjectCreateData,
  buildProjectMilestoneCreateData,
  buildProjectMetricCreateData,
  buildProjectBriefUpdatePayload,
  normalizeProjectMilestoneStatus,
  splitMetricCreateDataForUpdate,
  toPublicProjectMaintenanceState,
  toPublicProjectBrief,
} from "../src/services/project-records.js";

test("buildProjectCreateData fills required project fields for admin-created projects", () => {
  assert.deepEqual(
    buildProjectCreateData(
      {
        name: "【飞书机器人测试】项目",
        businessLine: "测试",
      },
      { id: "project_test" }
    ),
    {
      id: "project_test",
      name: "【飞书机器人测试】项目",
      shortName: "飞书机器人测试",
      businessLine: "测试",
      ownerName: null,
      description: "",
      metricsSummary: "",
      keyNodesSummary: "",
      futurePlan: "",
      teamSummary: "",
      established: true,
      isKeyProject: true,
      stage: "PLANNED",
    }
  );
});

test("toPublicProjectBrief maps persisted project brief to frontend shape", () => {
  assert.deepEqual(
    toPublicProjectBrief({
      id: "project_1",
      businessLine: "信息技术部",
      ownerName: "王康旭",
      description: "项目目标和范围",
      teamSummary: "业务负责人：张三；产品负责人：李四",
      stage: "IN_PROGRESS",
      changeSummary: "负责人调整",
    }),
    {
      id: "project_1",
      businessLine: "信息技术部",
      owner: "王康旭",
      overview: "项目目标和范围",
      teamSummary: "业务负责人：张三；产品负责人：李四",
      stage: "IN_PROGRESS",
      changeSummary: "负责人调整",
    }
  );
});

test("buildProjectBriefUpdatePayload maps frontend brief draft to persisted field names", () => {
  assert.deepEqual(
    buildProjectBriefUpdatePayload({
      owner: "  王康旭  ",
      businessLine: "  信息技术部  ",
      overview: "  项目目标和范围  ",
      teamSummary: "  业务负责人：张三；产品负责人：李四  ",
    }),
    {
      ownerName: "王康旭",
      businessLine: "信息技术部",
      description: "项目目标和范围",
      teamSummary: "业务负责人：张三；产品负责人：李四",
    }
  );
});

test("applyProjectBriefSnapshot updates project fields from server brief", () => {
  const project = {
    id: "project_1",
    businessLine: "旧业务线",
    owner: "旧负责人",
    overallText: "旧概览",
    teamText: "旧项目组",
    stage: "PLANNED",
  };

  assert.equal(
    applyProjectBriefSnapshot(project, {
      owner: "王康旭",
      businessLine: "信息技术部",
      overview: "项目目标和范围",
      teamSummary: "业务负责人：张三；产品负责人：李四",
      stage: "IN_PROGRESS",
    }),
    project
  );

  assert.deepEqual(project, {
    id: "project_1",
    businessLine: "信息技术部",
    owner: "王康旭",
    overallText: "项目目标和范围",
    teamText: "业务负责人：张三；产品负责人：李四",
    stage: "IN_PROGRESS",
  });
});

test("toPublicProjectMaintenanceState maps persisted metrics and milestones to frontend shape", () => {
  assert.deepEqual(
    toPublicProjectMaintenanceState({
      id: "project_1",
      metrics: [
        {
          id: "metric_1",
          name: "预算执行",
          currentValue: "80%",
          targetValue: "95%",
          observation: "按月复盘",
          chartType: "ring",
          records: [
            {
              recordDate: new Date("2026-06-01T00:00:00.000Z"),
              value: "70%",
            },
          ],
        },
      ],
      milestones: [
        {
          id: "milestone_1",
          title: "完成联调",
          source: "项目维护",
          rawText: "完成联调",
          dueDate: new Date("2026-06-15T00:00:00.000Z"),
          status: "IN_PROGRESS",
          changeSummary: "日期调整",
        },
      ],
    }),
    {
      projectId: "project_1",
      metrics: [
        {
          id: "metric_1",
          name: "预算执行",
          current: "80%",
          target: "95%",
          observation: "按月复盘",
          chartType: "ring",
          history: [{ date: "2026-06-01", value: "70%" }],
        },
      ],
      milestones: [
        {
          id: "milestone_1",
          title: "完成联调",
          raw: "完成联调",
          source: "项目维护",
          dateKey: "2026-06-15",
          status: "in-progress",
          changeNote: "日期调整",
        },
      ],
    }
  );
});

test("buildProjectMetricCreateData accepts calculation aliases for metric formula", () => {
  assert.equal(
    buildProjectMetricCreateData(
      {
        name: "完成率",
        current: "70%",
        target: "100%",
        calculation: "已完成数量 / 计划总数",
      },
      { projectId: "project_1", index: 0 }
    ).observation,
    "已完成数量 / 计划总数"
  );
});

test("buildProjectMetricCreateData preserves client metric ids and history records", () => {
  assert.deepEqual(
    buildProjectMetricCreateData(
      {
        id: "metric_1",
        name: "预算执行",
        currentValue: "80%",
        targetValue: "95%",
        observation: "按月复盘",
        chartType: "ring",
        history: [
          { date: "2026-06-01", value: "70%" },
          { date: "bad-date", value: "应忽略" },
          { date: "2026-06-02", value: "" },
        ],
      },
      { projectId: "project_1", index: 2 }
    ),
    {
      id: "metric_1",
      projectId: "project_1",
      name: "预算执行",
      currentValue: "80%",
      targetValue: "95%",
      observation: "按月复盘",
      chartType: "ring",
      sortOrder: 2,
      records: {
        createMany: {
          data: [{ recordDate: new Date("2026-06-01T00:00:00.000Z"), value: "70%" }],
        },
      },
    }
  );
});

test("splitMetricCreateDataForUpdate separates nested metric records from update data", () => {
  const metricData = buildProjectMetricCreateData(
    {
      id: "metric_1",
      name: "完成率",
      current: "80%",
      target: "100%",
      history: [{ date: "2026-06-01", value: "80%" }],
    },
    { projectId: "project_1", index: 0 }
  );

  assert.deepEqual(splitMetricCreateDataForUpdate(metricData), {
    data: {
      projectId: "project_1",
      name: "完成率",
      currentValue: "80%",
      targetValue: "100%",
      observation: null,
      chartType: null,
      sortOrder: 0,
    },
    records: [{ recordDate: new Date("2026-06-01T00:00:00.000Z"), value: "80%" }],
  });
});

test("buildProjectMilestoneCreateData ignores invalid date keys instead of creating invalid dates", () => {
  assert.deepEqual(
    buildProjectMilestoneCreateData(
      {
        id: "milestone_1",
        title: "完成联调",
        raw: "完成联调",
        source: "项目维护",
        dateKey: "bad-date",
        status: "in-progress",
        changeNote: "日期待确认",
      },
      { projectId: "project_1", index: 1 }
    ),
    {
      id: "milestone_1",
      projectId: "project_1",
      title: "完成联调",
      source: "项目维护",
      rawText: "完成联调",
      dueDate: null,
      status: "IN_PROGRESS",
      sortOrder: 1,
      changeSummary: "日期待确认",
    }
  );
});

test("buildProjectMilestoneCreateData rejects impossible calendar dates", () => {
  const data = buildProjectMilestoneCreateData(
    {
      title: "完成联调",
      dateKey: "2026-02-31",
    },
    { projectId: "project_1", index: 0 }
  );

  assert.equal(data.dueDate, null);
});

test("normalizeProjectMilestoneStatus accepts frontend milestone status keys", () => {
  assert.equal(normalizeProjectMilestoneStatus("planned"), "PLANNED");
  assert.equal(normalizeProjectMilestoneStatus("doing"), "IN_PROGRESS");
  assert.equal(normalizeProjectMilestoneStatus("in-progress"), "IN_PROGRESS");
  assert.equal(normalizeProjectMilestoneStatus("done"), "COMPLETED");
  assert.equal(normalizeProjectMilestoneStatus("changed"), "CHANGED");
  assert.equal(normalizeProjectMilestoneStatus("OVERDUE"), "OVERDUE");
  assert.equal(normalizeProjectMilestoneStatus("unknown"), "PLANNED");
});
