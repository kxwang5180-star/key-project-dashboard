import test from "node:test";
import assert from "node:assert/strict";
import {
  mapBootstrapProjectToSourceRow,
  mergeBootstrapProjects,
} from "../../src/ui/project-bootstrap.js";

test("mapBootstrapProjectToSourceRow maps database project fields to frontend source fields", () => {
  assert.deepEqual(
    mapBootstrapProjectToSourceRow({
      id: "p1",
      name: "重点项目A",
      shortName: "项目A",
      businessLine: "零售",
      description: "当前阶段：试点中\n整体推进稳定",
      metricsSummary: "覆盖率 65%",
      keyNodesSummary: "6月18日 完成试点",
      futurePlan: "7月1日 全量上线",
      teamSummary: "产品：张三\n技术：李四",
      ownerName: "王五",
      established: true,
      isKeyProject: true,
      feishuChatId: "oc_1",
      stage: "IN_PROGRESS",
    }),
    {
      id: "p1",
      name: "重点项目A",
      shortName: "项目A",
      businessLine: "零售",
      overallText: "当前阶段：试点中\n整体推进稳定",
      metricsText: "覆盖率 65%",
      mayKeyNodes: "6月18日 完成试点",
      futureMilestones: "7月1日 全量上线",
      teamText: "产品：张三\n技术：李四",
      owner: "王五",
      established: "是",
      isKeyProject: "是",
      feishuChatId: "oc_1",
      stageCode: "IN_PROGRESS",
    }
  );
});

test("mergeBootstrapProjects replaces static projects with permission-filtered database projects", () => {
  const staticRows = [
    { id: "p1", name: "旧项目", isKeyProject: "是" },
    { id: "p2", name: "无权限项目", isKeyProject: "是" },
  ];
  const bootstrapProjects = [
    { id: "p1", name: "数据库项目", shortName: "DB项目", isKeyProject: true, established: true },
  ];

  assert.deepEqual(mergeBootstrapProjects(staticRows, bootstrapProjects), [
    {
      id: "p1",
      name: "数据库项目",
      shortName: "DB项目",
      businessLine: "",
      overallText: "",
      metricsText: "",
      mayKeyNodes: "",
      futureMilestones: "",
      teamText: "",
      owner: "",
      established: "是",
      isKeyProject: "是",
      feishuChatId: "",
      stageCode: "",
    },
  ]);
});

test("mergeBootstrapProjects keeps an authenticated empty bootstrap result empty", () => {
  assert.deepEqual(
    mergeBootstrapProjects([{ id: "p1", name: "静态项目", isKeyProject: "是" }], [], { preferBootstrap: true }),
    []
  );
});
