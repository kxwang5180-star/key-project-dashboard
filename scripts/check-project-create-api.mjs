function parseArgs(argv) {
  return {
    baseUrl:
      argv.find((item) => item.startsWith("--base-url="))?.slice("--base-url=".length) ||
      process.env.PUBLIC_BASE_URL ||
      `http://127.0.0.1:${process.env.PORT || 3000}`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = new URL("/api/projects/create", args.baseUrl);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name: "__route_probe__", businessLine: "probe" }),
    });
  } catch (error) {
    console.log(`POST ${url.toString()}`);
    console.log(`连接失败：${error.message}`);
    process.exitCode = 1;
    return;
  }
  const text = await response.text();
  console.log(`POST ${url.toString()}`);
  console.log(`HTTP ${response.status}`);
  console.log(text.slice(0, 500));

  if (response.status === 404 && /API 不存在/.test(text)) {
    process.exitCode = 1;
  }
}

await main();
