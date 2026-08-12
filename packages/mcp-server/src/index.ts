import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSisMcpServer } from "./core.js";

async function main() {
  const server = createSisMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SIS MCP server running on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
