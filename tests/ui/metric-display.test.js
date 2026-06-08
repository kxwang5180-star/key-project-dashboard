import test from "node:test";
import assert from "node:assert/strict";
import { buildMetricTargetDetail } from "../../src/ui/metric-display.js";

test("buildMetricTargetDetail summarizes target hover details", () => {
  assert.equal(
    buildMetricTargetDetail({
      name: "商分团队洞察分析效率提升",
      current: "",
      target: "上线3个月内提升50%",
      observation: "对比上线前后完成洞察分析所需时间",
    }),
    "商分团队洞察分析效率提升｜目标：上线3个月内提升50%｜计算口径：对比上线前后完成洞察分析所需时间"
  );
});

test("buildMetricTargetDetail omits missing current and target values cleanly", () => {
  assert.equal(
    buildMetricTargetDetail({
      name: "门迎组计件成本",
      current: "-",
      target: "-",
      observation: "统计门迎组对应计件薪酬成本",
    }),
    "门迎组计件成本｜计算口径：统计门迎组对应计件薪酬成本"
  );
});
